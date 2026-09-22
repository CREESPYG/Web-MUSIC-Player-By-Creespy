import { useEffect, useRef, useState } from "react";

/**
 * Phase 17 — development-only voice/room debugging panel.
 *
 * Shows live room, presence, heartbeat, voice, WebRTC peer and reconnect
 * telemetry. NEVER shows secrets: no Supabase keys, TURN credentials or SDP.
 *
 * Visibility rules (gate: hidden in normal production):
 *   · Vite dev server (`import.meta.env.DEV`) → shown automatically.
 *   · Production single-file build → hidden, UNLESS the explicit non-UI
 *     opt-in `creespy.debugPanel === "1"` is set in localStorage (used for
 *     staging/reconnection testing; not discoverable in the interface).
 */
function isDebugEnabled(): boolean {
  try {
    if ((import.meta as any).env?.DEV) return true;
    return localStorage.getItem("creespy.debugPanel") === "1";
  } catch {
    return false;
  }
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function Row({ k, v }: { k: string; v: unknown }) {
  const text = typeof v === "boolean" ? (v ? "true" : "false") : (v ?? "—");
  return (
    <div className="flex justify-between gap-2 text-[10px] leading-4">
      <span className="text-white/40">{k}</span>
      <span className="text-right font-mono text-white/80">{String(text).slice(0, 60)}</span>
    </div>
  );
}

interface DebugSnapshot {
  ts: number;
  room?: Record<string, unknown> | null;
  voice?: Record<string, unknown> | null;
}

export function DebugPanel({
  getRoom,
  getVoice,
}: {
  getRoom?: () => Record<string, unknown>;
  getVoice?: () => Record<string, unknown>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);

  const roomRef = useRef(getRoom);
  roomRef.current = getRoom;
  const voiceRef = useRef(getVoice);
  voiceRef.current = getVoice;

  useEffect(() => {
    setEnabled(isDebugEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      try {
        setSnap({
          ts: Date.now(),
          room: roomRef.current?.() ?? null,
          voice: voiceRef.current?.() ?? null,
        });
      } catch {
        /* keep last snapshot */
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const r = snap?.room as Record<string, unknown> | undefined;
  const v = snap?.voice as Record<string, unknown> | undefined;
  const rtc = v?.rtc as
    | { peers?: Array<Record<string, unknown>>; peerCount?: number; canSpeak?: boolean; canHear?: boolean; selfMuted?: boolean; localMicActive?: boolean; audioCtxState?: string }
    | null
    | undefined;
  const ttl = r?.lastBeatAgoMs as number | null | undefined;
  const vis = v?.visibility ?? "unknown";

  return (
    <div
      role="log"
      aria-label="Developer diagnostics panel"
      className="pointer-events-none fixed bottom-2 left-2 z-[999] w-[240px] rounded-lg border border-white/10 bg-black/80 p-2 text-white shadow-xl backdrop-blur"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-300/80">Debug</span>
        <span className="text-[9px] font-mono text-white/30">{vis === "visible" ? "visible" : "hidden"}</span>
      </div>

      <Row k="room status" v={r?.status} />
      <Row k="conn" v={r?.connection} />
      <Row k="user" v={r?.me} />
      <Row k="room code" v={r?.roomCode} />
      <Row k="host id" v={r?.roomHostId} />
      <Row k="session" v={r?.sessionId ?? v?.sessionId} />
      <Row k="presence" v={r?.presenceCount} />
      <Row k="heartbeat" v={typeof ttl === "number" ? formatMs(ttl) : "—"} />
      <Row k="reconnects" v={r?.reconnectAttempts} />
      <Row k="ch room" v={((r?.channelStates as any)?.room ?? "—") as unknown} />
      <Row k="ch chat" v={((r?.channelStates as any)?.chat ?? "—") as unknown} />
      <Row k="ch sync" v={((r?.channelStates as any)?.sync ?? "—") as unknown} />
      <Row k="ch lobby" v={((r?.channelStates as any)?.lobby ?? "—") as unknown} />

      <div className="my-1 border-t border-white/10" />
      <Row k="voice status" v={v?.status} />
      <Row k="voice ch state" v={v?.channelState} />
      <Row k="voice users" v={v?.voiceUserCount} />
      <Row k="mic" v={rtc?.localMicActive} />
      <Row k="mic input" v={v?.selectedInput} />
      <Row k="self muted" v={rtc?.selfMuted} />
      <Row k="ctx state" v={rtc?.audioCtxState} />
      <Row k="online" v={v?.disconnected !== undefined ? !v.disconnected : "—"} />
      <Row k="peers" v={rtc?.peerCount} />

      {rtc?.peers?.map((p) => (
        <div key={String(p.userId)} className="mt-0.5 rounded border border-white/10 p-1">
          <Row k="peer" v={p.userId} />
          <Row k="conn" v={p.connectionState} />
          <Row k="ice" v={p.iceState} />
          <Row k="sig" v={p.signalingState} />
          <Row k="reconnecting" v={p.reconnecting} />
        </div>
      ))}
    </div>
  );
}