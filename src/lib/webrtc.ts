/**
 * WebRTC Mesh Audio Engine & Web Audio API Pipeline for CREESPY Voice.
 *
 * Implements:
 * 1. Native WebRTC mesh connections between room voice peers with automatic ICE recovery.
 * 2. Background audio keep-alive preventing browser throttling/suspension during tab switching.
 * 3. Dedicated HTMLAudioElement output sink for uninterrupted background tab audio playback.
 * 4. AnalyserNodes for low-overhead real-time speaking detection (RMS volume).
 * 5. Automatic visibility & focus resynchronization to resume suspended AudioContexts.
 * 6. Full audio isolation from the YouTube music player.
 */

import { backgroundKeepAlive } from "./backgroundKeepAlive";

export interface IceConfig {
  iceServers: RTCIceServer[];
}

export function getIceConfig(): IceConfig {
  const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302", "stun:stun4.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ];

  if (metaEnv.VITE_STUN_SERVER_URL) {
    servers.push({ urls: [metaEnv.VITE_STUN_SERVER_URL] });
  }

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
  private localStream: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private peerAudio = new Map<string, PeerAudioNode>();
  private speakingMap = new Map<string, boolean>();
  private checkInterval: number | null = null;
  private keepAliveRelease: (() => void) | null = null;
  private reconnectTimers = new Map<string, number>();
  private onVisibilityChange: (() => void) | null = null;

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

  /** Auto-wake audio and WebRTC connections when switching back into the tab */
  private setupVisibilityListeners() {
    if (typeof document === "undefined") return;
    this.onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Always resume AudioContext first — it may have been suspended by the browser
        this.ensureAudioContext().catch(() => {});

        // Resume any paused audio elements
        this.peerAudio.forEach((node) => {
          if (node.audioElement && node.audioElement.paused && this.canHear && !node.locallyMuted) {
            node.audioElement.play().catch(() => {});
          }
        });

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
  }

  /** Initialize or resume Web Audio Context on user gesture */
  public async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext || this.audioContext.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
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

      // Attach track to all existing peer connections
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.peers.forEach((pc) => {
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track?.kind === "audio");
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch(() => {});
          } else {
            pc.addTrack(audioTrack, stream);
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
    }

    const config = getIceConfig();
    pc = new RTCPeerConnection(config);
    this.peers.set(remoteUserId, pc);

    // Add local audio track if microphone active
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track) {
        pc.addTrack(track, this.localStream);
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
        // Immediate recovery for hard failures
        this.recoverPeerConnection(remoteUserId, true);
      } else if (state === "disconnected") {
        // Shorter grace period (3 s instead of 5 s) for faster recovery
        this.recoverPeerConnection(remoteUserId, false);
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.setupRemoteAudio(remoteUserId, remoteStream);
      }
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
   * Disconnected states get a 3 s grace window to self-heal (reduced from 5 s).
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

  /** Handle incoming SDP offer */
  public async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
    const pc = await this.connectToPeer(fromUserId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.callbacks.onSignal({
      to: fromUserId,
      from: this.localUserId,
      event: "voice_answer",
      payload: answer,
    });
  }

  /** Handle incoming SDP answer */
  public async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peers.get(fromUserId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  /** Handle incoming ICE candidate */
  public async handleIceCandidate(fromUserId: string, candidateInit: RTCIceCandidateInit) {
    const pc = this.peers.get(fromUserId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch {
      /* ignore candidate race */
    }
  }

  /** Setup direct HTMLAudioElement output sink for background tab survival */
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

    // Attach to HTMLAudioElement as the primary playback sink for uninterrupted background playback
    let audioEl = existing?.audioElement;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true;
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

    // Web Audio pipeline: source → gain → analyser
    // The gainNode allows volume above 1.0 (100%) up to 1.5 (150%).
    // The audioElement is the primary audio output (works in background).
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

  /** Update gain for a peer: uses HTMLAudioElement for 0-100%, gainNode for 100-150% */
  public updatePeerGain(userId: string) {
    const node = this.peerAudio.get(userId);
    if (!node) return;

    const muted = !this.canHear || node.locallyMuted;

    // HTMLAudioElement controls whether audio plays at all (and handles background tabs)
    const audioEl = node.audioElement;
    if (audioEl) {
      if (muted) {
        audioEl.muted = true;
        audioEl.volume = 0;
      } else {
        audioEl.muted = false;
        // Cap audioEl volume at 1.0; for >100% we boost with gainNode
        const elVol = Math.max(0, Math.min(1.0, node.volume / 100));
        audioEl.volume = elVol;
      }
      if (audioEl.paused && !muted) {
        audioEl.play().catch(() => {});
      }
    }

    // gainNode provides amplification for volumes above 100%
    if (node.gainNode) {
      if (muted) {
        node.gainNode.gain.setTargetAtTime(0, node.gainNode.context.currentTime, 0.01);
      } else {
        const gain = node.volume / 100; // 0.0 – 1.5
        node.gainNode.gain.setTargetAtTime(gain, node.gainNode.context.currentTime, 0.01);
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

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
