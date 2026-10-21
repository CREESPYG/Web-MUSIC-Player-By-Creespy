import React from "react";
import type { AdminPlaylist, AdminUserRecord, AdminRoomRecord, AdminLeaderboard } from "../types";
import { ActivityTrendChart, PlatformDonutChart, ResolverQualityBar } from "./AuroraCharts";
import type { AdminTab } from "./AdminNav";

interface OverviewViewProps {
  playlists: AdminPlaylist[];
  users: AdminUserRecord[];
  rooms: { active: AdminRoomRecord[]; old: AdminRoomRecord[]; all: AdminRoomRecord[] };
  leaderboard: AdminLeaderboard;
  onNavigate: (tab: AdminTab) => void;
  onRefresh: () => void;
  loading: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  playlists,
  users,
  rooms,
  leaderboard,
  onNavigate,
  onRefresh,
  loading,
}) => {
  const totalTracks = playlists.reduce((acc, p) => acc + (p.track_count || 0), 0);
  const totalPlays = playlists.reduce((acc, p) => acc + (p.play_count || 0), 0);
  const onlineUsers = users.filter((u) => u.isOnline);
  const hiddenPlaylists = playlists.filter((p) => p.hidden);

  return (
    <div className="admin-view-container">
      {/* Top Banner & Refresh */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">System Overview & Telemetry</h2>
          <p className="admin-desc">Real-time metrics compiled from Supabase database & live WebSocket channels</p>
        </div>
        <div className="admin-actions-bar">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={onRefresh}
            disabled={loading}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>refresh</span>
            <span>{loading ? "Refreshing…" : "Refresh Live Data"}</span>
          </button>
        </div>
      </div>

      {/* Aurora KPI Cards — always visible at top */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card" onClick={() => onNavigate("users")}>
          <div className="admin-kpi-header">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--admin-acc)" }}>group</span>
              <span className="admin-kpi-title">Users & Visitors</span>
            </div>
            <span className="admin-kpi-tag admin-kpi-tag--cyan">{onlineUsers.length} ONLINE</span>
          </div>
          <div className="admin-kpi-value">{users.length}</div>
          <div className="admin-kpi-footer">
            <span>{onlineUsers.length} active right now</span>
            <span className="admin-kpi-link">
              Manage Users <span className="material-symbols-outlined" style={{ fontSize: "14px", verticalAlign: "middle" }}>arrow_forward</span>
            </span>
          </div>
        </div>

        <div className="admin-kpi-card" onClick={() => onNavigate("rooms")}>
          <div className="admin-kpi-header">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--admin-acc-2)" }}>meeting_room</span>
              <span className="admin-kpi-title">Listen Together Rooms</span>
            </div>
            <span className="admin-kpi-tag admin-kpi-tag--magenta">
              {rooms.active.length > 0 ? `${rooms.active.length} LIVE` : "IDLE"}
            </span>
          </div>
          <div className="admin-kpi-value">{rooms.all.length}</div>
          <div className="admin-kpi-footer">
            <span>{rooms.active.length} active · {rooms.old.length} past rooms</span>
            <span className="admin-kpi-link">
              Inspect Rooms <span className="material-symbols-outlined" style={{ fontSize: "14px", verticalAlign: "middle" }}>arrow_forward</span>
            </span>
          </div>
        </div>

        <div className="admin-kpi-card" onClick={() => onNavigate("playlists")}>
          <div className="admin-kpi-header">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--admin-acc-3)" }}>queue_music</span>
              <span className="admin-kpi-title">Supabase Playlists</span>
            </div>
            <span className="admin-kpi-tag admin-kpi-tag--emerald">LIVE DB</span>
          </div>
          <div className="admin-kpi-value">{playlists.length}</div>
          <div className="admin-kpi-footer">
            <span>{hiddenPlaylists.length} hidden · {playlists.length - hiddenPlaylists.length} public</span>
            <span className="admin-kpi-link">
              Moderate Playlists <span className="material-symbols-outlined" style={{ fontSize: "14px", verticalAlign: "middle" }}>arrow_forward</span>
            </span>
          </div>
        </div>

        <div className="admin-kpi-card" onClick={() => onNavigate("songs")}>
          <div className="admin-kpi-header">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--admin-ok)" }}>music_note</span>
              <span className="admin-kpi-title">Total Tracks / Songs</span>
            </div>
            <span className="admin-kpi-tag admin-kpi-tag--blue">{totalPlays} PLAYS</span>
          </div>
          <div className="admin-kpi-value">{totalTracks}</div>
          <div className="admin-kpi-footer">
            <span>Aggregated across {playlists.length} playlists</span>
            <span className="admin-kpi-link">
              Song Catalogue <span className="material-symbols-outlined" style={{ fontSize: "14px", verticalAlign: "middle" }}>arrow_forward</span>
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable lower section: charts + quick links */}
      <div className="admin-view-scroll">

      {/* Analytics & Charts Row */}
      <div className="admin-grid-2col">
        {/* Activity Trend Area Chart */}
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Activity Trend (Plays & Creations)</h3>
              <p className="admin-card-subtitle">Aggregated user activity metrics over time</p>
            </div>
            <span className="admin-badge-aurora" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>trending_up</span>
              14-DAY WINDOW
            </span>
          </div>
          <div style={{ marginTop: "16px" }}>
            <ActivityTrendChart />
          </div>
        </div>

        {/* Platform Share Donut Chart */}
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Platform Distribution</h3>
              <p className="admin-card-subtitle">Where songs are sourced from</p>
            </div>
            <span className="admin-badge-aurora" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>pie_chart</span>
              SOURCE SPLIT
            </span>
          </div>
          <div style={{ marginTop: "16px" }}>
            <PlatformDonutChart platforms={leaderboard.topPlatforms} />
          </div>
        </div>
      </div>

      {/* Resolver Health & Quick Navigation Row */}
      <div className="admin-grid-2col">
        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Track Audio Resolvers</h3>
              <p className="admin-card-subtitle">Resolver fidelity for streaming audio matches</p>
            </div>
            <span className="material-symbols-outlined" style={{ color: "var(--admin-acc)", fontSize: "18px" }}>tune</span>
          </div>
          <div style={{ marginTop: "16px" }}>
            <ResolverQualityBar />
          </div>
        </div>

        <div className="admin-card-glass">
          <div className="admin-card-title-row">
            <div>
              <h3 className="admin-card-title">Admin Quick Operations</h3>
              <p className="admin-card-subtitle">Direct jumps to core management centers</p>
            </div>
            <span className="material-symbols-outlined" style={{ color: "var(--admin-acc-2)", fontSize: "18px" }}>dashboard_customize</span>
          </div>
          <div className="admin-quick-links-grid" style={{ marginTop: "16px" }}>
            <button
              type="button"
              className="admin-quick-btn"
              onClick={() => onNavigate("playlists")}
            >
              <span className="material-symbols-outlined admin-quick-icon" style={{ color: "var(--admin-acc)" }}>edit_note</span>
              <div>
                <div className="admin-quick-title">Edit & Delete Playlists</div>
                <div className="admin-quick-desc">Modify metadata, remove tracks, toggle hide</div>
              </div>
            </button>

            <button
              type="button"
              className="admin-quick-btn"
              onClick={() => onNavigate("chat")}
            >
              <span className="material-symbols-outlined admin-quick-icon" style={{ color: "var(--admin-acc-2)" }}>chat</span>
              <div>
                <div className="admin-quick-title">Live Chat Monitor</div>
                <div className="admin-quick-desc">Real-time room chat logs & moderation</div>
              </div>
            </button>

            <button
              type="button"
              className="admin-quick-btn"
              onClick={() => onNavigate("leaderboard")}
            >
              <span className="material-symbols-outlined admin-quick-icon" style={{ color: "var(--admin-warning)" }}>emoji_events</span>
              <div>
                <div className="admin-quick-title">Community Leaderboard</div>
                <div className="admin-quick-desc">Top playlist curators and most played tracks</div>
              </div>
            </button>

            <button
              type="button"
              className="admin-quick-btn"
              onClick={() => onNavigate("playlogs")}
            >
              <span className="material-symbols-outlined admin-quick-icon" style={{ color: "var(--admin-acc-3)" }}>history</span>
              <div>
                <div className="admin-quick-title">Playback Stream Logs</div>
                <div className="admin-quick-desc">Chronological play events & listener tracking</div>
              </div>
            </button>
          </div>
        </div>
      </div>
      </div> {/* end admin-view-scroll */}
    </div>
  );
};
