import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  changePassword,
  fetchDashboard,
  fetchSession,
  health,
  login,
  logout,
  type DashboardCards,
  type SessionInfo,
} from "./api";

type Stage = "boot" | "login" | "change-password" | "dashboard" | "locked";

interface Flash {
  kind: "error" | "success";
  text: string;
}

export default function AdminApp() {
  const [stage, setStage] = useState<Stage>("boot");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const boot = useCallback(async () => {
    try {
      await health(); // ensure CSRF cookie exists
    } catch {
      /* ignored; session probe will decide */
    }
    try {
      const s = await fetchSession();
      setSession(s);
      setStage(s.must_change_password ? "change-password" : "dashboard");
    } catch {
      setSession(null);
      setStage("login");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const onLoggedIn = useCallback((s: SessionInfo) => {
    setSession(s);
    setStage(s.must_change_password ? "change-password" : "dashboard");
  }, []);

  const onLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      setSession(null);
      setStage("login");
      setFlash({ kind: "success", text: "Logged out." });
    }
  }, []);

  // Session expired server-side (stale token / forced revocation anywhere).
  const onSessionExpired = useCallback(() => {
    setSession(null);
    setStage("login");
    setFlash({ kind: "error", text: "Session expired. Sign in again." });
  }, []);

  return (
    <div className="admin-root">
      <header className="admin-header">
        <h1>CREESPY Control Plane</h1>
        {stage === "dashboard" && session && (
          <button type="button" className="admin-btn" onClick={() => void onLogout()}>
            Sign out
          </button>
        )}
      </header>

      {flash && (
        <div className={`admin-flash admin-flash--${flash.kind}`} role="status">
          {flash.text}
        </div>
      )}

      <main className="admin-main">
        {stage === "boot" && <p className="admin-muted">Checking session…</p>}
        {stage === "login" && (
          <LoginScreen onLoggedIn={onLoggedIn} onMessage={(f) => setFlash(f)} />
        )}
        {stage === "change-password" && (
          <ChangePasswordScreen
            forced
            afterChange={() => {
              setFlash({ kind: "success", text: "Password updated." });
              setStage("dashboard");
            }}
          />
        )}
        {stage === "dashboard" && session && <DashboardShell session={session} onSessionExpired={onSessionExpired} />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LoginScreen({
  onLoggedIn,
  onMessage,
}: {
  onLoggedIn: (s: SessionInfo) => void;
  onMessage: (f: Flash) => void;
}) {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login(adminId.trim(), password);
      // Re-fetch full session record (server always authoritative).
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
    <form className="admin-card" onSubmit={(e) => void submit(e)} autoComplete="off">
      <h2>Admin sign-in</h2>
      <label className="admin-label">
        Admin ID
        <input
          className="admin-input"
          value={adminId}
          onChange={(e) => setAdminId(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </label>
      <label className="admin-label">
        Password
        <input
          className="admin-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button className="admin-btn" type="submit" disabled={busy}>
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

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
        setError(err instanceof Error ? err.message : "Change failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-card" onSubmit={(e) => void submit(e)} autoComplete="off">
      <h2>{forced ? "Set a new password" : "Change password"}</h2>
      {forced && <p className="admin-muted">First sign-in: choose a fresh, strong password.</p>}
      <label className="admin-label">
        Current password
        <input className="admin-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="admin-label">
        New password
        <input className="admin-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </label>
      <label className="admin-label">
        Confirm new password
        <input className="admin-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </label>
      {error && <p className="admin-error">{error}</p>}
      <p className="admin-muted admin-policy">
        At least 10 chars with upper, lower, digit and symbol; must not contain the admin ID.
      </p>
      <button className="admin-btn" type="submit" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function DashboardShell({ session, onSessionExpired }: { session: SessionInfo; onSessionExpired: () => void }) {
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (silent = false) => {
      setBusy((b) => b || true);
      fetchDashboard()
        .then((r) => {
          setCards(r.cards);
          setError(null);
          setLastPoll(Date.now());
        })
        .catch((err) => {
          if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
            onSessionExpired();
            return;
          }
          if (!silent) setError(err instanceof Error ? err.message : "Dashboard load failed.");
        })
        .finally(() => setBusy(false));
    },
    [onSessionExpired],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Stale-token refresh: re-validate the session every 60s and refresh cards.
  useEffect(() => {
    const every30s = window.setInterval(() => {
      fetchSession()
        .then(() => {
          void load(true);
        })
        .catch((err) => {
          if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) onSessionExpired();
        });
    }, 60_000);
    return () => window.clearInterval(every30s);
  }, [load, onSessionExpired]);

  return (
    <div className="admin-dashboard">
      <section className="admin-card">
        <h2>Session</h2>
        <dl className="admin-dl">
          <dt>Admin</dt>
          <dd>{session.display_name}</dd>
          <dt>ID</dt>
          <dd>{session.admin_id}</dd>
          <dt>Role</dt>
          <dd>{session.role}</dd>
          <dt>Expires</dt>
          <dd>{new Date(session.expires_at).toLocaleString()}</dd>
          {busy && (
            <>
              <dt>Refreshing</dt>
              <dd>…</dd>
            </>
          )}
        </dl>
      </section>

      <section className="admin-card">
        <h2>Live dashboard</h2>
        {error && <p className="admin-error">{error}</p>}
        {!cards && !error && <p className="admin-muted">Loading live cards…</p>}
        {cards && (
          <>
            <div className="admin-cards">
              <Card label="Users (owners)" value={cards.users.distinct_owners} hint={`${cards.users.publishers} publishers · ${cards.users.admins} admins`} />
              <Card label="Public playlists" value={cards.playlists.count} hint={`${cards.playlists.total_tracks} tracks`} />
              <Card label="Plays" value={cards.playback.total_plays} hint={cards.playback.source} />
              <Card label="Rooms" value={cards.rooms.available ? undefined : "—"} hint={cards.rooms.available ? "live" : cards.rooms.note ?? "realtime-only (Phase G)"} />
              <Card label="Sessions" value={cards.sessions.active} hint={`${cards.sessions.total} total`} />
              <Card label="Failed events 24h" value={cards.errors.failed_events_24h} hint={`${cards.errors.total_audit_failures} total failures`} />
              <Card label="Storage" value={formatBytes(cards.storage.approx_bytes)} hint={`${cards.storage.total_tracks} tracks`} />
            </div>
            <p className="admin-muted admin-poll">Last refresh {lastPoll ? new Date(lastPoll).toLocaleTimeString() : "…"}</p>
          </>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value?: number | string; hint?: string }) {
  return (
    <div className="admin-card admin-card--stat">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value ?? "—"}</div>
      {hint && <div className="admin-stat-hint">{hint}</div>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}