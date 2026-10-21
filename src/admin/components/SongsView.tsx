import React, { useState, useMemo } from "react";
import type { AdminPlaylist } from "../types";

interface AggregatedSong {
  id: string;
  title: string;
  artist: string;
  platform: string;
  thumb?: string;
  duration?: number;
  resolverStatus?: string;
  videoId?: string;
  sourceUrl?: string;
  inPlaylists: { id: string; title: string; author: string }[];
  totalAttributedPlays: number;
}

interface SongsViewProps {
  playlists: AdminPlaylist[];
  onRefresh: () => void;
  loading: boolean;
  onNavigateToPlaylist?: (playlistId: string) => void;
}

export const SongsView: React.FC<SongsViewProps> = ({
  playlists,
  onRefresh,
  loading,
  onNavigateToPlaylist,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [copiedPlaylistId, setCopiedPlaylistId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const copyPlaylistLink = (pid: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/#playlist=${encodeURIComponent(pid)}`;
    navigator.clipboard.writeText(link);
    setCopiedPlaylistId(pid);
    setTimeout(() => setCopiedPlaylistId(null), 2000);
  };

  // Aggregate songs across all playlists
  const aggregatedSongs = useMemo(() => {
    const map = new Map<string, AggregatedSong>();

    for (const pl of playlists) {
      for (const t of pl.tracks || []) {
        const titleClean = (t.title || "Unknown").trim();
        const artistClean = (t.artist || "Unknown").trim();
        const key = `${titleClean.toLowerCase()}|${artistClean.toLowerCase()}`;
        const platform = t.sourcePlatform || t.sourceType || "YouTube";

        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            id: t.id,
            title: titleClean,
            artist: artistClean,
            platform,
            thumb: t.thumb || t.coverUrl || t.artwork,
            duration: t.duration,
            resolverStatus: t.resolverStatus || "EXACT",
            videoId: t.videoId,
            sourceUrl: t.sourceUrl,
            inPlaylists: [{ id: pl.id, title: pl.title, author: pl.author }],
            totalAttributedPlays: pl.play_count || 0,
          });
        } else {
          existing.totalAttributedPlays += pl.play_count || 0;
          if (!existing.inPlaylists.some((p) => p.id === pl.id)) {
            existing.inPlaylists.push({ id: pl.id, title: pl.title, author: pl.author });
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.inPlaylists.length - a.inPlaylists.length || b.totalAttributedPlays - a.totalAttributedPlays);
  }, [playlists]);

  const filteredSongs = useMemo(() => {
    return aggregatedSongs.filter((s) => {
      if (
        platformFilter !== "all" &&
        !s.platform.toLowerCase().includes(platformFilter.toLowerCase())
      ) {
        return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.title.toLowerCase().includes(term) ||
        s.artist.toLowerCase().includes(term) ||
        s.platform.toLowerCase().includes(term)
      );
    });
  }, [aggregatedSongs, platformFilter, searchTerm]);

  const totalPages = Math.ceil(filteredSongs.length / pageSize) || 1;
  const paginatedSongs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSongs.slice(start, start + pageSize);
  }, [filteredSongs, page, pageSize]);

  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return "—";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">Master Song Catalogue & Resolution</h2>
          <p className="admin-desc">
            Complete registry of all songs extracted from Supabase playlists, source platforms & audio streaming matches
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
            <span>{loading ? "Refreshing…" : "Refresh Catalogue"}</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="admin-stats-strip">
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Distinct Songs / Tracks</span>
          <span className="admin-strip-val text-cyan">{aggregatedSongs.length}</span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Total Across Playlists</span>
          <span className="admin-strip-val">
            {playlists.reduce((acc, p) => acc + (p.track_count || 0), 0)}
          </span>
        </div>
        <div className="admin-strip-stat">
          <span className="admin-strip-label">Total Plays Attributed</span>
          <span className="admin-strip-val text-emerald">
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
            placeholder="Search by Song Title, Artist, or Source…"
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
          {["all", "youtube", "jiosaavn", "spotify", "soundcloud"].map((p) => (
            <button
              key={p}
              type="button"
              className={`admin-seg-btn ${platformFilter === p ? "admin-seg-btn--active" : ""}`}
              onClick={() => {
                setPlatformFilter(p);
                setPage(1);
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Songs Table */}
      <div className="admin-table-container">
        <table className="admin-brutalist-table">
          <thead>
            <tr>
              <th>Art</th>
              <th>Song Title</th>
              <th>Artist</th>
              <th>Platform / Source</th>
              <th>Duration</th>
              <th>Resolver Status</th>
              <th>Included In</th>
              <th>Attributed Plays</th>
              <th>External Link</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSongs.length === 0 ? (
              <tr>
                <td colSpan={9} className="admin-table-empty">
                  No songs found in current filter.
                </td>
              </tr>
            ) : (
              paginatedSongs.map((s, idx) => (
                <tr key={`${s.id}-${idx}`}>
                  <td>
                    <div className="admin-cover-thumb">
                      {s.thumb ? (
                        <img
                          src={s.thumb}
                          alt={s.title}
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
                    <span className="admin-song-title" title={s.title}>
                      {s.title}
                    </span>
                  </td>
                  <td>
                    <span className="admin-artist-name">{s.artist}</span>
                  </td>
                  <td>
                    <span className="admin-pill admin-pill--platform">{s.platform}</span>
                  </td>
                  <td className="admin-mono-muted-sm">
                    {formatDuration(s.duration)}
                  </td>
                  <td>
                    <span
                      className={`admin-pill ${
                        s.resolverStatus === "EXACT"
                          ? "admin-pill--ok"
                          : s.resolverStatus === "HIGH"
                          ? "admin-pill--public"
                          : "admin-pill--warning"
                      }`}
                    >
                      {s.resolverStatus || "EXACT"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "190px" }}>
                      {s.inPlaylists.map((pl) => (
                        <div
                          key={pl.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid var(--admin-border-soft)",
                            padding: "3px 6px",
                            borderRadius: "2px",
                          }}
                        >
                          <button
                            type="button"
                            className="admin-btn admin-btn--micro admin-btn--ghost"
                            onClick={() => onNavigateToPlaylist && onNavigateToPlaylist(pl.id)}
                            title={`View playlist "${pl.title}" (ID: ${pl.id})`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "1px 4px",
                              flex: 1,
                              overflow: "hidden",
                              textAlign: "left",
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "13px", color: "var(--admin-acc)" }}>
                              queue_music
                            </span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "110px" }}>
                              {pl.title}
                            </span>
                          </button>

                          <button
                            type="button"
                            className="admin-copy-btn"
                            onClick={() => copyPlaylistLink(pl.id)}
                            title="Copy Direct Playlist Link"
                            style={{ padding: "2px 4px", display: "inline-flex", alignItems: "center" }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                              {copiedPlaylistId === pl.id ? "check" : "content_copy"}
                            </span>
                          </button>

                          <a
                            href={`/#playlist=${encodeURIComponent(pl.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-copy-btn"
                            title="Open Playlist in CREESPY Player"
                            style={{ padding: "2px 4px", display: "inline-flex", alignItems: "center" }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                              open_in_new
                            </span>
                          </a>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="admin-badge-plays">{s.totalAttributedPlays}</span>
                  </td>
                  <td>
                    {s.videoId ? (
                      <a
                        href={`https://www.youtube.com/watch?v=${s.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-btn admin-btn--micro admin-btn--ghost"
                        style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
                      >
                        <span>YouTube</span>
                        <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>open_in_new</span>
                      </a>
                    ) : s.sourceUrl ? (
                      <a
                        href={s.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-btn admin-btn--micro admin-btn--ghost"
                        style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
                      >
                        <span>Audio Link</span>
                        <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>open_in_new</span>
                      </a>
                    ) : (
                      <span className="admin-mono-muted-xs">—</span>
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
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredSongs.length)} of {filteredSongs.length} songs
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
    </div>
  );
};
