/**
 * Background Keep-Alive Engine — CREESPY Voice & Realtime Room (v2).
 *
 * Four coordinated layers against browser background throttling:
 * 1. Web Locks API  — holds a background lock so the tab cannot be suspended
 * 2. Web Audio Oscillator — 15 Hz infrasonic sine to keep OS audio driver active
 * 3. Silent HTML5 Audio Loop — prevents browser from marking page as inactive
 * 4. Web Worker Timer — unthrottled 4 s ticks for presence / WebRTC heartbeats
 *
 * Also exposes `onSupabaseCheck()` — a per-tick callback the caller uses to
 * force-reconnect the Supabase Realtime WebSocket when it goes CLOSED in background.
 */

function generateSilentWavDataUri(): string {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const durationSec = 2;
  const numSamples = sampleRate * durationSec;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true); ws(36, "data"); v.setUint32(40, dataSize, true);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

class BackgroundKeepAliveService {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private worker: Worker | null = null;
  private tickListeners = new Set<() => void>();
  private supabaseChecks = new Set<() => void>();
  private activeCount = 0;
  private isRunning = false;
  private silentUri: string | null = null;
  private lockAbort: AbortController | null = null;
  private lockResolve: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.silentUri = generateSilentWavDataUri();
      } catch {
        this.silentUri = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      }

      // Auto-unlock audio and background priority on any user interaction
      const autoUnlock = () => {
        this.ensureAudio();
      };
      window.addEventListener("click", autoUnlock, { passive: true });
      window.addEventListener("pointerdown", autoUnlock, { passive: true });
      window.addEventListener("keydown", autoUnlock, { passive: true });
      window.addEventListener("touchstart", autoUnlock, { passive: true });
    }
  }

  public acquire(): () => void {
    this.activeCount++;
    if (this.activeCount === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount = Math.max(0, this.activeCount - 1);
      if (this.activeCount === 0) this.stop();
    };
  }

  /** Register a heartbeat listener (called every ~4 s from unthrottled Worker) */
  public onTick(listener: () => void): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  /**
   * Register a Supabase connection watchdog.
   * Called on every Worker tick BEFORE tick listeners.
   * Caller should check supabase.realtime and call connect() if closed.
   */
  public onSupabaseCheck(cb: () => void): () => void {
    this.supabaseChecks.add(cb);
    return () => {
      this.supabaseChecks.delete(cb);
    };
  }

  /** Must be called from a user-gesture handler to unblock audio autoplay */
  public ensureAudio() {
    if (typeof window === "undefined") return;
    try {
      if (this.audioEl?.paused) {
        this.audioEl.play().catch(() => {});
      }
      if (this.audioCtx) {
        if (this.audioCtx.state === "suspended") {
          this.audioCtx.resume().catch(() => {});
        }
      }
    } catch {}
  }

  private start() {
    if (typeof window === "undefined" || this.isRunning) return;
    this.isRunning = true;

    // 1. Web Locks — prevents tab throttling on Chrome/Firefox/Safari 15.4+
    this.acquireLock();

    // 2. Web Audio infrasonic oscillator
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(15, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        this.oscillator = osc;
        this.gainNode = gain;
        if (this.audioCtx.state === "suspended") this.audioCtx.resume().catch(() => {});
      }
    } catch {}

    // 3. Silent audio loop
    try {
      if (!this.audioEl && this.silentUri) {
        const el = document.createElement("audio");
        el.loop = true;
        el.src = this.silentUri;
        el.volume = 0.001;
        (el as any).playsInline = true;
        el.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.001;pointer-events:none;left:-9999px;bottom:0;";
        document.body.appendChild(el);
        this.audioEl = el;
      }
      this.audioEl?.play().catch(() => {});
    } catch {}

    // 4. Web Worker unthrottled timer — 4 s ticks
    try {
      const code = `
        let t=null;
        self.onmessage=function(e){
          if(e.data==='start'){if(t)clearInterval(t);t=setInterval(function(){self.postMessage('tick');},2500);}
          else if(e.data==='stop'){if(t){clearInterval(t);t=null;}}
        };`;
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = (e) => {
        if (e.data !== "tick") return;
        // Watchdog: check Supabase connection first
        this.supabaseChecks.forEach((fn) => {
          try {
            fn();
          } catch {}
        });
        // Resume any suspended audio
        if (this.audioCtx?.state === "suspended") this.audioCtx.resume().catch(() => {});
        if (this.audioEl?.paused) this.audioEl.play().catch(() => {});
        // User tick listeners
        this.tickListeners.forEach((fn) => {
          try {
            fn();
          } catch {}
        });
      };
      w.postMessage("start");
      this.worker = w;
    } catch {}

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisible);
      window.addEventListener("focus", this.onVisible);
    }
  }

  private acquireLock() {
    if (typeof navigator === "undefined" || !("locks" in navigator)) return;
    this.lockAbort = new AbortController();
    (navigator as any).locks.request(
      "creespy-keepalive",
      { mode: "shared", signal: this.lockAbort.signal },
      () =>
        new Promise<void>((res) => {
          this.lockResolve = res;
        })
    ).catch(() => {});
  }

  private releaseLock() {
    this.lockAbort?.abort();
    this.lockAbort = null;
    this.lockResolve?.();
    this.lockResolve = null;
  }

  private onVisible = () => {
    if (document?.visibilityState === "visible") {
      if (this.audioCtx?.state === "suspended") this.audioCtx.resume().catch(() => {});
      if (this.audioEl?.paused) this.audioEl.play().catch(() => {});
    }
  };

  private stop() {
    this.isRunning = false;
    this.releaseLock();

    if (this.worker) {
      try {
        this.worker.postMessage("stop");
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {}
      this.oscillator = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {}
      this.audioCtx = null;
    }
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.src = "";
        this.audioEl.remove();
      } catch {}
      this.audioEl = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisible);
      window.removeEventListener("focus", this.onVisible);
    }
  }
}

export const backgroundKeepAlive = new BackgroundKeepAliveService();
