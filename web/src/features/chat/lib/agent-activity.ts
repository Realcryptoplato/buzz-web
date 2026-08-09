import type { NostrEvent, RelayConnectionState } from "@/shared/api/nostr-types";

export const AGENT_OBSERVER_FRAME_KIND = 24200;
export const OBSERVER_FRESHNESS_MS = 12_000;
export const OBSERVER_VISIBLE_QUIET_MS = 45_000;
export const OBSERVER_PENDING_TTL_MS = 120_000;
const MAX_RECORDS = 128;
const MAX_DEDUPE_KEYS = 512;
const MAX_SUBMISSIONS = 128;

export type ObserverFrame = {
  seq: number;
  timestamp: string;
  kind: string;
  channelId: string | null;
  sessionId: string | null;
  turnId: string | null;
  payload: unknown;
};

export type ActivityState =
  | "working"
  | "thinking"
  | "tool"
  | "responding"
  | "quiet"
  | "reconnecting"
  | "disconnected"
  | "unavailable";

export type ActivityDetail = "fresh" | "waiting" | "silent" | "connection" | "signer";

export type AgentActivityStatus = {
  agentPubkey: string;
  state: ActivityState;
  detail: ActivityDetail;
};

type ActivityRecord = {
  agentPubkey: string;
  frame: ObserverFrame;
  receivedAt: number;
};

function normalized(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return candidate || null;
}

function tagValue(event: NostrEvent, name: string): string | null {
  const tag = event.tags.find((candidate) => candidate[0] === name);
  return typeof tag?.[1] === "string" ? tag[1] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Validate only the signed envelope; encrypted content is parsed after decrypting. */
export function validateObserverEvent(event: NostrEvent, ownerPubkey: string): string | null {
  if (event.kind !== AGENT_OBSERVER_FRAME_KIND || typeof event.content !== "string") return null;
  const owner = normalized(ownerPubkey);
  const agent = normalized(tagValue(event, "agent"));
  const frame = normalized(tagValue(event, "frame"));
  const recipient = normalized(tagValue(event, "p"));
  if (
    !owner ||
    !/^[0-9a-f]{64}$/.test(owner) ||
    !agent ||
    !/^[0-9a-f]{64}$/.test(agent) ||
    frame !== "telemetry" ||
    recipient !== owner
  ) {
    return null;
  }
  return normalized(event.pubkey) === agent ? agent : null;
}

export function parseObserverFrame(value: unknown): ObserverFrame | null {
  if (!isRecord(value)) return null;
  const timestamp = optionalString(value.timestamp);
  const kind = optionalString(value.kind);
  if (
    typeof value.seq !== "number" ||
    !Number.isSafeInteger(value.seq) ||
    value.seq < 0 ||
    !timestamp ||
    !kind ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    return null;
  }
  return {
    seq: value.seq,
    timestamp,
    kind,
    channelId: optionalString(value.channelId),
    sessionId: optionalString(value.sessionId),
    turnId: optionalString(value.turnId),
    payload: value.payload,
  };
}

/** Expand the observer pacer's batch envelope without retaining the envelope itself. */
export function unwrapObserverBatch(frame: ObserverFrame): ObserverFrame[] {
  if (frame.kind.toLowerCase() !== "batch") return [frame];
  const events = isRecord(frame.payload) ? frame.payload.events : null;
  if (!Array.isArray(events)) return [frame];
  const inner = events
    .map(parseObserverFrame)
    .filter((candidate): candidate is ObserverFrame => Boolean(candidate));
  return inner.length ? inner : [frame];
}

function payloadString(value: unknown, key: string): string | null {
  return isRecord(value) ? optionalString(value[key]) : null;
}

/** Map wire kinds to non-sensitive lifecycle categories only. */
export function classifyObserverFrame(
  frame: ObserverFrame,
): Exclude<ActivityState, "reconnecting" | "disconnected" | "unavailable"> {
  const kind = frame.kind.toLowerCase();
  if (["turn_completed", "turn_error", "agent_panic"].includes(kind)) return "quiet";
  if (
    ["turn_started", "session_resolved", "turn_liveness", "session_config_captured"].includes(kind)
  ) {
    return "working";
  }

  const payload = frame.payload;
  const method = payloadString(payload, "method");
  const params = isRecord(payload) ? payload.params : null;
  const update = isRecord(params) ? params.update : null;
  const updateType = payloadString(update, "sessionUpdate");
  if (updateType === "agent_thought_chunk") return "thinking";
  if (updateType === "agent_message_chunk") return "responding";
  if (updateType === "tool_call" || updateType === "tool_call_update") return "tool";
  if (method === "session/prompt" || method === "session/update") return "working";
  return kind.includes("thought") ? "thinking" : kind.includes("tool") ? "tool" : "working";
}

function compareFrames(left: ObserverFrame, right: ObserverFrame): number {
  const leftTime = Date.parse(left.timestamp);
  const rightTime = Date.parse(right.timestamp);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.seq - right.seq;
}

function recordKey(agentPubkey: string, channelId: string | null): string {
  return `${agentPubkey}|${channelId ?? "*"}`;
}

function submissionKey(agentPubkey: string, channelId: string): string {
  return `${agentPubkey}|${channelId}`;
}

export class AgentActivityStore {
  private readonly records = new Map<string, ActivityRecord>();
  private readonly dedupeKeys = new Set<string>();
  private readonly submissions = new Map<string, number>();

  markSubmitted(
    channelId: string,
    agentPubkeys: readonly string[],
    submittedAt = Date.now(),
  ): void {
    if (!channelId) return;
    for (const value of new Set(agentPubkeys.map((candidate) => candidate.toLowerCase()))) {
      if (/^[0-9a-f]{64}$/.test(value))
        this.submissions.set(submissionKey(value, channelId), submittedAt);
    }
    while (this.submissions.size > MAX_SUBMISSIONS)
      this.submissions.delete(this.submissions.keys().next().value as string);
  }

  ingest(agentPubkey: string, frame: ObserverFrame, receivedAt = Date.now()): boolean {
    const agent = agentPubkey.toLowerCase();
    const dedupeKey = `${agent}|${frame.seq}|${frame.timestamp}`;
    if (this.dedupeKeys.has(dedupeKey)) return false;
    this.dedupeKeys.add(dedupeKey);
    while (this.dedupeKeys.size > MAX_DEDUPE_KEYS)
      this.dedupeKeys.delete(this.dedupeKeys.values().next().value as string);

    const key = recordKey(agent, frame.channelId);
    const current = this.records.get(key);
    if (current && compareFrames(frame, current.frame) <= 0) return false;
    this.records.set(key, { agentPubkey: agent, frame, receivedAt });
    while (this.records.size > MAX_RECORDS)
      this.records.delete(this.records.keys().next().value as string);
    return true;
  }

  getStatuses(
    channelId: string,
    agentPubkeys: readonly string[],
    connection: RelayConnectionState,
    nip44Available: boolean,
    now = Date.now(),
  ): AgentActivityStatus[] {
    const statuses: AgentActivityStatus[] = [];
    const agents = [...new Set(agentPubkeys.map((value) => value.toLowerCase()))].filter((value) =>
      /^[0-9a-f]{64}$/.test(value),
    );
    for (const agentPubkey of agents) {
      const submittedAt = this.submissions.get(submissionKey(agentPubkey, channelId));
      const pending = submittedAt !== undefined && now - submittedAt <= OBSERVER_PENDING_TTL_MS;
      const candidates = [...this.records.values()].filter(
        (record) =>
          record.agentPubkey === agentPubkey &&
          (record.frame.channelId === channelId || record.frame.channelId === null),
      );
      const sortedCandidates = candidates.sort((left, right) => {
        const byFrame = compareFrames(left.frame, right.frame);
        return byFrame || left.receivedAt - right.receivedAt;
      });
      const record = sortedCandidates[sortedCandidates.length - 1];
      const recent = record !== undefined && now - record.receivedAt <= OBSERVER_VISIBLE_QUIET_MS;
      if (!pending && !recent) continue;
      if (!nip44Available && pending) {
        statuses.push({ agentPubkey, state: "unavailable", detail: "signer" });
        continue;
      }
      if (connection === "disconnected" && (pending || recent)) {
        statuses.push({ agentPubkey, state: "disconnected", detail: "connection" });
        continue;
      }
      if (connection === "reconnecting" && (pending || recent)) {
        statuses.push({ agentPubkey, state: "reconnecting", detail: "connection" });
        continue;
      }
      if (!record) {
        statuses.push({
          agentPubkey,
          state: now - (submittedAt ?? now) <= 3_000 ? "working" : "quiet",
          detail: "waiting",
        });
        continue;
      }
      const state =
        now - record.receivedAt <= OBSERVER_FRESHNESS_MS
          ? classifyObserverFrame(record.frame)
          : "quiet";
      statuses.push({ agentPubkey, state, detail: state === "quiet" ? "silent" : "fresh" });
    }
    return statuses;
  }
}
