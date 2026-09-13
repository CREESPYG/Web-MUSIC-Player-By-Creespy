import React, { useState } from "react";
import { motion } from "framer-motion";
import { persistence, type TrackHistoryItem, type RoomHistoryItem } from "../lib/persistence";
import type { Track } from "../lib/trackModel";
import {
  HistoryIcon,
  PlayIcon,
  TrashIcon,
  RadioTowerIcon,
  DiscIcon,
  PlusIcon,
  ShareIcon,
  CheckIcon,
} from "./UiIcons";

interface HistoryViewProps {
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onJoinRoom: (roomCode: string) => void;
  onToast: (msg: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onPlayTrack,
  onAddToQueue,
  onJoinRoom,
  onToast,
}) => {
  const [tab, setTab] = useState<"tracks" | "rooms">("tracks");
  const [trackHistory, setTrackHistory] = useState<TrackHistoryItem[]>(() => persistence.getTrackHistory());
  const [roomHistory, setRoomHistory] = useState<RoomHistoryItem[]>(() => persistence.getRoomHistory());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const clearCurrentHistory = () => {
    if (tab === "tracks") {
      persistence.clearTrackHistory();
      setTrackHistory([]);
      onToast("Playback history cleared");
    } else {
      persistence.clearRoomHistory();
      setRoomHistory([]);
      onToast("Room history cleared");
    }
  };

  const copyRoomLink = (code: string) => {
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      onToast(`Invite link copied for #${code}`);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--acc0)]/20 text-[var(--acc0)]">
              <HistoryIcon size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Playback & Room History</h1>
          </div>
          <p className="mt-1 text-xs text-[var(--dim)]">
            Persistent, deduplicated timeline of your listening sessions and shared rooms
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Selector */}
          <div className="flex rounded-lg bg-black/40 p-1 border border-white/10">
            <button
              onClick={() => setTab("tracks")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                tab === "tracks"
                  ? "bg-[var(--acc0)] text-black shadow-sm font-semibold"
                  : "text-[var(--dim)] hover:text-white"
              }`}
            >
              Tracks ({trackHistory.length})
            </button>
            <button
              onClick={() => setTab("rooms")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                tab === "rooms"
                  ? "bg-[var(--acc0)] text-black shadow-sm font-semibold"
                  : "text-[var(--dim)] hover:text-white"
              }`}
            >
              Rooms ({roomHistory.length})
            </button>
          </div>

          {(tab === "tracks" ? trackHistory.length > 0 : roomHistory.length > 0) && (
            <button
              onClick={clearCurrentHistory}
              title="Clear history"
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <TrashIcon size={13} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content Body */}
      {tab === "tracks" ? (
        trackHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-12 text-center">
            <DiscIcon size={40} className="text-[var(--dim)]/40 mb-3" />
            <h3 className="text-sm font-medium text-white">No tracks played yet</h3>
            <p className="mt-1 text-xs text-[var(--dim)] max-w-sm">
              Songs you play from the queue or playlists will automatically appear here with exact timestamps.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {trackHistory.map((item, idx) => {
              const isCurrent = persistence.getPlayback().trackId === item.track.videoId;
              return (
                <motion.div
                  key={`${item.track.id}-${item.playedAt}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className={`group flex items-center justify-between rounded-xl border p-3 transition-all ${
                    isCurrent
                      ? "border-[var(--acc0)]/50 bg-[var(--acc0)]/10"
                      : "border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/10">
                      <img
                        src={item.track.coverUrl || item.track.artwork || "/cover-placeholder.jpg"}
                        alt=""
                        className="h-full w-full object-cover object-center"
                      />
                      <button
                        onClick={() => onPlayTrack(item.track)}
                        aria-label={`Play ${item.track.title}`}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                      >
                        <PlayIcon size={18} />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {item.track.title}
                        </span>
                        {isCurrent && (
                          <span className="rounded bg-[var(--acc0)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
                            Playing
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--dim)]">
                        <span className="truncate">{item.track.artist}</span>
                        <span>•</span>
                        <span className="shrink-0">{formatRelativeTime(item.playedAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onAddToQueue(item.track);
                        onToast(`Added "${item.track.title}" to Queue`);
                      }}
                      title="Add to queue"
                      className="rounded-lg p-2 text-[var(--dim)] hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <PlusIcon size={15} />
                    </button>
                    <button
                      onClick={() => onPlayTrack(item.track)}
                      title="Play now"
                      className="flex items-center gap-1 rounded-lg bg-[var(--acc0)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--acc0)] hover:bg-[var(--acc0)]/30 transition-colors"
                    >
                      <PlayIcon size={13} />
                      Play
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      ) : (
        roomHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-12 text-center">
            <RadioTowerIcon size={40} className="text-[var(--dim)]/40 mb-3" />
            <h3 className="text-sm font-medium text-white">No rooms visited yet</h3>
            <p className="mt-1 text-xs text-[var(--dim)] max-w-sm">
              Any public or private room you host or join will be recorded here so you can quickly jump back.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roomHistory.map((room, idx) => (
              <motion.div
                key={`${room.roomCode}-${room.lastJoined}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="group flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-white/20 hover:bg-white/[0.06] transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-white">{room.name}</h4>
                      <p className="font-mono text-xs text-[var(--acc0)] mt-0.5">#{room.roomCode}</p>
                    </div>
                    {room.isHost ? (
                      <span className="shrink-0 rounded-full border border-[var(--acc0)]/30 bg-[var(--acc0)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--acc0)]">
                        Host
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[var(--dim)]">
                        Listener
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--dim)]">
                    Last active: {formatRelativeTime(room.lastJoined)}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                  <button
                    onClick={() => copyRoomLink(room.roomCode)}
                    className="flex items-center gap-1.5 text-xs text-[var(--dim)] hover:text-white transition-colors"
                  >
                    {copiedCode === room.roomCode ? (
                      <>
                        <CheckIcon size={13} className="text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <ShareIcon size={13} />
                        <span>Invite Link</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onJoinRoom(room.roomCode)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--acc0)] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-110 transition-all"
                  >
                    <RadioTowerIcon size={13} />
                    Re-Join
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
