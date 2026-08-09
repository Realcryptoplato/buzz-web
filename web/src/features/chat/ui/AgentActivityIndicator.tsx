import { Brain, CircleAlert, LoaderCircle, MessageCircle, Radio, Wrench } from "lucide-react";
import type { ActivityState, AgentActivityStatus } from "@/features/chat/lib/agent-activity";
import type { UserProfile } from "@/features/chat/lib/chat-types";
import { t } from "@/shared/i18n";

const stateIcon: Record<ActivityState, typeof Radio> = {
  working: LoaderCircle,
  thinking: Brain,
  tool: Wrench,
  responding: MessageCircle,
  quiet: Radio,
  reconnecting: LoaderCircle,
  disconnected: CircleAlert,
  unavailable: CircleAlert,
};

function stateLabel(state: ActivityState): string {
  return t(`activity.${state}` as Parameters<typeof t>[0]);
}

export function AgentActivityIndicator({
  statuses,
  profiles,
}: {
  statuses: AgentActivityStatus[];
  profiles: Record<string, UserProfile>;
}) {
  const visible = statuses.length > 0;
  const label = statuses
    .map(
      (status) =>
        `${profiles[status.agentPubkey]?.name ?? t("common.agent")}: ${stateLabel(status.state)}`,
    )
    .join(" · ");
  const accessibleLabel = statuses.some((status) => status.state === "unavailable")
    ? t("activity.unavailableDescription")
    : label || t("activity.waitingDescription");
  const Icon = statuses[0] ? stateIcon[statuses[0].state] : CircleAlert;
  return (
    <div
      className="flex h-8 shrink-0 items-center px-5 text-[11px] text-muted-foreground"
      aria-live="polite"
    >
      {visible ? (
        <div className="flex min-w-0 items-center gap-1.5" data-testid="agent-activity-indicator">
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${statuses[0]?.state === "working" || statuses[0]?.state === "thinking" || statuses[0]?.state === "tool" || statuses[0]?.state === "reconnecting" ? "animate-pulse" : ""}`}
            aria-hidden="true"
          />
          <span className="truncate">{accessibleLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
