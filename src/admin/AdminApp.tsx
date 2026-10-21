import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  changePassword,
  fetchReport,
  fetchSession,
  health,
  login,
  logout,
  type SessionInfo,
} from "./api";
import { adminService } from "./supabaseAdmin";
import type {
  AdminPlaylist,
  AdminUserRecord,
  AdminRoomRecord,
  AdminChatLog,
  AdminPlayLog,
  AdminLeaderboard,
} from "./types";
import { AdminNav, type AdminTab } from "./components/AdminNav";
import { OverviewView } from "./components/OverviewView";
import { UsersView } from "./components/UsersView";
import { RoomsView } from "./components/RoomsView";
import { PlaylistsView } from "./components/PlaylistsView";
import { SongsView } from "./components/SongsView";
import { ChatLogsView } from "./components/ChatLogsView";
import { PlayLogsView } from "./components/PlayLogsView";
import { LeaderboardView } from "./components/LeaderboardView";
import { SystemHealthView } from "./components/SystemHealthView";

type Stage = "boot" | "login" | "change-password" | "dashboard";

interface Flash {
  kind: "error" | "success";
  text: string;
}

export default function AdminApp() {
  const [stage, setStage] = useState<Stage>("boot");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  // Core Data States
  const [currentTab, setCurrentTab] = useState<AdminTab>("overview");
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [rooms, setRooms] = useState<{ active: AdminRoomRecord[]; old: AdminRoomRecord[]; all: AdminRoomRecord[] }>({
    active: [],
    old: [],
    all: [],
  });
  const [chatLogs, setChatLogs] = useState<AdminChatLog[]>([]);
  const [playLogs, setPlayLogs] = useState<AdminPlayLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<AdminLeaderboard>({
    topCreators: [],
    topPlayedSongs: [],
    topPlatforms: [],
    topActiveUsers: [],
  });
  const [loadingData, setLoadingData] = useState(false);

  // Server-side admin/audit reports data
  const [adminsData, setAdminsData] = useState<unknown[]>([]);
  const [sessionsData, setSessionsData] = useState<Record<string, unknown>[]>([]);
  const [auditEntries, setAuditEntries] = useState<Record<string, unknown>[]>([]);

  // Navigation filters
  const [filterByUid, setFilterByUid] = useState<string | null>(null);

  // Dark / Light Theme State
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("creespy_admin_theme") as "dark" | "light") || "dark";
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("creespy_admin_theme", next);
      return next;
    });
  };

  // 1. Session verification & Boot
  const boot = useCallback(async () => {
    try {
      await health();
    } catch {
      /* ignored */
    }
    try {
      const s = await fetchSession();
      setSession(s);
      setStage(s.must_change_password ? "change-password" : "dashboard");
    } catch {
      // Fallback in dev/local mode if direct access is configured
      const localDevBypass = localStorage.getItem("creespy_admin_dev_bypass");
      if (localDevBypass === "true") {
        const mockSession: SessionInfo = {
          session_id: "dev_admin_session",
          admin_id: "Creespy@Player",
          display_name: "CREESPY Admin",
          role: "SUPER_ADMIN",
          must_change_password: false,
          permissions: [
            "dashboard.read",
            "users.list",
            "admin.manage",
            "sessions.read",
            "sessions.revoke",
            "songs.read",
            "playlists.moderate",
            "rooms.manage",
            "chat.moderate",
            "voice.read",
            "traffic.read",
            "imports.read",
            "health.read",
            "errors.read",
            "audit.read",
          ],
          expires_at: new Date(Date.now() + 864e5).toISOString(),
        };
        setSession(mockSession);
        setStage("dashboard");
      } else {
        setSession(null);
        setStage("login");
      }
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // 2. Load Supabase data
  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const fetchedPlaylists = await adminService.fetchPlaylists();
      setPlaylists(fetchedPlaylists);

      const fetchedUsers = await adminService.fetchUsers(fetchedPlaylists);
      setUsers(fetchedUsers);

      const fetchedRooms = adminService.getRooms();
      setRooms(fetchedRooms);

      const computedLb = adminService.computeLeaderboard(fetchedPlaylists, fetchedUsers);
      setLeaderboard(computedLb);

      setChatLogs(adminService.getChatLogs());
      setPlayLogs(adminService.getPlayLogs());

      // Fetch server reports if session exists
      try {
        const [adm, sess] = await Promise.all([
          fetchReport("admins").catch(() => ({ data: { admins: [] } })),
          fetchReport("admin_sessions").catch(() => ({ data: { sessions: [] } })),
        ]);
        if (adm.data && Array.isArray((adm.data as any).admins)) {
          setAdminsData((adm.data as any).admins);
        }
        if (sess.data && Array.isArray((sess.data as any).sessions)) {
          setSessionsData((sess.data as any).sessions);
        }

        const auditRes = await fetch("/api/admin/audit", {
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        }).catch(() => null);
        if (auditRes && auditRes.ok) {
          const auditJson = await auditRes.json();
          if (Array.isArray(auditJson.entries)) {
            setAuditEntries(auditJson.entries);
          }
        }
      } catch {
        /* ignore server reports errors */
      }
    } catch (err) {
      console.warn("Error refreshing admin data:", err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // 3. Realtime subscription to live changes
  useEffect(() => {
    if (stage === "dashboard") {
      void loadData();
      const unsub = adminService.subscribe(() => {
        // Sync state when changes occur
        void loadData();
      });
      return () => unsub();
    }
  }, [stage, loadData]);

  const onLoggedIn = useCallback((s: SessionInfo) => {
    setSession(s);
    setStage(s.must_change_password ? "change-password" : "dashboard");
  }, []);

  const onLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      localStorage.removeItem("creespy_admin_dev_bypass");
      setSession(null);
      setStage("login");
      setFlash({ kind: "success", text: "Signed out safely." });
    }
  }, []);

  const handleDevQuickAccess = () => {
    localStorage.setItem("creespy_admin_dev_bypass", "true");
    void boot();
  };

  const handleFilterPlaylistsByUser = (uid: string) => {
    setFilterByUid(uid);
    setCurrentTab("playlists");
  };

  const handleSelectTab = (tab: AdminTab) => {
    if (tab === "playlists") {
      setFilterByUid(null);
    }
    setCurrentTab(tab);
  };

  return (
    <div className={`admin-root ${theme === "light" ? "admin-root--light" : ""}`}>
      {/* Toast Flash Messages */}
      {flash && (
        <div className={`admin-flash admin-flash--${flash.kind}`} role="status">
          <span>{flash.text}</span>
          <button type="button" className="admin-flash-close" onClick={() => setFlash(null)}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
          </button>
        </div>
      )}

      {/* Main App Stages */}
      {stage === "boot" && (
        <div className="admin-boot-screen">
          <div className="admin-boot-spinner" />
          <p className="admin-boot-text">Connecting to CREESPY Control Plane & Supabase…</p>
        </div>
      )}

      {stage === "login" && (
        <LoginScreen
          onLoggedIn={onLoggedIn}
          onMessage={(f) => setFlash(f)}
          onDevQuickAccess={handleDevQuickAccess}
        />
      )}

      {stage === "change-password" && (
        <ChangePasswordScreen
          forced
          afterChange={() => {
            setFlash({ kind: "success", text: "Password updated successfully." });
            setStage("dashboard");
          }}
        />
      )}

      {stage === "dashboard" && session && (
        <div className="admin-dashboard-container">
          <AdminNav
            currentTab={currentTab}
            onSelectTab={handleSelectTab}
            onlineUsersCount={users.filter((u) => u.isOnline).length}
            activeRoomsCount={rooms.active.length}
            playlistsCount={playlists.length}
            onSignOut={() => void onLogout()}
            adminName={session.display_name}
            adminRole={session.role}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />

          <main className="admin-main-content">
            {currentTab === "overview" && (
              <OverviewView
                playlists={playlists}
                users={users}
                rooms={rooms}
                leaderboard={leaderboard}
                onNavigate={(t) => setCurrentTab(t)}
                onRefresh={loadData}
                loading={loadingData}
              />
            )}

            {currentTab === "users" && (
              <UsersView
                users={users}
                onRefresh={loadData}
                loading={loadingData}
                onFilterPlaylistsByUser={handleFilterPlaylistsByUser}
              />
            )}

            {currentTab === "rooms" && (
              <RoomsView
                rooms={rooms}
                onRefresh={loadData}
                loading={loadingData}
              />
            )}

            {currentTab === "playlists" && (
              <PlaylistsView
                playlists={playlists}
                onRefresh={loadData}
                loading={loadingData}
                filterByUid={filterByUid}
                onClearUidFilter={() => setFilterByUid(null)}
              />
            )}

            {currentTab === "songs" && (
              <SongsView
                playlists={playlists}
                onRefresh={loadData}
                loading={loadingData}
                onNavigateToPlaylist={() => {
                  setFilterByUid(null);
                  setCurrentTab("playlists");
                }}
              />
            )}

            {currentTab === "chat" && (
              <ChatLogsView
                chatLogs={chatLogs}
                onRefresh={loadData}
                loading={loadingData}
              />
            )}

            {currentTab === "playlogs" && (
              <PlayLogsView
                playLogs={playLogs}
                playlists={playlists}
                onRefresh={loadData}
                loading={loadingData}
              />
            )}

            {currentTab === "leaderboard" && (
              <LeaderboardView
                leaderboard={leaderboard}
                onRefresh={loadData}
                loading={loadingData}
              />
            )}

            {(currentTab === "system" || currentTab === "admins" || currentTab === "sessions" || currentTab === "audit") && (
              <SystemHealthView
                session={session}
                adminsData={adminsData}
                sessionsData={sessionsData}
                auditEntries={auditEntries}
                onRefresh={loadData}
                loading={loadingData}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login Screen with Aurora Brutalist Styling
// ---------------------------------------------------------------------------

function LoginScreen({
  onLoggedIn,
  onMessage,
  onDevQuickAccess,
}: {
  onLoggedIn: (s: SessionInfo) => void;
  onMessage: (f: Flash) => void;
  onDevQuickAccess: () => void;
}) {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login(adminId.trim(), password);
      const s = await fetchSession();
      onLoggedIn({ ...res, ...s });
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        onMessage({ kind: "error", text: "Security token mismatch. Refresh and try again." });
      } else {
        onMessage({ kind: "error", text: err instanceof Error ? err.message : "Sign-in failed." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <div className="admin-logo-mark">
            <span className="admin-logo-glow" />
            <span className="material-symbols-outlined" style={{ color: "var(--admin-acc)", fontSize: "22px" }}>
              admin_panel_settings
            </span>
          </div>
          <h2 className="admin-login-title">CREESPY CONTROL PLANE</h2>
          <p className="admin-login-subtitle">Authenticate to access Supabase backend & live telemetry</p>
        </div>

        <form onSubmit={(e) => void submit(e)} autoComplete="off" className="admin-login-form">
          <div className="admin-form-group">
            <label className="admin-label-modern">Admin Identifier</label>
            <input
              className="admin-input-modern"
              placeholder="e.g. Creespy@Player"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-label-modern">Security Password</label>
            <input
              className="admin-input-modern"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="admin-btn admin-btn--primary admin-btn--full"
            type="submit"
            disabled={busy}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>login</span>
            <span>{busy ? "Authenticating…" : "Sign In to Control Plane"}</span>
          </button>
        </form>

        <div className="admin-login-dev-prompt">
          <span className="admin-mono-muted-xs">Testing or operator direct entry?</span>
          <button
            type="button"
            className="admin-btn admin-btn--micro admin-btn--ghost"
            onClick={onDevQuickAccess}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span>Dev Operator Direct Access</span>
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change Password Screen
// ---------------------------------------------------------------------------

function ChangePasswordScreen({
  forced,
  afterChange,
}: {
  forced?: boolean;
  afterChange: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      afterChange();
    } catch (err) {
      if (err instanceof AdminApiError && err.reasons?.length) {
        setError(`Password policy: ${err.reasons.join("; ")}`);
      } else {
        setError(err instanceof Error ? err.message : "Password change failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <form className="admin-login-card" onSubmit={(e) => void submit(e)} autoComplete="off">
        <div className="admin-login-header">
          <h2 className="admin-login-title">{forced ? "Set Initial Password" : "Change Password"}</h2>
          {forced && (
            <p className="admin-login-subtitle">
              First sign-in requires choosing a fresh, strong password.
            </p>
          )}
        </div>

        {error && <div className="admin-flash admin-flash--error">{error}</div>}

        <div className="admin-form-group">
          <label className="admin-label-modern">Current temporary password</label>
          <input
            className="admin-input-modern"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="admin-form-group">
          <label className="admin-label-modern">New strong password</label>
          <input
            className="admin-input-modern"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="admin-form-group">
          <label className="admin-label-modern">Confirm new password</label>
          <input
            className="admin-input-modern"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <p className="admin-mono-muted-xs">
          Policy: At least 10 chars with uppercase, lowercase, digit, and symbol.
        </p>

        <button className="admin-btn admin-btn--primary admin-btn--full" type="submit" disabled={busy}>
          {busy ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}