import React, { useState, useMemo } from "react";
import type { AdminPlaylist } from "../types";
import { adminService } from "../supabaseAdmin";
import { EditPlaylistModal } from "./EditPlaylistModal";

interface PlaylistsViewProps {
  playlists: AdminPlaylist[];
  onRefresh: () => void;
  loading: boolean;
  filterByUid?: string | null;
  onClearUidFilter?: () => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  playlists,
  onRefresh,
  loading,
  filterByUid,
  onClearUidFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "public" | "local" | "hidden">("all");
  const [copiedPlaylistId, setCopiedPlaylistId] = useState<string | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<AdminPlaylist | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const copyPlaylistLink = (pid: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/#playlist=${encodeURIComponent(pid)}`;
    navigator.clipboard.writeText(link);
    setCopiedPlaylistId(pid);
    setTimeout(() => setCopiedPlaylistId(null), 2000);
  };

  const showFlash = (kind: "success" | "error", text: string) => {
    setFlashMessage({ kind, text });
    setTimeout(() => setFlashMessage(null), 4000);
  };

  const handleToggleHide = async (p: AdminPlaylist) => {
    const res = await adminService.toggleHidePlaylist(p.id, !!p.hidden);
    if (res.ok) {
      showFlash("success", `Playlist "${p.title}" is now ${p.hidden ? "Public" : "Hidden"}.`);
      onRefresh();
    } else {
      showFlash("error", res.error || "Failed to toggle status.");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    setDeletingId(id);
    const res = await adminService.deletePlaylist(id);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (res.ok) {
      showFlash("success", `Deleted playlist "${title}" from Supabase.`);
      onRefresh();
    } else {
      showFlash("error", res.error || "Failed to delete playlist.");
    }
  };

  const filteredPlaylists = useMemo(() => {
    return playlists.filter((p) => {
      if (filterByUid && p.owner_uid !== filterByUid) return false;
      if (filterMode === "public" && (p.hidden || p.sourceType === "local")) return false;
      if (filterMode === "local" && p.sourceType !== "local") return false;
      if (filterMode === "hidden" && !p.hidden) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.title.toLowerCase().includes(term) ||
        p.author.toLowerCase().includes(term) ||
        p.owner_uid.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term)
      );
    });
  }, [playlists, filterByUid, filterMode, searchTerm]);

  const totalPages = Math.ceil(filteredPlaylists.length / pageSize) || 1;
  const paginatedPlaylists = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPlaylists.slice(start, start + pageSize);
  }, [filteredPlaylists, page, pageSize]);

  const getPlatformsSummary = (p: AdminPlaylist) => {
    const set = new Set<string>();
    for (const t of p.tracks || []) {
      const src = t.sourcePlatform || t.sourceType || "youtube";
      set.add(src.charAt(0).toUpperCase() + src.slice(1));
    }
    return Array.from(set).join(", ") || "YouTube";
  };

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">Supabase Public Playlists & Moderation</h2>
          <p className="admin-desc">
            Edit titles, authors, tracks, modify audio sources, toggle visibility, or delete directly from database
          </p>
        </div>
        <div className="admin-actions-bar">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={onRefresh}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            <span>{loading ? "Refreshing…" : "Refresh Playlists"}</span>
          </button>
        </div>
      </div>

      {/* Flash Message */}
      {flashMessage && (
        <div className={`admin-flash admin-flash--${flashMessage.kind}`} role="status">
          <span>{flashMessage.text}</span>
          <button type="button" className="admin-flash-close" onClick={() => setFlashMessage(null)}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
          </button>
        </div>
      )}

      {/* Filter by UID Banner */}
      {filterByUid && (
        <div className="admin-filter-indicator">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--admin-acc)" }}>filter_alt</span>
            <span>Filtering playlists created by User: <code>{filterByUid}</code></span>
          </span>
          {onClearUidFilter && (
            <button
              type="button"
              className="admin-btn admin-btn--micro admin-btn--ghost"
              onClick={onClearUidFilter}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <span>Show All Playlists</span>
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
            </button>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="admin-stats-strip">
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Total Playlists in Supabase</span>
          <span className="admin-strip-val text-cyan">{playlists.length}</span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Public in Directory</span>
          <span className="admin-strip-val text-emerald">
            {playlists.filter((p) => !p.hidden).length}
          </span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Hidden / Moderated</span>
          <span className="admin-strip-val text-magenta">
            {playlists.filter((p) => p.hidden).length}
          </span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Total Cumulative Plays</span>
          <span className="admin-strip-val text-blue">
            {playlists.reduce((acc, p) => acc + (p.play_count || 0), 0)}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by Title, Author, or User ID (owner_uid)…"
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
            All ({playlists.length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "public" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("public"); setPage(1); }}
          >
            Public ({playlists.filter((p) => !p.hidden && p.sourceType !== "local").length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "local" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("local"); setPage(1); }}
          >
            Local / Private ({playlists.filter((p) => p.sourceType === "local").length})
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${filterMode === "hidden" ? "admin-seg-btn--active" : ""}`}
            onClick={() => { setFilterMode("hidden"); setPage(1); }}
          >
            Hidden ({playlists.filter((p) => p.hidden).length})
          </button>
        </div>
      </div>

      {/* Playlists Table */}
      <div className="admin-table-container">
        <table className="admin-brutalist-table">
          <thead>
            <tr>
              <th>Cover</th>
              <th>Title</th>
              <th>Author / User Name</th>
              <th>Direct Playlist Link</th>
              <th>User ID (owner_uid)</th>
              <th>Tracks</th>
              <th>Plays</th>
              <th>Source Platforms</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedPlaylists.length === 0 ? (
              <tr>
                <td colSpan={11} className="admin-table-empty">
                  No playlists match your current filter.
                </td>
              </tr>
            ) : (
              paginatedPlaylists.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="admin-cover-thumb">
                      {p.cover_art ? (
                        <img
                          src={p.cover_art}
                          alt={p.title}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--admin-muted)" }}>
                          music_note
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="admin-playlist-title-cell">
                      <span className="admin-pl-title" title={p.title}>
                        {p.title}
                      </span>
                      <code className="admin-mono-muted-xs">{p.id}</code>
                    </div>
                  </td>
                  <td>
                    <span className="admin-author-badge">{p.author || "Anonymous"}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn--micro admin-btn--ghost"
                        onClick={() => copyPlaylistLink(p.id)}
                        title="Copy direct share link to this playlist"
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                          {copiedPlaylistId === p.id ? "check" : "content_copy"}
                        </span>
                        <span>{copiedPlaylistId === p.id ? "Copied" : "Copy Link"}</span>
                      </button>
                      <a
                        href={`/#playlist=${encodeURIComponent(p.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-copy-btn"
                        title="Open playlist in CREESPY Player"
                        style={{ padding: "3px", display: "inline-flex", alignItems: "center" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                          open_in_new
                        </span>
                      </a>
                    </div>
                  </td>
                  <td>
                    <code className="admin-mono-text-sm" title={p.owner_uid}>
                      {p.owner_uid}
                    </code>
                  </td>
                  <td>
                    <span className="admin-mono-bold">{p.track_count}</span>
                  </td>
                  <td>
                    <span className="admin-badge-plays">{p.play_count}</span>
                  </td>
                  <td>
                    <span className="admin-pill admin-pill--source">
                      {p.sourceType === "local" ? "Local Browser" : getPlatformsSummary(p)}
                    </span>
                  </td>
                  <td>
                    {p.hidden ? (
                      <span className="admin-pill admin-pill--hidden">HIDDEN</span>
                    ) : p.sourceType === "local" ? (
                      <span className="admin-pill admin-pill--private">LOCAL</span>
                    ) : (
                      <span className="admin-pill admin-pill--public">PUBLIC</span>
                    )}
                  </td>
                  <td className="admin-date-cell">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="admin-table-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--micro admin-btn--accent"
                        onClick={() => setEditingPlaylist(p)}
                        title="Edit metadata and songs"
                        style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>edit_note</span>
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        className="admin-btn admin-btn--micro admin-btn--ghost"
                        onClick={() => handleToggleHide(p)}
                        title={p.hidden ? "Unhide playlist" : "Hide playlist"}
                        style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                          {p.hidden ? "visibility" : "visibility_off"}
                        </span>
                        <span>{p.hidden ? "Unhide" : "Hide"}</span>
                      </button>

                      {confirmDeleteId === p.id ? (
                        <div className="admin-confirm-box">
                          <span className="admin-confirm-label">Confirm?</span>
                          <button
                            type="button"
                            className="admin-btn admin-btn--micro admin-btn--danger"
                            onClick={() => handleDelete(p.id, p.title)}
                            disabled={deletingId === p.id}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--micro"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>close</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn admin-btn--micro admin-btn--danger"
                          onClick={() => setConfirmDeleteId(p.id)}
                          title="Delete playlist from Supabase"
                          style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>delete</span>
                          <span>Del</span>
                        </button>
                      )}
                    </div>
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
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredPlaylists.length)} of {filteredPlaylists.length} playlists
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="admin-btn admin-btn--micro admin-btn--ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>chevron_left</span>
                <span>Prev</span>
              </button>
              <span className="admin-mono-text-sm" style={{ padding: "0 6px" }}>Page {page} of {totalPages}</span>
              <button
                type="button"
                className="admin-btn admin-btn--micro admin-btn--ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}
              >
                <span>Next</span>
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Playlist & Tracks Modal */}
      {editingPlaylist && (
        <EditPlaylistModal
          playlist={editingPlaylist}
          onClose={() => setEditingPlaylist(null)}
          onSaved={() => {
            showFlash("success", `Updated playlist "${editingPlaylist.title}".`);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
