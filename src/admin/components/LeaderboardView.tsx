import React from "react";
import type { AdminLeaderboard } from "../types";

interface LeaderboardViewProps {
  leaderboard: AdminLeaderboard;
  onRefresh: () => void;
  loading: boolean;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  leaderboard,
  onRefresh,
  loading,
}) => {
  const getRankBadge = (idx: number) => {
    if (idx === 0) {
      return (
        <span className="admin-rank-badge admin-rank-1" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#ffd700" }}>workspace_premium</span>
          <span>1</span>
        </span>
      );
    }
    if (idx === 1) {
      return (
        <span className="admin-rank-badge admin-rank-2" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#c0c0c0" }}>workspace_premium</span>
          <span>2</span>
        </span>
      );
    }
    if (idx === 2) {
      return (
        <span className="admin-rank-badge admin-rank-3" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#cd7f32" }}>workspace_premium</span>
          <span>3</span>
        </span>
      );
    }
    return <span className="admin-rank-badge">#{idx + 1}</span>;
  };

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">CREESPY Community Leaderboard</h2>
          <p className="admin-desc">
            Rankings of users who created the most playlists, played the most songs, and overall top streaming tracks
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
            <span>{loading ? "Refreshing…" : "Refresh Leaderboard"}</span>
          </button>
        </div>
      </div>

      <div className="admin-view-scroll">

      <div className="admin-grid-2col">
        {/* Top Playlist Creators */}
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Top Playlist Curators</h3>
              <p className="admin-card-subtitle">Users who have published the most playlists</p>
            </div>
            <span className="admin-badge-aurora">CREATORS</span>
          </div>

          <div className="admin-table-container" style={{ marginTop: "14px" }}>
            <table className="admin-brutalist-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Creator Name</th>
                  <th>User ID</th>
                  <th>Playlists</th>
                  <th>Total Tracks</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.topCreators.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">No creators recorded yet.</td>
                  </tr>
                ) : (
                  leaderboard.topCreators.map((c, i) => (
                    <tr key={c.uid}>
                      <td>{getRankBadge(i)}</td>
                      <td>
                        <span className="admin-user-name">{c.name || "Anonymous"}</span>
                      </td>
                      <td>
                        <code className="admin-mono-text-sm">{c.uid}</code>
                      </td>
                      <td>
                        <span className="admin-mono-bold text-cyan">{c.playlists}</span>
                      </td>
                      <td>
                        <span className="admin-mono-muted-sm">{c.tracks}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Active Users (Plays) */}
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Top Song Players</h3>
              <p className="admin-card-subtitle">Users with highest cumulative listening volume</p>
            </div>
            <span className="admin-badge-aurora">LISTENERS</span>
          </div>

          <div className="admin-table-container" style={{ marginTop: "14px" }}>
            <table className="admin-brutalist-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>User Name</th>
                  <th>User ID</th>
                  <th>Total Plays</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.topActiveUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">No activity recorded yet.</td>
                  </tr>
                ) : (
                  leaderboard.topActiveUsers.map((u, i) => (
                    <tr key={u.uid}>
                      <td>{getRankBadge(i)}</td>
                      <td>
                        <span className="admin-user-name">{u.name || "Anonymous"}</span>
                      </td>
                      <td>
                        <code className="admin-mono-text-sm">{u.uid}</code>
                      </td>
                      <td>
                        <span className="admin-badge-plays">{u.totalPlays}</span>
                      </td>
                      <td className="admin-date-cell">
                        {new Date(u.lastActive).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="admin-grid-2col">
        {/* Top Songs */}
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Top 10 Most Popular Songs</h3>
              <p className="admin-card-subtitle">Tracks most included in playlists & played</p>
            </div>
            <span className="admin-badge-aurora">SONGS</span>
          </div>

          <div className="admin-table-container" style={{ marginTop: "14px" }}>
            <table className="admin-brutalist-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Song & Artist</th>
                  <th>Platform</th>
                  <th>In Playlists</th>
                  <th>Plays</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.topPlayedSongs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-table-empty">No songs found.</td>
                  </tr>
                ) : (
                  leaderboard.topPlayedSongs.map((s, i) => (
                    <tr key={i}>
                      <td>{getRankBadge(i)}</td>
                      <td>
                        <div>
                          <div className="admin-song-title">{s.title}</div>
                          <div className="admin-artist-name">{s.artist}</div>
                        </div>
                      </td>
                      <td>
                        <span className="admin-pill admin-pill--platform">{s.platform}</span>
                      </td>
                      <td>
                        <span className="admin-mono-bold">{s.playlistsCount}</span>
                      </td>
                      <td>
                        <span className="admin-badge-plays">{s.plays}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform Share */}
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Streaming Platform Dominance</h3>
              <p className="admin-card-subtitle">Where CREESPY users import and load songs from</p>
            </div>
            <span className="admin-badge-aurora">SOURCES</span>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {leaderboard.topPlatforms.map((p) => (
              <div key={p.platform} className="admin-platform-stat-row">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, color: "var(--admin-text)" }}>{p.platform}</span>
                  <span style={{ fontFamily: "var(--font-tmono)", color: "var(--admin-acc)" }}>
                    {p.count} songs ({p.percentage}%)
                  </span>
                </div>
                <div style={{ height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${p.percentage}%`,
                      background:
                        p.platform === "YouTube"
                          ? "#ff3e55"
                          : p.platform === "JioSaavn"
                          ? "#2dffe0"
                          : p.platform === "Spotify"
                          ? "#1db954"
                          : p.platform === "SoundCloud"
                          ? "#ff7700"
                          : "#3cc6ff",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div> {/* end admin-view-scroll */}
    </div>
  );
};
