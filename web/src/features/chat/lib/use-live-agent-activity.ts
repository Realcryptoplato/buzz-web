import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentActivityStatus,
  AgentActivityStore,
  parseObserverFrame,
  unwrapObserverBatch,
  validateObserverEvent,
} from "@/features/chat/lib/agent-activity";
import type { NostrEvent, RelayConnectionState } from "@/shared/api/nostr-types";
import type { BuzzRelayClient } from "@/shared/api/relay-client";
import {
  canDecryptNip44FromPeer,
  decryptNip44FromPeer,
  getActiveSignerPubkey,
} from "@/shared/lib/nostr-signer";

export function useLiveAgentActivity({
  client,
  demo,
  ownerPubkey,
}: {
  client: BuzzRelayClient | null;
  demo: boolean;
  ownerPubkey: string;
}): {
  available: boolean;
  connection: RelayConnectionState;
  markSubmitted: (channelId: string, agentPubkeys: readonly string[]) => void;
  statusesFor: (channelId: string, agentPubkeys: readonly string[]) => AgentActivityStatus[];
} {
  const storeIdentity = `${client?.relayUrl ?? "demo"}|${ownerPubkey.toLowerCase()}`;
  const storeRef = useRef<{ identity: string; store: AgentActivityStore } | null>(null);
  if (storeRef.current?.identity !== storeIdentity) {
    storeRef.current = { identity: storeIdentity, store: new AgentActivityStore() };
  }
  const store = storeRef.current.store;
  const [connection, setConnection] = useState<RelayConnectionState>(demo ? "connected" : "idle");
  const [version, setVersion] = useState(0);
  const available =
    canDecryptNip44FromPeer() &&
    getActiveSignerPubkey()?.toLowerCase() === ownerPubkey.toLowerCase();
  const processing = useRef(Promise.resolve());

  useEffect(() => {
    if (!client || demo) return;
    return client.onStateChange(setConnection);
  }, [client, demo]);

  useEffect(() => {
    if (!client || demo || !available) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const handleEvent = (event: NostrEvent) => {
      processing.current = processing.current
        .then(async () => {
          if (cancelled) return;
          const agentPubkey = validateObserverEvent(event, ownerPubkey);
          if (!agentPubkey) return;
          try {
            const parsed = parseObserverFrame(
              JSON.parse(await decryptNip44FromPeer(agentPubkey, event.content)),
            );
            if (!parsed) return;
            for (const frame of unwrapObserverBatch(parsed)) {
              if (store.ingest(agentPubkey, frame)) setVersion((current) => current + 1);
            }
          } catch {
            // Observer payloads are private and untrusted. Invalid/decrypt-failed frames are ignored.
          }
        })
        .catch(() => undefined);
    };
    void client
      .subscribe({ kinds: [24200], "#p": [ownerPubkey], limit: 0 }, handleEvent)
      .then((cleanup) => {
        if (cancelled) cleanup();
        else unsubscribe = cleanup;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [available, client, demo, ownerPubkey, store]);

  useEffect(() => {
    const timer = window.setInterval(() => setVersion((current) => current + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const markSubmitted = useCallback(
    (channelId: string, agentPubkeys: readonly string[]) => {
      store.markSubmitted(channelId, agentPubkeys);
      setVersion((current) => current + 1);
    },
    [store],
  );

  const statusesFor = useCallback(
    (channelId: string, agentPubkeys: readonly string[]) => {
      void version;
      return store.getStatuses(channelId, agentPubkeys, connection, available);
    },
    [available, connection, store, version],
  );

  return useMemo(
    () => ({ available, connection, markSubmitted, statusesFor }),
    [available, connection, markSubmitted, statusesFor],
  );
}
