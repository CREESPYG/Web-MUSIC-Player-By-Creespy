import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "../lib/realtime";
import { WebRtcVoiceManager } from "../lib/webrtc";
import { backgroundKeepAlive } from "../lib/backgroundKeepAlive";
import type { Member, MemberRole, VoiceParticipant } from "../lib/room";

export type VoiceStatus =
  | "disconnected"
  | "requesting_mic"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "voice_disabled"
  | "mic_blocked";

export interface UseVoiceOptions {
  roomId: string | null;
  channel: RealtimeChannel | null;
  myUserId: string;
  myNickname: string;
  myRole: MemberRole;
  voiceEnabled: boolean;
  members: Member[];
  onToast: (msg: string) => void;
}

function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyVoiceEvent(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus() && document.visibilityState === "visible") return;

  try {
    const n = new Notification(title, {
      body,
      tag: `voice-status-${Date.now()}`,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    setTimeout(() => n.close(), 4500);
  } catch {}
}

export function useVoice({
  roomId,
  channel,
  myUserId,
  myNickname,
  myRole,
  voiceEnabled,
  members,
  onToast,
}: UseVoiceOptions) {
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [selfMuted, setSelfMuted] = useState(false);
  const [hostMuted, setHostMuted] = useState(false);
  const [canSpeak, setCanSpeak] = useState(true);
  const [canHear, setCanHear] = useState(true);
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});
  const [voiceUsers, setVoiceUsers] = useState<Map<string, VoiceParticipant>>(new Map());
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>("");
  const [selectedOutput, setSelectedOutput] = useState<string>("");
  const [, setVolTicker] = useState(0);

  const rtcRef = useRef<WebRtcVoiceManager | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(channel);
  chanRef.current = channel;
  const myParticipantRef = useRef<VoiceParticipant | null>(null);
  const missingTimerRef = useRef<Map<string, number>>(new Map());
  const statusRef = useRef<VoiceStatus>(status);
  statusRef.current = status;
  const membersRef = useRef<Member[]>(members);
  membersRef.current = members;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const boundChannelRef = useRef<RealtimeChannel | null>(null);
  const voiceUsersRef = useRef(voiceUsers);
  voiceUsersRef.current = voiceUsers;
  const voiceKeepAliveReleaseRef = useRef<(() => void) | null>(null);

  const isOwner = myRole === "owner";
  const isHostOrOwner = myRole === "owner" || myRole === "host";

  // Enumerate audio hardware devices
  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(all.filter((d) => d.kind === "audioinput"));
      setAudioOutputs(all.filter((d) => d.kind === "audiooutput"));
    } catch {}
  }, []);

  useEffect(() => {
    loadDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", loadDevices);
      return () => navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    }
  }, [loadDevices]);

  /** Send a WebRTC or Voice control signal over Supabase Realtime */
  const sendVoiceBroadcast = useCallback((event: string, payload: any) => {
    const ch = chanRef.current;
    if (!ch) return;
    ch.send({
      type: "broadcast",
      event,
      payload,
    }).catch(() => {});
  }, []);

  /** Leave Room Voice */
  const leaveVoice = useCallback((notify = true) => {
    myParticipantRef.current = null;
    missingTimerRef.current.forEach((t) => window.clearTimeout(t));
    missingTimerRef.current.clear();

    if (rtcRef.current) {
      rtcRef.current.destroy();
      rtcRef.current = null;
    }
    if (voiceKeepAliveReleaseRef.current) {
      voiceKeepAliveReleaseRef.current();
      voiceKeepAliveReleaseRef.current = null;
    }
    sendVoiceBroadcast("voice_leave", { userId: myUserId });
    setVoiceUsers((prev) => {
      const next = new Map(prev);
      next.delete(myUserId);
      return next;
    });
    setSpeakingMap({});
    setStatus("disconnected");
    if (notify) {
      onToast("Disconnected from Voice Channel");
      notifyVoiceEvent("Voice Chat", "Disconnected from Voice Channel");
    }
  }, [myUserId, sendVoiceBroadcast, onToast]);

  // Handle voice disabled globally
  useEffect(() => {
    if (!voiceEnabled && statusRef.current !== "disconnected") {
      leaveVoice(false);
      setStatus("voice_disabled");
      onToastRef.current("Voice has been disabled by the host");
    }
  }, [voiceEnabled, leaveVoice]);

  // Leave voice if room changes or user leaves room
  useEffect(() => {
    if (!roomId && status !== "disconnected") {
      leaveVoice(false);
    }
  }, [roomId, leaveVoice]);

  /** Join Room Voice (Opt-In) */
  const joinVoice = useCallback(async () => {
    if (!voiceEnabled) {
      onToast("Voice is currently disabled in this room");
      return;
    }
    if (!roomId) return;

    setStatus("requesting_mic");

    const mgr = new WebRtcVoiceManager(myUserId, {
      onSignal: ({ to, from, event, payload }) => {
        sendVoiceBroadcast(event, { to, from, payload });
      },
      onSpeakingChange: (uid, isSpeaking) => {
        setSpeakingMap((prev) => (prev[uid] === isSpeaking ? prev : { ...prev, [uid]: isSpeaking }));
      },
      onPeerConnectionState: (_uid, _connState) => {},
      onError: (err) => {
        onToast(`Voice notice: ${err}`);
      },
    });

    rtcRef.current = mgr;
    mgr.canSpeak = canSpeak;
    mgr.canHear = canHear;
    mgr.selfMuted = selfMuted;
    mgr.hostMuted = hostMuted;

    try {
      await mgr.startMicrophone(selectedInput || undefined);
      if (!voiceKeepAliveReleaseRef.current) {
        voiceKeepAliveReleaseRef.current = backgroundKeepAlive.acquire();
      }
      setStatus("connected");
      onToast("Connected to Voice Channel");
      notifyVoiceEvent("Voice Chat", "Connected to Voice Channel");
      requestNotificationPermission();

      const meParticipant: VoiceParticipant = {
        userId: myUserId,
        nickname: myNickname,
        role: myRole,
        selfMuted,
        hostMuted,
        canSpeak,
        canHear,
        speaking: false,
        connectedAt: Date.now(),
      };

      myParticipantRef.current = meParticipant;

      setVoiceUsers((prev) => {
        const next = new Map(prev);
        next.set(myUserId, meParticipant);
        return next;
      });

      sendVoiceBroadcast("voice_join", meParticipant);
      sendVoiceBroadcast("voice_query", { from: myUserId });
      loadDevices();
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setStatus("mic_blocked");
        onToast("Microphone permission denied. Please allow microphone access.");
      } else {
        setStatus("disconnected");
        onToast(`Microphone error: ${err.message || "Failed to start"}`);
      }
      mgr.destroy();
      rtcRef.current = null;
      myParticipantRef.current = null;
    }
  }, [
    voiceEnabled,
    roomId,
    myUserId,
    myNickname,
    myRole,
    canSpeak,
    canHear,
    selfMuted,
    hostMuted,
    selectedInput,
    sendVoiceBroadcast,
    onToast,
    loadDevices,
  ]);

  /** Toggle Self Mute */
  const toggleSelfMute = useCallback(() => {
    setSelfMuted((prev) => {
      const next = !prev;
      if (rtcRef.current) {
        rtcRef.current.selfMuted = next;
        rtcRef.current.updateLocalTrackState();
      }
      sendVoiceBroadcast("voice_state", {
        userId: myUserId,
        selfMuted: next,
        hostMuted,
        canSpeak,
        canHear,
      });
      return next;
    });
  }, [myUserId, hostMuted, canSpeak, canHear, sendVoiceBroadcast]);

  /** Set Per-User Local Volume (0% - 150%) */
  const setUserVolume = useCallback((userId: string, volume: number) => {
    rtcRef.current?.setUserVolume(userId, volume);
    setVolTicker((t) => t + 1);
  }, []);

  const getUserVolume = useCallback((userId: string): number => {
    if (rtcRef.current) return rtcRef.current.getUserVolume(userId);
    try {
      const stored = localStorage.getItem(`creespy_voice_vol_${userId}`);
      if (stored !== null) return Math.max(0, Math.min(150, Number(stored)));
    } catch {}
    return 100;
  }, []);

  const toggleLocalMuteUser = useCallback((userId: string): boolean => {
    const res = rtcRef.current?.toggleLocalMuteUser(userId) || false;
    setVolTicker((t) => t + 1);
    return res;
  }, []);

  const isUserLocallyMuted = useCallback((userId: string): boolean => {
    return rtcRef.current?.isUserLocallyMuted(userId) || false;
  }, []);

  /** Change Audio Input Device */
  const setAudioInputDevice = useCallback(async (deviceId: string) => {
    setSelectedInput(deviceId);
    if (status === "connected" && rtcRef.current) {
      try {
        await rtcRef.current.startMicrophone(deviceId);
        onToast("Microphone switched");
      } catch {
        onToast("Failed to switch microphone");
      }
    }
  }, [status, onToast]);

  /** Change Audio Output Device */
  const setAudioOutputDevice = useCallback(async (deviceId: string) => {
    setSelectedOutput(deviceId);
    try {
      if (rtcRef.current) {
        await rtcRef.current.setAudioOutputSink(deviceId);
      }
      onToast("Audio output switched");
    } catch {
      onToast("Speaker output selection not supported in this browser");
    }
  }, [onToast]);

  useEffect(() => {
    if (myParticipantRef.current) {
      myParticipantRef.current.selfMuted = selfMuted;
      myParticipantRef.current.hostMuted = hostMuted;
      myParticipantRef.current.canSpeak = canSpeak;
      myParticipantRef.current.canHear = canHear;
      myParticipantRef.current.role = myRole;
      myParticipantRef.current.nickname = myNickname;
    }
  }, [selfMuted, hostMuted, canSpeak, canHear, myRole, myNickname]);

  /* ---------------- Host / Owner Moderation Actions ---------------- */

  const setMemberHostMuted = useCallback((targetUserId: string, muted: boolean) => {
    const targetMember = members.find((m) => m.id === targetUserId);
    if (targetMember?.role === "owner") {
      onToast("Cannot mute the Room Owner");
      return;
    }
    setVoiceUsers((prev) => {
      const existing = prev.get(targetUserId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(targetUserId, { ...existing, hostMuted: muted });
      return next;
    });
    if (rtcRef.current) {
      if (muted) {
        rtcRef.current.setUserVolume(targetUserId, 0);
      } else {
        const storedVol = getUserVolume(targetUserId) || 100;
        rtcRef.current.setUserVolume(targetUserId, storedVol);
      }
    }
    sendVoiceBroadcast("voice_host_action", {
      targetUserId,
      action: "host_mute",
      value: muted,
      byUserId: myUserId,
    });
    onToast(muted ? `Muted ${targetMember?.nickname || "member"}` : `Unmuted ${targetMember?.nickname || "member"}`);
  }, [members, myUserId, sendVoiceBroadcast, onToast, getUserVolume]);

  const setMemberCanSpeak = useCallback((targetUserId: string, allowed: boolean) => {
    const targetMember = members.find((m) => m.id === targetUserId);
    if (targetMember?.role === "owner") {
      onToast("Cannot restrict Room Owner");
      return;
    }
    setVoiceUsers((prev) => {
      const existing = prev.get(targetUserId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(targetUserId, { ...existing, canSpeak: allowed });
      return next;
    });
    sendVoiceBroadcast("voice_host_action", {
      targetUserId,
      action: "can_speak",
      value: allowed,
      byUserId: myUserId,
    });
    onToast(allowed ? `Allowed talk for ${targetMember?.nickname || "member"}` : `Revoked talk for ${targetMember?.nickname || "member"}`);
  }, [members, myUserId, sendVoiceBroadcast, onToast]);

  const setMemberCanHear = useCallback((targetUserId: string, allowed: boolean) => {
    const targetMember = members.find((m) => m.id === targetUserId);
    if (targetMember?.role === "owner") {
      onToast("Cannot restrict Room Owner");
      return;
    }
    setVoiceUsers((prev) => {
      const existing = prev.get(targetUserId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(targetUserId, { ...existing, canHear: allowed });
      return next;
    });
    sendVoiceBroadcast("voice_host_action", {
      targetUserId,
      action: "can_hear",
      value: allowed,
      byUserId: myUserId,
    });
    onToast(allowed ? `Enabled hearing for ${targetMember?.nickname || "member"}` : `Muted hearing for ${targetMember?.nickname || "member"}`);
  }, [members, myUserId, sendVoiceBroadcast, onToast]);

  const kickFromVoice = useCallback((targetUserId: string) => {
    const targetMember = members.find((m) => m.id === targetUserId);
    if (targetMember?.role === "owner") {
      onToast("Cannot disconnect Room Owner");
      return;
    }
    setVoiceUsers((prev) => {
      const next = new Map(prev);
      next.delete(targetUserId);
      return next;
    });
    rtcRef.current?.removePeer(targetUserId);
    setSpeakingMap((prev) => {
      if (!prev[targetUserId]) return prev;
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
    sendVoiceBroadcast("voice_host_action", {
      targetUserId,
      action: "kick_voice",
      value: true,
      byUserId: myUserId,
    });
    onToast(`Disconnected ${targetMember?.nickname || "member"} from voice`);
  }, [members, myUserId, sendVoiceBroadcast, onToast]);

  /* ---------------- Realtime Broadcast Listeners for Voice ---------------- */

  useEffect(() => {
    const ch = channel;
    if (!ch) return;

    if (boundChannelRef.current === ch) return;
    boundChannelRef.current = ch;

    // A remote peer joined voice
    const onVoiceJoin = ({ payload }: { payload: VoiceParticipant }) => {
      if (!payload || payload.userId === myUserId) return;

      const t = missingTimerRef.current.get(payload.userId);
      if (t) {
        window.clearTimeout(t);
        missingTimerRef.current.delete(payload.userId);
      }

      setVoiceUsers((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, payload);
        return next;
      });

      // Only announce to user if local user is actually active in voice
      if (statusRef.current === "connected" && payload.nickname) {
        onToastRef.current(`${payload.nickname} joined voice`);
        notifyVoiceEvent("Voice Chat", `${payload.nickname} joined voice`);
      }

      // If we are in voice, reply with voice_announce and connect peer
      if (myParticipantRef.current && statusRef.current === "connected" && rtcRef.current) {
        sendVoiceBroadcast("voice_announce", {
          to: payload.userId,
          participant: myParticipantRef.current,
        });
        const shouldOffer = myUserId > payload.userId;
        rtcRef.current.connectToPeer(payload.userId, shouldOffer);
      }
    };

    const onVoiceQuery = ({ payload }: { payload: { from: string } }) => {
      if (!payload?.from || payload.from === myUserId) return;
      if (myParticipantRef.current && statusRef.current === "connected") {
        sendVoiceBroadcast("voice_announce", {
          to: payload.from,
          participant: myParticipantRef.current,
        });
      }
    };

    const onVoiceAnnounce = ({ payload }: { payload: { to?: string; participant: VoiceParticipant } }) => {
      if (!payload?.participant) return;
      if (payload.to && payload.to !== myUserId) return;
      const p = payload.participant;
      if (p.userId === myUserId) return;

      const t = missingTimerRef.current.get(p.userId);
      if (t) {
        window.clearTimeout(t);
        missingTimerRef.current.delete(p.userId);
      }

      setVoiceUsers((prev) => {
        const next = new Map(prev);
        next.set(p.userId, p);
        return next;
      });

      if (rtcRef.current && statusRef.current === "connected") {
        const pc = rtcRef.current.getPeer(p.userId);
        if (!pc || pc.connectionState === "closed" || pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          const shouldOffer = myUserId > p.userId;
          rtcRef.current.connectToPeer(p.userId, shouldOffer);
        }
      }
    };

    const onVoiceHeartbeat = ({ payload }: { payload: { participant: VoiceParticipant } }) => {
      if (!payload?.participant) return;
      const p = payload.participant;
      if (p.userId === myUserId) return;

      const t = missingTimerRef.current.get(p.userId);
      if (t) {
        window.clearTimeout(t);
        missingTimerRef.current.delete(p.userId);
      }

      setVoiceUsers((prev) => {
        const existing = prev.get(p.userId);
        if (
          existing &&
          existing.nickname === p.nickname &&
          existing.role === p.role &&
          existing.selfMuted === p.selfMuted &&
          existing.hostMuted === p.hostMuted &&
          existing.canSpeak === p.canSpeak &&
          existing.canHear === p.canHear &&
          existing.speaking === p.speaking
        ) {
          return prev;
        }
        const next = new Map(prev);
        next.set(p.userId, { ...(existing || {}), ...p });
        return next;
      });

      if (rtcRef.current && statusRef.current === "connected") {
        const pc = rtcRef.current.getPeer(p.userId);
        if (!pc || pc.connectionState === "closed" || pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          const shouldOffer = myUserId > p.userId;
          rtcRef.current.connectToPeer(p.userId, shouldOffer);
        }
      }
    };

    const onVoiceLeave = ({ payload }: { payload: { userId: string } }) => {
      if (!payload?.userId) return;
      const t = missingTimerRef.current.get(payload.userId);
      if (t) {
        window.clearTimeout(t);
        missingTimerRef.current.delete(payload.userId);
      }
      setVoiceUsers((prev) => {
        const next = new Map(prev);
        next.delete(payload.userId);
        return next;
      });
      rtcRef.current?.removePeer(payload.userId);
      setSpeakingMap((prev) => {
        if (!prev[payload.userId]) return prev;
        const next = { ...prev };
        delete next[payload.userId];
        return next;
      });
    };

    // WebRTC signaling
    const onVoiceOffer = async ({ payload }: { payload: any }) => {
      if (payload?.to !== myUserId) return;
      if (rtcRef.current && statusRef.current === "connected") {
        await rtcRef.current.handleOffer(payload.from, payload.payload);
      }
    };

    const onVoiceAnswer = async ({ payload }: { payload: any }) => {
      if (payload?.to !== myUserId) return;
      if (rtcRef.current && statusRef.current === "connected") {
        await rtcRef.current.handleAnswer(payload.from, payload.payload);
      }
    };

    const onVoiceIce = async ({ payload }: { payload: any }) => {
      if (payload?.to !== myUserId) return;
      if (rtcRef.current && statusRef.current === "connected") {
        await rtcRef.current.handleIceCandidate(payload.from, payload.payload);
      }
    };

    const onVoiceRenegotiate = async ({ payload }: { payload: any }) => {
      if (payload?.to !== myUserId) return;
      if (rtcRef.current && statusRef.current === "connected") {
        await rtcRef.current.handleRenegotiate(payload.from);
      }
    };

    const onVoiceState = ({ payload }: { payload: any }) => {
      if (!payload?.userId) return;
      setVoiceUsers((prev) => {
        const existing = prev.get(payload.userId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(payload.userId, { ...existing, ...payload });
        return next;
      });
    };

    const onVoiceHostAction = ({ payload }: { payload: any }) => {
      if (!payload) return;
      const { targetUserId, action, value } = payload;

      setVoiceUsers((prev) => {
        const existing = prev.get(targetUserId);
        if (!existing) return prev;
        const next = new Map(prev);
        if (action === "host_mute") next.set(targetUserId, { ...existing, hostMuted: value });
        else if (action === "can_speak") next.set(targetUserId, { ...existing, canSpeak: value });
        else if (action === "can_hear") next.set(targetUserId, { ...existing, canHear: value });
        return next;
      });

      if (targetUserId === myUserId) {
        if (action === "host_mute") {
          setHostMuted(value);
          if (rtcRef.current) {
            rtcRef.current.hostMuted = value;
            rtcRef.current.updateLocalTrackState();
          }
          onToastRef.current(value ? "You were muted by the Host" : "Host unmuted your microphone");
        } else if (action === "can_speak") {
          setCanSpeak(value);
          if (rtcRef.current) {
            rtcRef.current.canSpeak = value;
            rtcRef.current.updateLocalTrackState();
          }
          onToastRef.current(value ? "Talk permission granted" : "Talk permission revoked by Host");
        } else if (action === "can_hear") {
          setCanHear(value);
          if (rtcRef.current) {
            rtcRef.current.setCanHear(value);
          }
          onToastRef.current(value ? "Hearing permission enabled" : "Hearing permission disabled by Host");
        } else if (action === "kick_voice") {
          leaveVoice();
          onToastRef.current("You were disconnected from voice by the Host");
        }
      }
    };

    ch.on("broadcast", { event: "voice_join" }, onVoiceJoin);
    ch.on("broadcast", { event: "voice_query" }, onVoiceQuery);
    ch.on("broadcast", { event: "voice_announce" }, onVoiceAnnounce);
    ch.on("broadcast", { event: "voice_heartbeat" }, onVoiceHeartbeat);
    ch.on("broadcast", { event: "voice_leave" }, onVoiceLeave);
    ch.on("broadcast", { event: "voice_offer" }, onVoiceOffer);
    ch.on("broadcast", { event: "voice_answer" }, onVoiceAnswer);
    ch.on("broadcast", { event: "voice_ice" }, onVoiceIce);
    ch.on("broadcast", { event: "voice_renegotiate" }, onVoiceRenegotiate);
    ch.on("broadcast", { event: "voice_state" }, onVoiceState);
    ch.on("broadcast", { event: "voice_host_action" }, onVoiceHostAction);

    return () => {};
  }, [channel, myUserId, sendVoiceBroadcast, leaveVoice]);

  /** Heartbeat emitter when connected to voice */
  useEffect(() => {
    if (status !== "connected" || !myParticipantRef.current) return;
    const unbind = backgroundKeepAlive.onTick(() => {
      if (myParticipantRef.current && statusRef.current === "connected") {
        sendVoiceBroadcast("voice_heartbeat", { participant: myParticipantRef.current });
      }
    });
    return unbind;
  }, [status, sendVoiceBroadcast]);

  /** Auto-resync when switching back to this tab */
  useEffect(() => {
    const handleReSync = () => {
      if (document.visibilityState !== "visible") return;
      if (statusRef.current !== "connected" || !myParticipantRef.current) return;

      if (rtcRef.current) {
        rtcRef.current.ensureAudioContext().catch(() => {});
      }

      sendVoiceBroadcast("voice_query", { from: myUserId });
      sendVoiceBroadcast("voice_announce", { participant: myParticipantRef.current });

      const reconnectAfter = (delay: number) => {
        window.setTimeout(() => {
          if (!rtcRef.current || statusRef.current !== "connected") return;
          voiceUsersRef.current.forEach((p) => {
            if (p.userId === myUserId) return;
            const pc = rtcRef.current?.getPeer(p.userId);
            const badState =
              !pc ||
              pc.connectionState === "failed" ||
              pc.connectionState === "closed";
            if (badState) {
              const shouldOffer = myUserId > p.userId;
              rtcRef.current?.connectToPeer(p.userId, shouldOffer);
            }
          });
        }, delay);
      };

      reconnectAfter(1500);
      reconnectAfter(4000);
    };

    document.addEventListener("visibilitychange", handleReSync);
    window.addEventListener("focus", handleReSync);
    window.addEventListener("pageshow", handleReSync);
    return () => {
      document.removeEventListener("visibilitychange", handleReSync);
      window.removeEventListener("focus", handleReSync);
      window.removeEventListener("pageshow", handleReSync);
    };
  }, [myUserId, sendVoiceBroadcast]);

  // Clean tear-down on unmount
  useEffect(() => {
    return () => {
      missingTimerRef.current.forEach((t) => window.clearTimeout(t));
      missingTimerRef.current.clear();
      if (voiceKeepAliveReleaseRef.current) {
        voiceKeepAliveReleaseRef.current();
        voiceKeepAliveReleaseRef.current = null;
      }
      if (rtcRef.current) {
        rtcRef.current.destroy();
        rtcRef.current = null;
      }
    };
  }, []);

  const participantsList = useMemo(() => {
    return Array.from(voiceUsers.values()).sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      if (a.role === "host") return -1;
      if (b.role === "host") return 1;
      return a.connectedAt - b.connectedAt;
    });
  }, [voiceUsers]);

  const effectiveMicMuted = !canSpeak || selfMuted || hostMuted;

  return {
    status,
    isInVoice: status === "connected" || status === "reconnecting",
    inVoice: status === "connected" || status === "reconnecting",
    selfMuted,
    hostMuted,
    canSpeak,
    canHear,
    effectiveMicMuted,
    effectiveMicEnabled: !effectiveMicMuted,
    voiceEnabled,
    speakingMap,
    voiceUsers: participantsList,
    participants: participantsList,
    voiceCount: participantsList.length,
    audioInputs,
    audioOutputs,
    selectedInput,
    selectedOutput,
    isOwner,
    isHostOrOwner,
    // Actions
    joinVoice,
    leaveVoice,
    toggleSelfMute,
    toggleMic: toggleSelfMute,
    setUserVolume,
    getUserVolume,
    toggleLocalMuteUser,
    isUserLocallyMuted,
    setAudioInputDevice,
    setAudioOutputDevice,
    setMemberHostMuted,
    setMemberCanSpeak,
    setMemberCanHear,
    kickFromVoice,
  };
}

export type VoiceApi = ReturnType<typeof useVoice>;
