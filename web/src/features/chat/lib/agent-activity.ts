import type { NostrEvent, RelayConnectionState } from "@/shared/api/nostr-types";

export const AGENT_OBSERVER_FRAME_KIND = 24200;
export const OBSERVER_FRESHNESS_MS = 12_000;
export const OBSERVER_VISIBLE_QUIET_MS = 45_000;
export const OBSERVER_PENDING_TTL_MS = 120_000;
const MAX_RECORDS = 128;
const MAX_DEDUPE_KEYS = 512;
const MAX_SUBMISSIONS = 128;
const MAX_HISTORY_ITEMS = 120;
const MAX_CORRELATIONS = 256;
const MAX_DETAIL_CHARS = 1_000;
const MAX_OUTPUT_CHARS = 4_000;

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
  summary: string | null;
  lastUpdatedAt: number | null;
};

type ActivityRecord = {
  agentPubkey: string;
  channelId: string;
  frame: ObserverFrame;
  receivedAt: number;
};

export type ObserverFramePresentation = {
  state: Exclude<ActivityState, "reconnecting" | "disconnected" | "unavailable">;
  title: string;
  detail: string | null;
  output: string | null;
};

export type AgentActivityItem = ActivityRecord & {
  id: string;
  presentation: ObserverFramePresentation;
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

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    const candidate = optionalString(value);
    if (candidate) return candidate;
  }
  return null;
}

function frameUpdate(frame: ObserverFrame): Record<string, unknown> | null {
  const params = isRecord(frame.payload) ? frame.payload.params : null;
  const update = isRecord(params) ? params.update : null;
  return isRecord(update) ? update : null;
}

function toolArgs(update: Record<string, unknown>): Record<string, unknown> {
  for (const candidate of [update.args, update.arguments, update.input, update.rawInput]) {
    if (isRecord(candidate)) return candidate;
  }
  return {};
}

function contentText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const joined = value
      .map(contentText)
      .filter((item): item is string => Boolean(item))
      .join("\n");
    return joined || null;
  }
  if (!isRecord(value)) return null;
  return firstString([value.text, value.content, value.message]);
}

function boundedText(value: unknown, maximum: number): string | null {
  let text: string | null = null;
  if (typeof value === "string") text = value.trim() || null;
  else if (value !== undefined && value !== null) {
    if (Array.isArray(value) && value.length === 0) return null;
    if (isRecord(value) && Object.keys(value).length === 0) return null;
    try {
      text = JSON.stringify(value);
    } catch {
      text = null;
    }
  }
  if (!text || text === "{}" || text === "[]") return null;
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

function compactSummary(presentation: ObserverFramePresentation): string | null {
  if (presentation.detail) return presentation.detail;
  return presentation.state === "tool" ? presentation.title : null;
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

/** Describe a frame with the concrete command/tool evidence used by Buzz Desktop. */
export function describeObserverFrame(frame: ObserverFrame): ObserverFramePresentation {
  const state = classifyObserverFrame(frame);
  const payload = isRecord(frame.payload) ? frame.payload : null;
  const update = frameUpdate(frame);
  const updateType = payloadString(update, "sessionUpdate");
  if (update && (updateType === "tool_call" || updateType === "tool_call_update")) {
    const args = toolArgs(update);
    const nestedTool = isRecord(update.tool) ? update.tool : null;
    const title =
      firstString([
        update.toolName,
        update.tool_name,
        update.title,
        update.kind,
        update.name,
        nestedTool?.name,
      ]) ?? "tool_call";
    const detail =
      firstString([
        args.command,
        args.cmd,
        args.path,
        args.filePath,
        args.source,
        args.query,
        args.url,
      ]) ?? boundedText(args, MAX_DETAIL_CHARS);
    const output =
      boundedText(update.rawOutput, MAX_OUTPUT_CHARS) ??
      boundedText(contentText(update.content), MAX_OUTPUT_CHARS);
    return { state, title, detail, output };
  }

  const method = payloadString(payload, "method");
  const detail = update
    ? boundedText(contentText(update.content) ?? update, MAX_DETAIL_CHARS)
    : method
      ? boundedText(isRecord(payload) ? payload.params : null, MAX_DETAIL_CHARS)
      : boundedText(frame.payload, MAX_DETAIL_CHARS);
  return {
    state,
    title: updateType ?? method ?? frame.kind,
    detail,
    output: null,
  };
}

function compareFrames(left: ObserverFrame, right: ObserverFrame): number {
  const leftTime = Date.parse(left.timestamp);
  const rightTime = Date.parse(right.timestamp);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.seq - right.seq;
}

function recordKey(agentPubkey: string, channelId: string): string {
  return `${agentPubkey}|${channelId}`;
}

function submissionKey(agentPubkey: string, channelId: string): string {
  return `${agentPubkey}|${channelId}`;
}

export class AgentActivityStore {
  private readonly records = new Map<string, ActivityRecord>();
  private readonly dedupeKeys = new Set<string>();
  private readonly submissions = new Map<string, number>();
  private readonly history: ActivityRecord[] = [];
  private readonly correlations = new Map<string, string>();

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
    const channelId = this.resolveChannel(agent, frame);
    if (!channelId) return false;
    this.dedupeKeys.add(dedupeKey);
    while (this.dedupeKeys.size > MAX_DEDUPE_KEYS)
      this.dedupeKeys.delete(this.dedupeKeys.values().next().value as string);

    const record = { agentPubkey: agent, channelId, frame, receivedAt };
    this.history.push(record);
    this.history.sort((left, right) => {
      const byFrame = compareFrames(left.frame, right.frame);
      return byFrame || left.receivedAt - right.receivedAt;
    });
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history.splice(0, this.history.length - MAX_HISTORY_ITEMS);
    }

    const key = recordKey(agent, channelId);
    const current = this.records.get(key);
    if (!current || compareFrames(frame, current.frame) > 0) this.records.set(key, record);
    while (this.records.size > MAX_RECORDS)
      this.records.delete(this.records.keys().next().value as string);
    return true;
  }

  private resolveChannel(agentPubkey: string, frame: ObserverFrame): string | null {
    if (frame.channelId) {
      this.rememberCorrelation(agentPubkey, frame, frame.channelId);
      return frame.channelId;
    }
    const turnChannel = frame.turnId
      ? this.correlations.get(`${agentPubkey}|turn|${frame.turnId}`)
      : null;
    const sessionChannel = frame.sessionId
      ? this.correlations.get(`${agentPubkey}|session|${frame.sessionId}`)
      : null;
    return turnChannel ?? sessionChannel ?? null;
  }

  private rememberCorrelation(agentPubkey: string, frame: ObserverFrame, channelId: string): void {
    if (frame.turnId) this.correlations.set(`${agentPubkey}|turn|${frame.turnId}`, channelId);
    if (frame.sessionId)
      this.correlations.set(`${agentPubkey}|session|${frame.sessionId}`, channelId);
    while (this.correlations.size > MAX_CORRELATIONS) {
      this.correlations.delete(this.correlations.keys().next().value as string);
    }
  }

  getItems(
    channelId: string,
    agentPubkeys: readonly string[],
    limit = MAX_HISTORY_ITEMS,
  ): AgentActivityItem[] {
    const agents = new Set(agentPubkeys.map((value) => value.toLowerCase()));
    return this.history
      .filter((record) => record.channelId === channelId && agents.has(record.agentPubkey))
      .slice(-Math.max(0, Math.min(limit, MAX_HISTORY_ITEMS)))
      .map((record) => ({
        ...record,
        id: `${record.agentPubkey}:${record.frame.seq}:${record.frame.timestamp}`,
        presentation: describeObserverFrame(record.frame),
      }));
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
        (record) => record.agentPubkey === agentPubkey && record.channelId === channelId,
      );
      const sortedCandidates = candidates.sort((left, right) => {
        const byFrame = compareFrames(left.frame, right.frame);
        return byFrame || left.receivedAt - right.receivedAt;
      });
      const record = sortedCandidates[sortedCandidates.length - 1];
      const recent = record !== undefined && now - record.receivedAt <= OBSERVER_VISIBLE_QUIET_MS;
      if (!pending && !recent) continue;
      if (!nip44Available && pending) {
        statuses.push({
          agentPubkey,
          state: "unavailable",
          detail: "signer",
          summary: null,
          lastUpdatedAt: null,
        });
        continue;
      }
      if (connection === "disconnected" && (pending || recent)) {
        statuses.push({
          agentPubkey,
          state: "disconnected",
          detail: "connection",
          summary: record ? describeObserverFrame(record.frame).detail : null,
          lastUpdatedAt: record?.receivedAt ?? null,
        });
        continue;
      }
      if (connection === "reconnecting" && (pending || recent)) {
        statuses.push({
          agentPubkey,
          state: "reconnecting",
          detail: "connection",
          summary: record ? describeObserverFrame(record.frame).detail : null,
          lastUpdatedAt: record?.receivedAt ?? null,
        });
        continue;
      }
      if (!record) {
        statuses.push({
          agentPubkey,
          state: now - (submittedAt ?? now) <= 3_000 ? "working" : "quiet",
          detail: "waiting",
          summary: null,
          lastUpdatedAt: null,
        });
        continue;
      }
      const state =
        now - record.receivedAt <= OBSERVER_FRESHNESS_MS
          ? classifyObserverFrame(record.frame)
          : "quiet";
      const presentation = describeObserverFrame(record.frame);
      statuses.push({
        agentPubkey,
        state,
        detail: state === "quiet" ? "silent" : "fresh",
        summary: compactSummary(presentation),
        lastUpdatedAt: record.receivedAt,
      });
    }
    return statuses;
  }
}
