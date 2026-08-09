import { describe, expect, it } from "vitest";
import {
  AgentActivityStore,
  classifyObserverFrame,
  describeObserverFrame,
  parseObserverFrame,
  unwrapObserverBatch,
  validateObserverEvent,
} from "@/features/chat/lib/agent-activity";
import type { NostrEvent } from "@/shared/api/nostr-types";

const OWNER = "1".repeat(64);
const AGENT = "2".repeat(64);
const OTHER_AGENT = "3".repeat(64);
const CHANNEL = "channel-one";

function requiredFrame(overrides: Record<string, unknown> = {}) {
  const value = frame(overrides);
  if (!value) throw new Error("fixture frame must be valid");
  return value;
}

function event(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "a".repeat(64),
    kind: 24200,
    pubkey: AGENT,
    created_at: 1,
    tags: [
      ["p", OWNER],
      ["agent", AGENT],
      ["frame", "telemetry"],
    ],
    content: "ciphertext",
    sig: "b".repeat(128),
    ...overrides,
  };
}

function frame(overrides: Record<string, unknown> = {}) {
  return parseObserverFrame({
    seq: 1,
    timestamp: "2026-08-09T12:00:00.000Z",
    kind: "turn_started",
    channelId: CHANNEL,
    sessionId: "session-fixture",
    turnId: "turn-fixture",
    payload: null,
    ...overrides,
  });
}

describe("live agent activity protocol", () => {
  it("requires owner, agent, frame tags and a matching signed agent", () => {
    expect(validateObserverEvent(event(), OWNER)).toBe(AGENT);
    expect(validateObserverEvent(event({ pubkey: OTHER_AGENT }), OWNER)).toBeNull();
    expect(
      validateObserverEvent(
        event({
          tags: [
            ["p", "9".repeat(64)],
            ["agent", AGENT],
            ["frame", "telemetry"],
          ],
        }),
        OWNER,
      ),
    ).toBeNull();
    expect(
      validateObserverEvent(
        event({
          tags: [
            ["p", OWNER],
            ["agent", AGENT],
            ["frame", "other"],
          ],
        }),
        OWNER,
      ),
    ).toBeNull();
  });

  it("unwraps valid batches and preserves malformed envelopes as one safe frame", () => {
    const batch = frame({
      kind: "batch",
      payload: {
        events: [
          {
            seq: 2,
            timestamp: "2026-08-09T12:00:01Z",
            kind: "turn_liveness",
            channelId: CHANNEL,
            payload: null,
          },
          {
            seq: 3,
            timestamp: "2026-08-09T12:00:02Z",
            kind: "turn_completed",
            channelId: CHANNEL,
            payload: null,
          },
        ],
      },
    });
    expect(batch).not.toBeNull();
    expect(unwrapObserverBatch(batch ?? requiredFrame())).toHaveLength(2);
    const malformed = frame({ kind: "batch", payload: { nope: true } });
    expect(unwrapObserverBatch(malformed ?? requiredFrame())).toHaveLength(1);
  });

  it("deduplicates frames and scopes statuses to the active channel", () => {
    const store = new AgentActivityStore();
    const first = frame({ seq: 1, channelId: CHANNEL });
    const otherChannel = frame({ seq: 2, channelId: "channel-two" });
    expect(store.ingest(AGENT, first ?? requiredFrame(), 1_000)).toBe(true);
    expect(store.ingest(AGENT, first ?? requiredFrame(), 1_001)).toBe(false);
    expect(store.ingest(AGENT, otherChannel ?? requiredFrame(), 1_002)).toBe(true);
    expect(store.getStatuses(CHANNEL, [AGENT], "connected", true, 1_003)[0]?.state).toBe("working");
    expect(store.getStatuses("channel-three", [AGENT], "connected", true, 1_003)).toEqual([]);
  });

  it("transitions fresh activity to quiet without calling silence a stall", () => {
    const store = new AgentActivityStore();
    store.ingest(AGENT, requiredFrame({ kind: "turn_liveness" }), 10_000);
    expect(store.getStatuses(CHANNEL, [AGENT], "connected", true, 10_500)[0]).toMatchObject({
      state: "working",
      detail: "fresh",
    });
    expect(store.getStatuses(CHANNEL, [AGENT], "connected", true, 30_000)[0]).toMatchObject({
      state: "quiet",
      detail: "silent",
    });
    expect(store.getStatuses(CHANNEL, [AGENT], "reconnecting", true, 30_000)[0]?.state).toBe(
      "reconnecting",
    );
    expect(store.getStatuses(CHANNEL, [AGENT], "disconnected", true, 30_000)[0]?.state).toBe(
      "disconnected",
    );
  });

  it("classifies only lifecycle categories from encrypted frame structure", () => {
    expect(
      classifyObserverFrame(
        requiredFrame({
          kind: "acp_read",
          payload: {
            params: { update: { sessionUpdate: "agent_thought_chunk", content: "private" } },
          },
        }),
      ),
    ).toBe("thinking");
    expect(
      classifyObserverFrame(
        requiredFrame({
          kind: "acp_read",
          payload: { params: { update: { sessionUpdate: "tool_call", arguments: "private" } } },
        }),
      ),
    ).toBe("tool");
    expect(
      classifyObserverFrame(
        requiredFrame({
          kind: "acp_read",
          payload: {
            params: { update: { sessionUpdate: "agent_message_chunk", content: "private" } },
          },
        }),
      ),
    ).toBe("responding");
  });

  it("surfaces concrete shell commands and output for transparent execution tracing", () => {
    const shellFrame = requiredFrame({
      kind: "acp_read",
      payload: {
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "tool_call_update",
            status: "completed",
            title: "shell",
            rawInput: { command: 'rg -n "observer" web/src' },
            rawOutput: "web/src/example.ts:1:observer",
          },
        },
      },
    });

    expect(describeObserverFrame(shellFrame)).toMatchObject({
      state: "tool",
      title: "shell",
      detail: 'rg -n "observer" web/src',
      output: "web/src/example.ts:1:observer",
    });
  });

  it("routes unscoped frames only through a trusted turn or session channel correlation", () => {
    const store = new AgentActivityStore();
    store.ingest(AGENT, requiredFrame({ seq: 1, channelId: CHANNEL }), 1_000);
    expect(
      store.ingest(
        AGENT,
        requiredFrame({
          seq: 2,
          channelId: null,
          payload: {
            method: "session/update",
            params: {
              update: {
                sessionUpdate: "tool_call",
                title: "shell",
                rawInput: { command: "npm test" },
              },
            },
          },
        }),
        1_100,
      ),
    ).toBe(true);
    expect(
      store.ingest(
        AGENT,
        requiredFrame({
          seq: 3,
          channelId: null,
          turnId: "unrelated-turn",
          sessionId: "unrelated-session",
        }),
        1_200,
      ),
    ).toBe(false);

    const channelItems = store.getItems(CHANNEL, [AGENT]);
    expect(channelItems).toHaveLength(2);
    expect(channelItems[1]?.presentation.detail).toBe("npm test");
    expect(store.getStatuses(CHANNEL, [AGENT], "connected", true, 1_300)[0]?.summary).toBe(
      "npm test",
    );
    expect(store.getItems("other-private-channel", [AGENT])).toEqual([]);
    expect(store.getItems(CHANNEL, [OTHER_AGENT])).toEqual([]);
  });
});
