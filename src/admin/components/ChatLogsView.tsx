import React, { useState, useMemo } from "react";
import type { AdminChatLog } from "../types";

interface ChatLogsViewProps {
  chatLogs: AdminChatLog[];
  onRefresh: () => void;
  loading: boolean;
}

export const ChatLogsView: React.FC<ChatLogsViewProps> = ({ chatLogs, onRefresh, loading }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<string>("all");

  const distinctRooms = useMemo(() => {
    const set = new Set<string>();
    chatLogs.forEach((c) => set.add(c.roomCode));
    return Array.from(set);
  }, [chatLogs]);

  const filteredLogs = useMemo(() => {
    return chatLogs.filter((c) => {
      if (selectedRoom !== "all" && c.roomCode !== selectedRoom) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        c.message.toLowerCase().includes(term) ||
        c.nickname.toLowerCase().includes(term) ||
        c.userId.toLowerCase().includes(term) ||
        c.roomCode.toLowerCase().includes(term)
      );
    });
  }, [chatLogs, selectedRoom, searchTerm]);

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">Real-time Room Chat Moderation Logs</h2>
          <p className="admin-desc">
            Live broadcast message feed captured across all active "Listen Together" rooms via Supabase Realtime
          </p>
        </div>
        <div className="admin-actions-bar">
          <div className="admin-pill admin-pill--online">
            <span className="admin-pulse-dot-sm" /> LISTENING TO ROOM:*:CHAT
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={onRefresh}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            <span>{loading ? "Refreshing…" : "Refresh Feed"}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search message text, sender nickname, or user ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setSearchTerm("")}
              title="Clear search"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
            </button>
          )}
        </div>

        {distinctRooms.length > 0 && (
          <div className="admin-segmented-control">
            <button
              type="button"
              className={`admin-seg-btn ${selectedRoom === "all" ? "admin-seg-btn--active" : ""}`}
              onClick={() => setSelectedRoom("all")}
            >
              All Rooms
            </button>
            {distinctRooms.map((rc) => (
              <button
                key={rc}
                type="button"
                className={`admin-seg-btn ${selectedRoom === rc ? "admin-seg-btn--active" : ""}`}
                onClick={() => setSelectedRoom(rc)}
              >
                Room {rc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat Messages List — fills remaining height */}
      <div className="admin-table-container">
        {filteredLogs.length === 0 ? (
          <div className="admin-chat-empty">
            <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--admin-acc)", marginBottom: "8px" }}>
              forum
            </span>
            <div className="admin-chat-empty-title">No Chat Messages Recorded Yet</div>
            <p className="admin-chat-empty-desc">
              When users in active rooms send chat messages, they stream into this console automatically via Supabase broadcast channels.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px" }}>
            {filteredLogs.map((c) => (
              <div key={c.id} className="admin-chat-row">
                <div className="admin-chat-meta">
                  <span className="admin-chat-room-badge" onClick={() => setSelectedRoom(c.roomCode)} title="Filter by this room">
                    <span className="material-symbols-outlined" style={{ fontSize: "12px", verticalAlign: "-2px", marginRight: "2px" }}>meeting_room</span>
                    #{c.roomCode}
                  </span>
                  <span className="admin-chat-author">{c.nickname}</span>
                  <code className="admin-mono-muted-xs">{c.userId}</code>
                  <span className="admin-chat-time" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>schedule</span>
                    <span>{new Date(c.timestamp).toLocaleTimeString()}</span>
                  </span>
                </div>
                <div className="admin-chat-msg">{c.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
