import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentActivityStore, parseObserverFrame } from "@/features/chat/lib/agent-activity";
import { AgentActivityIndicator } from "@/features/chat/ui/AgentActivityIndicator";
import { AgentActivityPanel } from "@/features/chat/ui/AgentActivityPanel";

const AGENT = "2".repeat(64);
const CHANNEL = "channel-one";
const profiles = {
  [AGENT]: {
    pubkey: AGENT,
    name: "Sophia",
    about: "",
    picture: null,
    isAgent: true,
  },
};

function activityStore() {
  const store = new AgentActivityStore();
  const frame = parseObserverFrame({
    seq: 1,
    timestamp: "2026-08-09T12:00:00.000Z",
    kind: "acp_read",
    channelId: CHANNEL,
    sessionId: "session-fixture",
    turnId: "turn-fixture",
    payload: {
      method: "session/update",
      params: {
        update: {
          sessionUpdate: "tool_call_update",
          status: "completed",
          title: "shell",
          rawInput: { command: "npm test" },
          rawOutput: "86 tests passed",
        },
      },
    },
  });
  if (!frame) throw new Error("fixture frame must be valid");
  store.ingest(AGENT, frame, 1_000);
  return store;
}

describe("agent activity UI", () => {
  it("shows the concrete current command in the compact indicator", () => {
    const store = activityStore();
    const statuses = store.getStatuses(CHANNEL, [AGENT], "connected", true, 1_100);
    const html = renderToStaticMarkup(
      <AgentActivityIndicator
        itemCount={1}
        profiles={profiles}
        statuses={statuses}
        onOpen={() => undefined}
      />,
    );

    expect(html).toContain("Sophia: Using a tool — npm test");
    expect(html).toContain("View activity");
  });

  it("shows command output with one panel-level Activity and JSON switch", () => {
    const store = activityStore();
    const items = store.getItems(CHANNEL, [AGENT]);
    const statuses = store.getStatuses(CHANNEL, [AGENT], "connected", true, 1_100);
    const html = renderToStaticMarkup(
      <AgentActivityPanel
        items={items}
        maximumWidth={720}
        minimumWidth={320}
        panelWidth={420}
        profiles={profiles}
        statuses={statuses}
        onClose={() => undefined}
        onResize={() => undefined}
      />,
    );

    expect(html).toContain("npm test");
    expect(html).toContain("86 tests passed");
    expect(html).toContain("Activity view");
    expect(html).toContain("Activity");
    expect(html).toContain("JSON");
    expect(html).not.toContain("Show JSON");
  });
});
