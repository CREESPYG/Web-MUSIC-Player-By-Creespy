/**
 * WebRTC Mesh Audio Engine & Web Audio API Pipeline for CREESPY Voice.
 *
 * Implements:
 * 1. Native WebRTC mesh connections between room voice peers with automatic ICE recovery.
 * 2. Background audio keep-alive preventing browser throttling/suspension during tab switching.
 * 3. Dedicated Web Audio API destination sink for reliable 0-150% volume amplification & autoplay compliance.
 * 4. Resilient HTMLAudioElement stream keeper for background tab audio playback.
 * 5. Robust ICE candidate queue to prevent signaling race conditions.
 * 6. WebRTC audio transceivers ('sendrecv') guaranteeing bidirectional media negotiation.
 * 7. AnalyserNodes for low-overhead real-time speaking detection (RMS volume).
 * 8. Automatic visibility, focus, and user-gesture resynchronization to resume suspended AudioContexts.
 * 9. Full audio isolation from the YouTube music player.
 */

import { backgroundKeepAlive } from "./backgroundKeepAlive";

export interface IceConfig {
  iceServers: RTCIceServer[];
}

let cachedDynamicServers: RTCIceServer[] = [];

// Pre-fetch dynamic Metered TURN credentials if configured
(() => {
  const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};
  const appName = metaEnv.VITE_METERED_APP_NAME;
  const apiKey = metaEnv.VITE_METERED_API_KEY;
  if (appName && apiKey && typeof fetch !== "undefined") {
    fetch(`https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`)
      .then((res) => res.json())
      .then((ice) => {
        if (Array.isArray(ice)) {
          cachedDynamicServers = ice;
        }
      })
      .catch(() => {});
  }
})();

export function getIceConfig(): IceConfig {
  const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};
  const servers: RTCIceServer[] = [
    // Cloudflare STUN (low-latency, globally distributed, highly reliable)
    { urls: ["stun:stun.cloudflare.com:3478"] },

    // Google Public STUN servers
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },

    // Mozilla & Twilio STUN fallbacks
    { urls: ["stun:stun.services.mozilla.com:3478"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ];

  // Include dynamic Metered TURN servers if fetched
  if (cachedDynamicServers.length > 0) {
    servers.push(...cachedDynamicServers);
  }

  // Custom user-defined STUN server
  if (metaEnv.VITE_STUN_SERVER_URL) {
    servers.push({ urls: [metaEnv.VITE_STUN_SERVER_URL] });
  }

  // Custom user-defined TURN relay server (supports Coturn, ExpressTURN, Xirsys, Metered)
  if (metaEnv.VITE_TURN_SERVER_URL) {
    const turnConfig: RTCIceServer = {
      urls: [metaEnv.VITE_TURN_SERVER_URL],
    };
    if (metaEnv.VITE_TURN_USERNAME) turnConfig.username = metaEnv.VITE_TURN_USERNAME;
    if (metaEnv.VITE_TURN_CREDENTIAL) turnConfig.credential = metaEnv.VITE_TURN_CREDENTIAL;
    servers.push(turnConfig);
  }

  return { iceServers: servers };
}

export interface PeerAudioNode {
  userId: string;
  stream: MediaStream;
  sourceNode?: MediaStreamAudioSourceNode;
  gainNode?: GainNode;
  analyserNode?: AnalyserNode;
  audioElement?: HTMLAudioElement;
  volume: number; // 0 to 150
  locallyMuted: boolean;
}

export interface WebRtcCallbacks {
  onSignal: (signal: { to: string; from: string; event: string; payload: any }) => void;
  onSpeakingChange: (userId: string, isSpeaking: boolean) => void;
  onPeerConnectionState: (userId: string, state: RTCPeerConnectionState) => void;
  onError: (error: string) => void;
}

export class WebRtcVoiceManager {
  private localUserId: string;
  private callbacks: WebRtcCallbacks;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private localStream: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private transceivers = new Map<string, RTCRtpTransceiver>();
  private peerAudio = new Map<string, PeerAudioNode>();
  private iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private speakingMap = new Map<string, boolean>();
  private checkInterval: number | null = null;
  private keepAliveRelease: (() => void) | null = null;
  private reconnectTimers = new Map<string, number>();
  private onVisibilityChange: (() => void) | null = null;
  private userInteractionCleanup: (() => void) | null = null;

  // Local Voice Permissions & State
  public canSpeak: boolean = true;
  public canHear: boolean = true;
  public selfMuted: boolean = false;
  public hostMuted: boolean = false;

  constructor(localUserId: string, callbacks: WebRtcCallbacks) {
    this.localUserId = localUserId;
    this.callbacks = callbacks;
    this.setupVisibilityListeners();
  }

  /** Keep audio thread active in background tabs across all platforms */
  private startKeepAlive() {
    if (!this.keepAliveRelease) {
      this.keepAliveRelease = backgroundKeepAlive.acquire();
    }
  }

  private stopKeepAlive() {
    if (this.keepAliveRelease) {
      this.keepAliveRelease();
      this.keepAliveRelease = null;
    }
  }

  /** Auto-wake audio and WebRTC connections when switching back into tab or user interacts */
  private setupVisibilityListeners() {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const resumeAudio = () => {
      this.ensureAudioContext().catch(() => {});
      this.peerAudio.forEach((node) => {
        if (node.audioElement && node.audioElement.paused && this.canHear && !node.locallyMuted) {
          node.audioElement.play().catch(() => {});
        }
      });
    };

    this.onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeAudio();
        // Schedule a peer reconnect pass after a short delay to let the Supabase
        // WebSocket reconnect first (so signaling is available for ICE renegotiation).
        window.setTimeout(() => {
          this.reconnectAllPeers();
        }, 2000);
      }
    };

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("focus", this.onVisibilityChange);
    window.addEventListener("pageshow", this.onVisibilityChange);

    // Global user-gesture interaction listener to defeat browser autoplay restrictions
    window.addEventListener("click", resumeAudio, { passive: true });
    window.addEventListener("keydown", resumeAudio, { passive: true });
    window.addEventListener("touchstart", resumeAudio, { passive: true });

    this.userInteractionCleanup = () => {
      window.removeEventListener("click", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      window.removeEventListener("touchstart", resumeAudio);
    };
  }

  /** Initialize or resume Web Audio Context on user gesture */
  public async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext || this.audioContext.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {}
    }
    if (!this.masterGain && this.audioContext) {
      try {
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.setValueAtTime(this.canHear ? 1.0 : 0.0, this.audioContext.currentTime);
        this.masterGain.connect(this.audioContext.destination);
      } catch {}
    }
    return this.audioContext;
  }

  public getPeer(userId: string): RTCPeerConnection | undefined {
    return this.peers.get(userId);
  }

  /** Start local microphone stream */
  public async startMicrophone(deviceId?: string): Promise<MediaStream> {
    await this.ensureAudioContext();
    this.startKeepAlive();

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;

      // Setup local audio analyzer
      if (this.audioContext) {
        try {
          const source = this.audioContext.createMediaStreamSource(stream);
          const analyser = this.audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.4;
          source.connect(analyser);
          this.localAnalyser = analyser;
        } catch {}
      }

      this.updateLocalTrackState();
      this.startSpeakingMonitor();

      // Attach track to all existing peer connections and transceivers
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.peers.forEach((pc, uid) => {
          const transceiver = this.transceivers.get(uid);
          if (transceiver && transceiver.sender) {
            transceiver.sender.replaceTrack(audioTrack).catch(() => {});
          } else {
            const senders = pc.getSenders();
            const audioSender = senders.find((s) => s.track?.kind === "audio");
            if (audioSender) {
              audioSender.replaceTrack(audioTrack).catch(() => {});
            } else {
              try {
                pc.addTrack(audioTrack, stream);
              } catch {}
            }
          }
        });
      }

      return stream;
    } catch (err: any) {
      this.callbacks.onError(err.message || "Failed to access microphone");
      throw err;
    }
  }

  /** Update local microphone track enablement based on permissions */
  public updateLocalTrackState() {
    const isTransmitting = this.canSpeak && !this.selfMuted && !this.hostMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = isTransmitting;
      });
    }
  }

  /** Drain queued ICE candidates once remoteDescription is set */
  private async drainQueuedCandidates(userId: string, pc: RTCPeerConnection) {
    const queue = this.iceCandidateQueues.get(userId) || [];
    this.iceCandidateQueues.delete(userId);
    for (const cand of queue) {
      if (!cand || !cand.candidate) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {}
    }
  }

  /** Initiate WebRTC PeerConnection with a remote participant */
  public async connectToPeer(remoteUserId: string, createOffer: boolean): Promise<RTCPeerConnection> {
    let pc = this.peers.get(remoteUserId);
    // Allow creating a fresh connection when in a terminal or "disconnected" state
    const unhealthy =
      !pc ||
      pc.connectionState === "closed" ||
      pc.connectionState === "failed" ||
      pc.connectionState === "disconnected";
    if (!unhealthy) {
      return pc!;
    }

    if (pc) {
      pc.close();
      this.peers.delete(remoteUserId);
      this.transceivers.delete(remoteUserId);
    }

    const config = getIceConfig();
    pc = new RTCPeerConnection({
      ...config,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    this.peers.set(remoteUserId, pc);

    // 1. Explicitly create audio transceiver ('sendrecv')
    // This ensures bidirectional audio SDP negotiation even if mic stream is still initializing.
    try {
      const transceiver = pc.addTransceiver("audio", {
        direction: "sendrecv",
        streams: this.localStream ? [this.localStream] : [],
      });
      this.transceivers.set(remoteUserId, transceiver);
      if (this.localStream) {
        const track = this.localStream.getAudioTracks()[0];
        if (track && transceiver.sender) {
          transceiver.sender.replaceTrack(track).catch(() => {});
        }
      }
    } catch {
      // Fallback if browser doesn't support addTransceiver
      if (this.localStream) {
        const track = this.localStream.getAudioTracks()[0];
        if (track) {
          try {
            pc.addTrack(track, this.localStream);
          } catch {}
        }
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onSignal({
          to: remoteUserId,
          from: this.localUserId,
          event: "voice_ice",
          payload: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc!.connectionState;
      this.callbacks.onPeerConnectionState(remoteUserId, state);
      if (state === "connected") {
        const timer = this.reconnectTimers.get(remoteUserId);
        if (timer) {
          window.clearTimeout(timer);
          this.reconnectTimers.delete(remoteUserId);
        }
      } else if (state === "failed") {
        this.recoverPeerConnection(remoteUserId, true);
      } else if (state === "disconnected") {
        this.recoverPeerConnection(remoteUserId, false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc!.iceConnectionState;
      if (state === "connected" || state === "completed") {
        const timer = this.reconnectTimers.get(remoteUserId);
        if (timer) {
          window.clearTimeout(timer);
          this.reconnectTimers.delete(remoteUserId);
        }
      } else if (state === "failed") {
        this.recoverPeerConnection(remoteUserId, true);
      } else if (state === "disconnected") {
        this.recoverPeerConnection(remoteUserId, false);
      }
    };

    pc.ontrack = (event) => {
      let remoteStream = event.streams?.[0];
      if (!remoteStream) {
        remoteStream = new MediaStream([event.track]);
      }
      this.setupRemoteAudio(remoteUserId, remoteStream);

      event.track.onunmute = () => {
        this.setupRemoteAudio(remoteUserId, remoteStream!);
      };
    };

    if (createOffer) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        this.callbacks.onSignal({
          to: remoteUserId,
          from: this.localUserId,
          event: "voice_offer",
          payload: offer,
        });
      } catch (err: any) {
        this.callbacks.onError(`Offer creation failed: ${err.message}`);
      }
    }

    return pc;
  }

  /**
   * Reconnect all known peers that are in a non-healthy state.
   * Called from useVoice on tab-return after the WebSocket has had time to settle.
   */
  public reconnectAllPeers() {
    this.peers.forEach((pc, uid) => {
      const bad =
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected";
      if (bad) {
        this.recoverPeerConnection(uid, true);
      }
    });
  }

  /**
   * Automatic ICE restart & graceful peer reconnection.
   * Disconnected states get a 3 s grace window to self-heal.
   */
  public async recoverPeerConnection(remoteUserId: string, immediate = false) {
    if (this.reconnectTimers.has(remoteUserId)) return;
    const delay = immediate ? 600 : 3000;
    const timer = window.setTimeout(async () => {
      this.reconnectTimers.delete(remoteUserId);
      const pc = this.peers.get(remoteUserId);
      if (!pc) return;
      if (pc.connectionState === "connected" && pc.iceConnectionState === "connected") return;

      // Deterministic role: Higher user ID initiates the offer/restart
      const isOfferer = this.localUserId > remoteUserId;

      if (isOfferer) {
        if (typeof pc.restartIce === "function") {
          try {
            if (pc.signalingState === "stable") {
              pc.restartIce();
              const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
              await pc.setLocalDescription(offer);
              this.callbacks.onSignal({
                to: remoteUserId,
                from: this.localUserId,
                event: "voice_offer",
                payload: offer,
              });
              return;
            }
          } catch {}
        }
        // Fallback clean reconnect
        try {
          pc.close();
          this.peers.delete(remoteUserId);
          this.transceivers.delete(remoteUserId);
          await this.connectToPeer(remoteUserId, true);
        } catch (err: any) {
          this.callbacks.onError(`Voice reconnect failed: ${err.message}`);
        }
      } else {
        // Lower ID sends a polite renegotiate request to the offerer
        this.callbacks.onSignal({
          to: remoteUserId,
          from: this.localUserId,
          event: "voice_renegotiate",
          payload: { reason: "recover" },
        });
      }
    }, delay);
    this.reconnectTimers.set(remoteUserId, timer);
  }

  /** Remote peer requested renegotiation / ICE restart */
  public async handleRenegotiate(fromUserId: string) {
    const pc = this.peers.get(fromUserId);
    if (!pc) {
      await this.connectToPeer(fromUserId, this.localUserId > fromUserId);
      return;
    }
    try {
      if (pc.signalingState === "stable") {
        if (typeof pc.restartIce === "function") pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        this.callbacks.onSignal({
          to: fromUserId,
          from: this.localUserId,
          event: "voice_offer",
          payload: offer,
        });
      }
    } catch {}
  }

  /** Handle incoming SDP offer with polite peer rollback on collision */
  public async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
    try {
      const pc = await this.connectToPeer(fromUserId, false);

      // Handle offer collision with polite / impolite peer protocol
      if (pc.signalingState !== "stable") {
        const isPolite = this.localUserId < fromUserId;
        if (isPolite) {
          try {
            await pc.setLocalDescription({ type: "rollback" } as any);
          } catch {}
        } else {
          // Impolite peer ignores colliding offer
          return;
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainQueuedCandidates(fromUserId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.callbacks.onSignal({
        to: fromUserId,
        from: this.localUserId,
        event: "voice_answer",
        payload: answer,
      });
    } catch (err: any) {
      this.callbacks.onError(`Offer handling error: ${err.message || err}`);
    }
  }

  /** Handle incoming SDP answer */
  public async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
    try {
      const pc = this.peers.get(fromUserId);
      if (!pc) return;
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.drainQueuedCandidates(fromUserId, pc);
      }
    } catch (err: any) {
      this.callbacks.onError(`Answer handling error: ${err.message || err}`);
    }
  }

  /** Handle incoming ICE candidate with queueing until remote description is ready */
  public async handleIceCandidate(fromUserId: string, candidateInit: RTCIceCandidateInit) {
    if (!candidateInit || !candidateInit.candidate) return;
    const pc = this.peers.get(fromUserId);
    if (!pc || !pc.remoteDescription) {
      let q = this.iceCandidateQueues.get(fromUserId);
      if (!q) {
        q = [];
        this.iceCandidateQueues.set(fromUserId, q);
      }
      q.push(candidateInit);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch {
      /* ignore candidate race */
    }
  }

  /** Setup direct Web Audio destination routing for desktop & mobile playback */
  private async setupRemoteAudio(userId: string, stream: MediaStream) {
    const ctx = await this.ensureAudioContext();

    // Read saved local volume for this user or default 100%
    let savedVol = 100;
    try {
      const stored = localStorage.getItem(`creespy_voice_vol_${userId}`);
      if (stored !== null) savedVol = Math.max(0, Math.min(150, Number(stored)));
    } catch {}

    const existing = this.peerAudio.get(userId);
    if (existing?.sourceNode) existing.sourceNode.disconnect();
    if (existing?.gainNode) existing.gainNode.disconnect();
    if (existing?.analyserNode) existing.analyserNode.disconnect();

    // 1. Maintain HTMLAudioElement as an active MediaStream consumer for background tab preservation.
    // Kept muted to prevent double-playback against Web Audio destination.
    let audioEl = existing?.audioElement;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true;
      audioEl.muted = true;
      audioEl.style.position = "fixed";
      audioEl.style.width = "1px";
      audioEl.style.height = "1px";
      audioEl.style.opacity = "0.001";
      audioEl.style.pointerEvents = "none";
      audioEl.style.left = "-9999px";
      audioEl.style.bottom = "0";
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = stream;
    audioEl.play().catch(() => {});

    // 2. Primary Web Audio Pipeline:
    // source → gainNode → analyserNode
    // gainNode → masterGain → ctx.destination
    // This produces reliable desktop audio without autoplay blockage and supports up to 150% boost.
    let source: MediaStreamAudioSourceNode | undefined;
    let gainNode: GainNode | undefined;
    let analyser: AnalyserNode | undefined;
    try {
      source = ctx.createMediaStreamSource(stream);
      gainNode = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;

      source.connect(gainNode);
      gainNode.connect(analyser);

      if (this.masterGain) {
        gainNode.connect(this.masterGain);
      } else {
        gainNode.connect(ctx.destination);
      }
    } catch {
      // AudioContext might still be initializing on some platforms
    }

    const peerNode: PeerAudioNode = {
      userId,
      stream,
      sourceNode: source,
      gainNode,
      analyserNode: analyser,
      audioElement: audioEl,
      volume: savedVol,
      locallyMuted: false,
    };

    this.peerAudio.set(userId, peerNode);
    this.updatePeerGain(userId);
  }

  /** Update gain for a peer: uses Web Audio gainNode for 0% - 150% output */
  public updatePeerGain(userId: string) {
    const node = this.peerAudio.get(userId);
    if (!node) return;

    const muted = !this.canHear || node.locallyMuted;

    if (node.gainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      if (muted) {
        node.gainNode.gain.setTargetAtTime(0, now, 0.01);
      } else {
        const gain = Math.max(0, node.volume / 100); // 0.0 – 1.5
        node.gainNode.gain.setTargetAtTime(gain, now, 0.01);
      }
    }

    if (node.audioElement) {
      node.audioElement.muted = true;
      if (node.audioElement.paused) {
        node.audioElement.play().catch(() => {});
      }
    }
  }

  /** Set individual volume for a remote participant (0% - 150%) */
  public setUserVolume(userId: string, volumePercent: number) {
    const clamped = Math.max(0, Math.min(150, Math.round(volumePercent)));
    const node = this.peerAudio.get(userId);
    if (node) {
      node.volume = clamped;
      this.updatePeerGain(userId);
    }
    try {
      localStorage.setItem(`creespy_voice_vol_${userId}`, String(clamped));
    } catch {}
  }

  /** Get individual volume for a participant */
  public getUserVolume(userId: string): number {
    const node = this.peerAudio.get(userId);
    if (node) return node.volume;
    try {
      const stored = localStorage.getItem(`creespy_voice_vol_${userId}`);
      if (stored !== null) return Math.max(0, Math.min(150, Number(stored)));
    } catch {}
    return 100;
  }

  /** Toggle local mute for a remote participant */
  public toggleLocalMuteUser(userId: string): boolean {
    const node = this.peerAudio.get(userId);
    if (!node) return false;
    node.locallyMuted = !node.locallyMuted;
    this.updatePeerGain(userId);
    return node.locallyMuted;
  }

  public isUserLocallyMuted(userId: string): boolean {
    return this.peerAudio.get(userId)?.locallyMuted || false;
  }

  /** Update global hearing permission for local client */
  public setCanHear(allowed: boolean) {
    this.canHear = allowed;
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(allowed ? 1.0 : 0.0, this.audioContext.currentTime, 0.01);
    }
    this.peerAudio.forEach((_, uid) => this.updatePeerGain(uid));
  }

  /** Speaking Activity Detection Monitor (lightweight RMS calculation) */
  private startSpeakingMonitor() {
    if (this.checkInterval !== null) return;

    const buffer = new Uint8Array(128);
    const THRESHOLD = 14; // Audio energy threshold above silence

    this.checkInterval = window.setInterval(() => {
      // Check local user
      if (this.localAnalyser && this.canSpeak && !this.selfMuted && !this.hostMuted) {
        this.localAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const isSpeaking = avg > THRESHOLD;
        if (this.speakingMap.get(this.localUserId) !== isSpeaking) {
          this.speakingMap.set(this.localUserId, isSpeaking);
          this.callbacks.onSpeakingChange(this.localUserId, isSpeaking);
        }
      } else if (this.speakingMap.get(this.localUserId)) {
        this.speakingMap.set(this.localUserId, false);
        this.callbacks.onSpeakingChange(this.localUserId, false);
      }

      // Check remote peers
      this.peerAudio.forEach((node, uid) => {
        if (!node.analyserNode) return;
        node.analyserNode.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const isSpeaking = avg > THRESHOLD;
        if (this.speakingMap.get(uid) !== isSpeaking) {
          this.speakingMap.set(uid, isSpeaking);
          this.callbacks.onSpeakingChange(uid, isSpeaking);
        }
      });
    }, 150);
  }

  /** Disconnect and remove a single peer */
  public removePeer(userId: string) {
    const timer = this.reconnectTimers.get(userId);
    if (timer) {
      window.clearTimeout(timer);
      this.reconnectTimers.delete(userId);
    }
    const pc = this.peers.get(userId);
    if (pc) {
      pc.close();
      this.peers.delete(userId);
    }
    this.transceivers.delete(userId);
    this.iceCandidateQueues.delete(userId);

    const node = this.peerAudio.get(userId);
    if (node) {
      node.sourceNode?.disconnect();
      node.gainNode?.disconnect();
      node.analyserNode?.disconnect();
      if (node.audioElement) {
        node.audioElement.srcObject = null;
        node.audioElement.remove();
      }
      this.peerAudio.delete(userId);
    }
    if (this.speakingMap.get(userId)) {
      this.speakingMap.delete(userId);
      this.callbacks.onSpeakingChange(userId, false);
    }
  }

  /** Completely teardown Voice connections, tracks, and AudioContext */
  public destroy() {
    this.stopKeepAlive();

    if (this.onVisibilityChange) {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener("focus", this.onVisibilityChange);
      window.removeEventListener("pageshow", this.onVisibilityChange);
      this.onVisibilityChange = null;
    }

    if (this.userInteractionCleanup) {
      this.userInteractionCleanup();
      this.userInteractionCleanup = null;
    }

    this.reconnectTimers.forEach((timer) => window.clearTimeout(timer));
    this.reconnectTimers.clear();

    if (this.checkInterval !== null) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop local microphone
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.localAnalyser?.disconnect();
    this.localAnalyser = null;

    // Close all peer connections
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.transceivers.clear();
    this.iceCandidateQueues.clear();

    // Disconnect audio nodes and remove HTMLAudioElements
    this.peerAudio.forEach((node) => {
      node.sourceNode?.disconnect();
      node.gainNode?.disconnect();
      node.analyserNode?.disconnect();
      if (node.audioElement) {
        node.audioElement.srcObject = null;
        node.audioElement.remove();
      }
    });
    this.peerAudio.clear();
    this.speakingMap.clear();

    // Close master gain and AudioContext
    this.masterGain?.disconnect();
    this.masterGain = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
