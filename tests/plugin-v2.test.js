import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, jest, test } from "@jest/globals";
import plugin from "../src/index.js";

const fixtures = [];
const turn = () => new Promise(resolve => setImmediate(resolve));
const assistant = (id, text) => ({
  id, type: "assistant", agent: "workflow_runner", time: { completed: 2 },
  content: [{ type: "reasoning", text: "private reasoning" }, { type: "text", text }]
});

async function fixture(teamMode) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-v2-")));
  const location = { directory };
  if (teamMode) {
    fs.mkdirSync(path.join(directory, ".nomadworks"));
    fs.writeFileSync(path.join(directory, ".nomadworks", "nomadworks.yaml"),
      `enabled: true\nteam_mode: ${teamMode}\ndefaults:\n  model: openai/gpt-example#test\n`);
  }
  const sessions = new Map([["pma", { id: "pma", agent: "product_manager", location }]]);
  const messages = new Map();
  const waits = new Map();
  const pendingEvents = [];
  let wake;
  let agentTransform, toolTransform;
  let tools, agents, defaultAgent, subscriptionSignal;
  let sequence = 0;
  const ctx = {
    location,
    agent: {
      async transform(fn) { agentTransform = fn; await this.reload(); },
      async reload() {
        agents = new Map([
          ["build", { id: "build" }],
          ["title", { id: "title", hidden: true }]
        ]);
        agentTransform({
          list: () => [...agents.values()],
          remove: id => agents.delete(id),
          default: id => { defaultAgent = id; },
          update(id, edit) {
            const agent = agents.get(id) || { id, permissions: [] };
            edit(agent);
            agents.set(id, agent);
          }
        });
      }
    },
    tool: {
      async transform(fn) { toolTransform = fn; await this.reload(); },
      async reload() {
        tools = new Map();
        toolTransform({ add: tool => tools.set(tool.name, tool) });
      }
    },
    session: {
      get: jest.fn(async ({ sessionID }) => sessions.get(sessionID)),
      create: jest.fn(async input => {
        const session = { ...input, id: `child-${++sequence}` };
        sessions.set(session.id, session);
        return session;
      }),
      prompt: jest.fn(async ({ sessionID, text }) => {
        const message = { id: `prompt-${++sequence}`, type: "user", text };
        messages.set(sessionID, [...(messages.get(sessionID) || []), message]);
        return { id: message.id };
      }),
      context: jest.fn(async ({ sessionID }) => messages.get(sessionID) || []),
      wait: jest.fn(({ sessionID }, { signal } = {}) => new Promise((resolve, reject) => {
        waits.set(sessionID, resolve);
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }))
    },
    event: {
      async *subscribe({ signal }) {
        subscriptionSignal = signal;
        signal.addEventListener("abort", () => wake?.(), { once: true });
        while (!signal.aborted) {
          if (pendingEvents.length) yield pendingEvents.shift();
          else await new Promise(resolve => { wake = resolve; });
        }
      }
    }
  };
  const cleanup = await plugin.setup(ctx);
  fixtures.push({ directory, cleanup });
  return {
    directory, ctx, sessions, messages,
    get agents() { return agents; },
    get tools() { return tools; },
    get defaultAgent() { return defaultAgent; },
    get subscriptionSignal() { return subscriptionSignal; },
    cleanup,
    execute: (name, args, sessionID = "pma") =>
      tools.get(name).execute(args, { sessionID, agent: sessions.get(sessionID)?.agent }),
    async emit(type, data) {
      pendingEvents.push({ type, data, location });
      wake?.();
      await turn();
    },
    async finish(sessionID, outcome, summary) {
      sessions.get(sessionID).outcome = outcome;
      if (summary) messages.get(sessionID).push(assistant(`reply-${++sequence}`, summary));
      waits.get(sessionID)?.();
      await turn();
    }
  };
}

afterEach(async () => {
  for (const { directory, cleanup } of fixtures.splice(0)) {
    cleanup();
    await turn();
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test.each(["mini", "full"])("init reloads the catalogs for %s mode", async mode => {
  const f = await fixture();
  expect(f.defaultAgent).toBe("product_manager");
  expect([...f.agents.keys()]).toEqual(["title", "product_manager"]);
  expect(f.tools.has("nomadflow_run_workflow")).toBe(false);
  expect((await f.execute("nomadworks_init", { team_mode: mode })).content).toContain(`'${mode}'`);
  expect(f.agents.has("business_analyst")).toBe(true);
  expect(f.agents.has("workflow_runner")).toBe(mode === "full");
  expect(f.tools.size).toBe(mode === "full" ? 6 : 4);
  f.cleanup();
  expect(f.subscriptionSignal.aborted).toBe(true);
});

test("queues follow-ups for the owning PMA and reports the latest completed reply once", async () => {
  const f = await fixture("full");
  expect(f.agents.get("product_manager").model).toEqual({ providerID: "openai", id: "gpt-example", variant: "test" });
  const args = { task_path: "tasks/demo.md", instructions: "Implement the approved change" };
  const runs = await Promise.all([f.execute("nomadflow_run_workflow", args), f.execute("nomadflow_run_workflow", args)]);
  expect(runs.map(result => result.content.slice(0, 4)).sort()).toEqual(["FAIL", "SUCC"]);
  const [runnerID] = [...f.sessions.keys()].filter(id => id !== "pma");
  expect(f.messages.get("pma")).toBeUndefined();
  f.sessions.set("other", { ...f.sessions.get("pma"), id: "other" });
  expect((await f.execute("nomadflow_prompt_workflow", { session_id: runnerID, text: "Not the owner" }, "other")).content).toContain("not a Workflow Runner owned");
  expect((await f.execute("nomadflow_prompt_workflow", { session_id: runnerID, text: "Follow-up" })).content).toContain("SUCCESS");
  await f.finish(runnerID, "succeeded", "Work verified.");
  // The monitor rechecks after the latest admitted input if a follow-up arrived while it was waiting.
  await f.finish(runnerID, "succeeded");
  expect(f.messages.get("pma").map(message => message.text)).toEqual([
    expect.stringContaining("FINAL SUMMARY FROM RUNNER:\nWork verified.")
  ]);
  expect(f.messages.get("pma")[0].text).not.toContain("private reasoning");
});

test.each(["failed", "interrupted"])("reports %s execution without claiming success", async outcome => {
  const f = await fixture("full");
  await f.execute("nomadflow_run_workflow", { task_path: "tasks/demo.md", instructions: "Example" });
  const [runnerID] = [...f.sessions.keys()].filter(id => id !== "pma");
  await f.finish(runnerID, outcome);
  expect(f.messages.get("pma")).toHaveLength(1);
  expect(f.messages.get("pma")[0].text).toContain(`did not complete tasks/demo.md: ${outcome}`);
});

test("backfills, records completed discussion text once, and only archives a verified summary", async () => {
  const f = await fixture("mini");
  f.messages.set("pma", [{ id: "earlier", type: "user", text: "Earlier context" }]);
  const start = await f.execute("nomadworks_start_discussion", { title: "Test discussion", previous_message_count: 1 });
  expect(start.content).toContain("Backfilled messages: 1");
  const transcript = path.join(f.directory, ".nomadworks/runtime/discussions/DISCUSSION-001-transcript.md");
  f.messages.get("pma").push(assistant("step-message", "A visible reply."));
  await f.emit("session.step.ended", { sessionID: "pma", assistantMessageID: "step-message" });
  await f.emit("session.step.ended", { sessionID: "pma", assistantMessageID: "step-message" });
  await f.emit("session.inbox.delivered", { sessionID: "pma", inboxID: "earlier" });
  expect(fs.readFileSync(transcript, "utf8").match(/A visible reply\./g)).toHaveLength(1);
  expect(fs.readFileSync(transcript, "utf8").match(/Earlier context/g)).toHaveLength(1);
  const missing = f.execute("nomadworks_stop_discussion", {});
  await turn();
  await f.finish("child-1", "succeeded");
  expect((await missing).content).toContain("summary was not written");
  expect(fs.existsSync(transcript)).toBe(true);
  const close = f.execute("nomadworks_stop_discussion", {});
  await turn();
  const summarizer = [...f.sessions.values()].at(-1);
  expect(summarizer.agent).toBe("business_analyst");
  fs.writeFileSync(path.join(f.directory, "tasks/discussions/DISCUSSION-001-test-discussion.md"), "Verified summary");
  await f.finish(summarizer.id, "succeeded");
  expect((await close).content).toContain("Status: closed");
  expect(fs.existsSync(transcript)).toBe(false);
  expect(fs.existsSync(path.join(path.dirname(transcript), "archive", path.basename(transcript)))).toBe(true);
});
