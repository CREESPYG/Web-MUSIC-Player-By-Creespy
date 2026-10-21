import React, { useState, useMemo } from "react";
import type { AdminUserRecord } from "../types";

interface UsersViewProps {
  users: AdminUserRecord[];
  onRefresh: () => void;
  loading: boolean;
  onFilterPlaylistsByUser?: (uid: string) => void;
}

export const UsersView: React.FC<UsersViewProps> = ({
  users,
  onRefresh,
  loading,
  onFilterPlaylistsByUser,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "online" | "creators">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const copyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedId(uid);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterMode === "online" && !u.isOnline) return false;
      if (filterMode === "creators" && u.playlistsCount === 0) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        u.uid.toLowerCase().includes(term) ||
        u.authorName.toLowerCase().includes(term) ||
        (u.platform && u.platform.toLowerCase().includes(term))
      );
    });
  }, [users, searchTerm, filterMode]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const onlineCount = users.filter((u) => u.isOnline).length;

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">User Directory & Active Visitors</h2>
          <p className="admin-desc">
            Showing every registered creator and live anonymous listeners detected across Supabase
          </p>
        </div>
        <div className="admin-actions-bar">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={onRefresh}
            disabled={loading}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            <span>{loading ? "Refreshing…" : "Refresh Users"}</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="admin-stats-strip">
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Total Unique Users</span>
          <span className="admin-strip-val">{users.length}</span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Online Now</span>
          <span className="admin-strip-val text-cyan">{onlineCount}</span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Playlist Publishers</span>
          <span className="admin-strip-val text-emerald">
            {users.filter((u) => u.playlistsCount > 0).length}
          </span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by User ID, Name, or Platform…"
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
            All ({users.length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "online" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("online"); setPage(1); }}
          >
            Online Now ({onlineCount})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "creators" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("creators"); setPage(1); }}
          >
            Creators ({users.filter((u) => u.playlistsCount > 0).length})
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="admin-table-container">
        <table className="admin-brutalist-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>User Name / Nickname</th>
              <th>User ID (owner_uid)</th>
              <th>Playlists</th>
              <th>Tracks</th>
              <th>Total Plays</th>
              <th>Platform / Source</th>
              <th>First Seen</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.length === 0 ? (
              <tr>
                <td colSpan={10} className="admin-table-empty">
                  No users found matching your search.
                </td>
              </tr>
            ) : (
              paginatedUsers.map((u) => (
                <tr key={u.uid} className={u.isOnline ? "admin-tr-online" : ""}>
                  <td>
                    {u.isOnline ? (
                      <span className="admin-pill admin-pill--online">
                        <span className="admin-pulse-dot-sm" /> ONLINE
                      </span>
                    ) : (
                      <span className="admin-pill admin-pill--offline">OFFLINE</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-user-cell">
                      <span className="admin-user-avatar">
                        {(u.authorName || "U").charAt(0).toUpperCase()}
                      </span>
                      <span className="admin-user-name" title={u.authorName}>
                        {u.authorName || "Anonymous"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-uid-cell">
                      <code className="admin-mono-text">{u.uid}</code>
                      <button
                        type="button"
                        className="admin-copy-btn"
                        onClick={() => copyUid(u.uid)}
                        title="Copy UID"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                          {copiedId === u.uid ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="admin-mono-bold">{u.playlistsCount}</span>
                  </td>
                  <td>
                    <span className="admin-mono-muted">{u.tracksCount}</span>
                  </td>
                  <td>
                    <span className="admin-badge-plays">{u.totalPlays}</span>
                  </td>
                  <td>
                    <span className="admin-pill admin-pill--platform">{u.platform || "Web"}</span>
                  </td>
                  <td className="admin-date-cell">
                    {new Date(u.firstSeen).toLocaleDateString()}
                  </td>
                  <td className="admin-date-cell">
                    {new Date(u.lastActive).toLocaleDateString()} {new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {u.playlistsCount > 0 && onFilterPlaylistsByUser && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--micro admin-btn--accent"
                        onClick={() => onFilterPlaylistsByUser(u.uid)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>queue_music</span>
                        <span>Playlists</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--admin-border-soft)", background: "rgba(0,0,0,0.15)" }}>
            <span className="admin-mono-muted-sm">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredUsers.length)} of {filteredUsers.length} users
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
