import React from "react";

export type AdminTab =
  | "overview"
  | "users"
  | "rooms"
  | "playlists"
  | "songs"
  | "chat"
  | "playlogs"
  | "leaderboard"
  | "system"
  | "admins"
  | "sessions"
  | "audit";

interface AdminNavProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onlineUsersCount: number;
  activeRoomsCount: number;
  playlistsCount: number;
  onSignOut: () => void;
  adminName: string;
  adminRole: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export const AdminNav: React.FC<AdminNavProps> = ({
  currentTab,
  onSelectTab,
  onlineUsersCount,
  activeRoomsCount,
  playlistsCount,
  onSignOut,
  adminName,
  adminRole,
  theme,
  onToggleTheme,
}) => {
  const tabs: { key: AdminTab; label: string; icon: string; count?: number; badgeType?: "live" | "count" }[] = [
    { key: "overview", label: "Overview", icon: "dashboard" },
    { key: "users", label: "Users", icon: "group", count: onlineUsersCount, badgeType: onlineUsersCount > 0 ? "live" : "count" },
    { key: "rooms", label: "Rooms", icon: "meeting_room", count: activeRoomsCount, badgeType: activeRoomsCount > 0 ? "live" : "count" },
    { key: "playlists", label: "Playlists", icon: "queue_music", count: playlistsCount },
    { key: "songs", label: "Songs", icon: "music_note" },
    { key: "chat", label: "Chat Logs", icon: "chat" },
    { key: "playlogs", label: "Play Logs", icon: "history" },
    { key: "leaderboard", label: "Leaderboard", icon: "leaderboard" },
    { key: "system", label: "System Health", icon: "health_and_safety" },
    { key: "admins", label: "Admins", icon: "admin_panel_settings" },
    { key: "sessions", label: "Sessions", icon: "key" },
    { key: "audit", label: "Audit", icon: "policy" },
  ];

  return (
    <header className="admin-header-modern">
      <div className="admin-brand-bar">
        <div className="admin-logo-group">
          <div className="admin-logo-mark">
            <span className="admin-logo-glow" />
            <span className="material-symbols-outlined" style={{ color: "var(--admin-acc)", fontSize: "20px" }}>
              admin_panel_settings
            </span>
          </div>
          <div>
            <div className="admin-brand-title">
              CREESPY <span className="admin-brand-badge">CONTROL PLANE</span>
            </div>
            <div className="admin-brand-sub">Supabase Backend & Live Realtime Management</div>
          </div>
        </div>

        <div className="admin-user-ctrl">
          {/* Live Sync Status */}
          <div className="admin-live-pulse-badge" title="Supabase Realtime Synchronized">
            <span className="admin-pulse-dot" />
            <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--admin-acc-3)" }}>
              sync
            </span>
            <span className="admin-pulse-text">REALTIME</span>
          </div>

          {/* Theme Toggle (Dark / Light) */}
          <button
            type="button"
            className="admin-btn admin-btn--small admin-btn--ghost"
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "17px", color: theme === "dark" ? "#ffd700" : "#0284c7" }}>
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          {/* Admin Profile */}
          <div className="admin-profile-pill">
            <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--admin-acc)" }}>
              shield_person
            </span>
            <span className="admin-profile-role">{adminRole}</span>
            <span className="admin-profile-name">{adminName}</span>
          </div>

          {/* Sign Out */}
          <button
            type="button"
            className="admin-btn admin-btn--small admin-btn--ghost admin-btn--danger"
            onClick={onSignOut}
            title="Sign out from admin session"
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              logout
            </span>
            <span>Sign out</span>
          </button>
        </div>
      </div>

      <nav className="admin-nav-scroll" aria-label="Control plane sections">
        <div className="admin-nav-tabs">
          {tabs.map((t) => {
            const isActive = currentTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`admin-nav-btn ${isActive ? "admin-nav-btn--active" : ""}`}
                onClick={() => onSelectTab(t.key)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px", opacity: isActive ? 1 : 0.75 }}>
                  {t.icon}
                </span>
                <span className="admin-nav-label">{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={`admin-nav-counter ${
                      t.badgeType === "live" ? "admin-nav-counter--live" : ""
                    }`}
                  >
                    {t.badgeType === "live" && <span className="admin-mini-pulse" />}
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
