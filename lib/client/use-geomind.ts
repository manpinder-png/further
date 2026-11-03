"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeomindResponse } from "@/lib/geomind";
import type { MatchRequest } from "@/lib/types";
import { localJson } from "@/lib/client/live";

/** The server supplies the consented projection; this hook never builds peers from private maps. */
export function useGeomind({ active, actorId }: { active: boolean; actorId: string | null }) {
  const key = active && actorId ? actorId : null;
  const current = useRef(key);
  current.current = key;
  const request = useRef<AbortController | null>(null);
  const invitation = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; snapshot: GeomindResponse | null; loading: boolean; error: string | null } | null>(null);
  const [inviteState, setInviteState] = useState<{ key: string; peerId: string | null; error: string | null } | null>(null);

  const refresh = useCallback(async () => {
    if (!key) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    // Keep the selected detail stable during a manual refresh. A failed refresh clears
    // the projection, and a successful response replaces it in full.
    setState(previous => ({ key, snapshot: previous?.key === key ? previous.snapshot : null, loading: true, error: null }));
    const timeout = setTimeout(() => {
      if (current.current !== key || request.current !== controller) return;
      setState({ key, snapshot: null, loading: false, error: "Checking nearby learners took too long. Please try again." });
      controller.abort();
    }, 15_000);
    try {
      const snapshot = await localJson<GeomindResponse>("/api/geomind", { method: "POST", body: "{}", signal: controller.signal });
      if (!controller.signal.aborted && current.current === key) setState({ key, snapshot, loading: false, error: null });
    } catch (error) {
      if (!controller.signal.aborted && current.current === key) setState({ key, snapshot: null, loading: false, error: error instanceof Error ? error.message : "Couldn't check nearby learners. Please try again." });
    } finally {
      clearTimeout(timeout);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    void refresh();
    return () => {
      request.current?.abort();
      invitation.current?.abort();
      invitation.current = null;
      setState(null);
      setInviteState(null);
    };
  }, [key, refresh]);

  const invite = useCallback(async (peerId: string, conceptSlug: string, peerConceptSlug?: string): Promise<MatchRequest | null> => {
    if (!key || current.current !== key || invitation.current) return null;
    const controller = new AbortController();
    invitation.current = controller;
    setInviteState({ key, peerId, error: null });
    const timeout = setTimeout(() => {
      if (current.current !== key || invitation.current !== controller) return;
      setInviteState({ key, peerId: null, error: "Couldn't confirm the invitation in time. Use Refresh to check whether it was saved before trying again." });
      controller.abort();
    }, 20_000);
    try {
      const result = await localJson<{ match: MatchRequest }>("/api/geomind/invite", { method: "POST", body: JSON.stringify({ peerId, conceptSlug, ...(peerConceptSlug ? { peerConceptSlug } : {}) }), signal: controller.signal });
      if (controller.signal.aborted || current.current !== key) return null;
      setInviteState({ key, peerId: null, error: null });
      return result.match;
    } catch (error) {
      if (!controller.signal.aborted && current.current === key) {
        setInviteState({ key, peerId: null, error: error instanceof Error ? error.message : "Couldn't confirm the invitation. Refresh to check its status before trying again." });
      }
      return null;
    } finally {
      clearTimeout(timeout);
      if (invitation.current === controller) invitation.current = null;
    }
  }, [key]);

  return {
    snapshot: state?.key === key ? state.snapshot : null,
    loading: Boolean(key && (state?.key !== key || state.loading)),
    error: state?.key === key ? state.error : null,
    invitingPeerId: inviteState?.key === key ? inviteState.peerId : null,
    inviteError: inviteState?.key === key ? inviteState.error : null,
    refresh,
    invite,
  };
}
