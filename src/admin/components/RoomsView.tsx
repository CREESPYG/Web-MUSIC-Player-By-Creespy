import React, { useState, useMemo } from "react";
import type { AdminRoomRecord } from "../types";
import { adminService } from "../supabaseAdmin";

interface RoomsViewProps {
  rooms: { active: AdminRoomRecord[]; old: AdminRoomRecord[]; all: AdminRoomRecord[] };
  onRefresh: () => void;
  loading: boolean;
}

export const RoomsView: React.FC<RoomsViewProps> = ({ rooms, onRefresh, loading }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "active" | "old" | "public" | "private">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const copyInvite = (code: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/#room=${code.toUpperCase()}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRegisterRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const code = manualCode.trim().toUpperCase();
    adminService.registerRoom({
      code,
      name: `Admin Probe ${code}`,
      hostName: "Admin Inspector",
      hostId: `admin-${Date.now().toString(36)}`,
      isPublic: true,
      requireApproval: false,
      count: 1,
      createdAt: Date.now(),
      lastActive: Date.now(),
      status: "active",
    });
    setManualCode("");
    setShowAddRoom(false);
    onRefresh();
  };

  const filteredRooms = useMemo(() => {
    return rooms.all.filter((r) => {
      if (filterMode === "active" && r.status !== "active") return false;
      if (filterMode === "old" && r.status === "active") return false;
      if (filterMode === "public" && !r.isPublic) return false;
      if (filterMode === "private" && r.isPublic) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        r.code.toLowerCase().includes(term) ||
        r.name.toLowerCase().includes(term) ||
        r.hostName.toLowerCase().includes(term) ||
        r.hostId.toLowerCase().includes(term)
      );
    });
  }, [rooms.all, filterMode, searchTerm]);

  const totalPages = Math.ceil(filteredRooms.length / pageSize) || 1;
  const paginatedRooms = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRooms.slice(start, start + pageSize);
  }, [filteredRooms, page, pageSize]);

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">Listen Together Rooms Control</h2>
          <p className="admin-desc">
            Active broadcasts, old sessions, room codes, access controls & real-time presence
          </p>
        </div>
        <div className="admin-actions-bar">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => setShowAddRoom(!showAddRoom)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              {showAddRoom ? "close" : "add_circle"}
            </span>
            <span>{showAddRoom ? "Cancel" : "Register Room Probe"}</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={onRefresh}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            <span>{loading ? "Refreshing…" : "Refresh Rooms"}</span>
          </button>
        </div>
      </div>

      {/* Manual Probe Modal/Form */}
      {showAddRoom && (
        <form className="admin-card-glass admin-card-inline-form" onSubmit={handleRegisterRoom}>
          <div className="admin-form-row" style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "220px" }}>
              <label className="admin-label-modern">Room Code to Track/Inspect</label>
              <input
                type="text"
                className="admin-input-modern"
                placeholder="e.g. 5-character CODE"
                maxLength={8}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div>
              <button type="submit" className="admin-btn admin-btn--accent">
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>radar</span>
                <span>Start Tracking Room</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Stats Summary */}
      <div className="admin-stats-strip">
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Active Live Rooms</span>
          <span className="admin-strip-val text-magenta">{rooms.active.length}</span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Historical / Old Rooms</span>
          <span className="admin-strip-val">{rooms.old.length}</span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Public vs Private</span>
          <span className="admin-strip-val text-cyan">
            {rooms.all.filter((r) => r.isPublic).length} / {rooms.all.filter((r) => !r.isPublic).length}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by Room Code, Room Name, or Host…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
          {searchTerm && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => {
                setSearchTerm("");
                setPage(1);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
            </button>
          )}
        </div>

        <div className="admin-segmented-control">
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "all" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("all"); setPage(1); }}
          >
            All ({rooms.all.length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "active" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("active"); setPage(1); }}
          >
            Active Live ({rooms.active.length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "old" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("old"); setPage(1); }}
          >
            Old Rooms ({rooms.old.length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "public" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("public"); setPage(1); }}
          >
            Public
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "private" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("private"); setPage(1); }}
          >
            Private
          </button>
        </div>
      </div>

      {/* Rooms Table */}
      <div className="admin-table-container">
        <table className="admin-brutalist-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Room Code</th>
              <th>Room Name</th>
              <th>Access Type</th>
              <th>Host Name</th>
              <th>Host ID</th>
              <th>Members / Listeners</th>
              <th>Approval Req.</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRooms.length === 0 ? (
              <tr>
                <td colSpan={10} className="admin-table-empty">
                  No rooms found matching current filter.
                </td>
              </tr>
            ) : (
              paginatedRooms.map((r) => (
                <tr key={r.code} className={r.status === "active" ? "admin-tr-active-room" : ""}>
                  <td>
                    {r.status === "active" ? (
                      <span className="admin-pill admin-pill--live-room">
                        <span className="admin-pulse-dot-sm" /> LIVE
                      </span>
                    ) : (
                      <span className="admin-pill admin-pill--ended">ENDED</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-room-code-badge">
                      <code className="admin-room-code">{r.code}</code>
                      <button
                        type="button"
                        className="admin-copy-btn"
                        onClick={() => copyInvite(r.code)}
                        title="Copy Room Invite Link"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                          {copiedCode === r.code ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="admin-room-name-text">{r.name || `Room ${r.code}`}</span>
                  </td>
                  <td>
                    {r.isPublic ? (
                      <span className="admin-pill admin-pill--public">PUBLIC</span>
                    ) : (
                      <span className="admin-pill admin-pill--private">PRIVATE</span>
                    )}
                  </td>
                  <td>
                    <span className="admin-host-name">{r.hostName || "Host"}</span>
                  </td>
                  <td>
                    <code className="admin-mono-muted-sm">{r.hostId}</code>
                  </td>
                  <td>
                    <span className="admin-badge-count">{r.count || 1} online</span>
                  </td>
                  <td>
                    {r.requireApproval ? (
                      <span className="admin-pill admin-pill--warning">Approval</span>
                    ) : (
                      <span className="admin-pill admin-pill--ok">Direct</span>
                    )}
                  </td>
                  <td className="admin-date-cell">
                    {new Date(r.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <div className="admin-table-actions">
                      <a
                        href={`/#room=${r.code}`}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-btn admin-btn--micro admin-btn--ghost"
                        title="Open room in listener window"
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <span>Join Room</span>
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>open_in_new</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--admin-border-soft)", background: "rgba(0,0,0,0.15)" }}>
            <span className="admin-mono-muted-sm">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRooms.length)} of {filteredRooms.length} rooms
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="admin-btn admin-btn--micro admin-btn--ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </button>
              <span className="admin-mono-text-sm" style={{ padding: "0 6px" }}>Page {page} of {totalPages}</span>
              <button
                type="button"
                className="admin-btn admin-btn--micro admin-btn--ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
