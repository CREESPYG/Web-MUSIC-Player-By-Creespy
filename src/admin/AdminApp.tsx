import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  changePassword,
  createAdmin,
  fetchDashboard,
  fetchReport,
  fetchSession,
  fetchTrafficCsv,
  health,
  hidePlaylist,
  login,
  logout,
  removePlaylist,
  revokeSession,
  type DashboardCards,
  type ReportKind,
  type SessionInfo,
  unhidePlaylist,
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
  const [tab, setTab] = useState<"dashboard" | "users" | "admins" | "sessions" | "songs" | "playlists" | "rooms" | "chat" | "voice" | "traffic" | "imports" | "system" | "errors" | "perf" | "audit">("dashboard");
  const perms = new Set(session.permissions);
  const can: Record<string, boolean> = {
    users: perms.has("users.list"),
    admins: perms.has("admin.manage"),
    sessions: perms.has("sessions.read"),
    songs: perms.has("songs.read"),
    playlists: perms.has("playlists.moderate"),
    rooms: perms.has("rooms.manage"),
    chat: perms.has("chat.moderate"),
    voice: perms.has("voice.read"),
    traffic: perms.has("traffic.read"),
    imports: perms.has("imports.read"),
    system: perms.has("health.read"),
    errors: perms.has("errors.read"),
    perf: perms.has("health.read"),
    audit: perms.has("audit.read"),
  };
  const nav: { key: typeof tab; label: string; gate: () => boolean }[] = [
    { key: "dashboard", label: "Overview", gate: () => true },
    { key: "users", label: "Users", gate: () => can.users },
    { key: "admins", label: "Admins", gate: () => can.admins },
    { key: "sessions", label: "Sessions", gate: () => can.sessions },
    { key: "songs", label: "Songs", gate: () => can.songs },
    { key: "playlists", label: "Playlists", gate: () => can.playlists },
    { key: "rooms", label: "Rooms", gate: () => can.rooms },
    { key: "chat", label: "Chat", gate: () => can.chat },
    { key: "voice", label: "Voice", gate: () => can.voice },
    { key: "traffic", label: "Traffic", gate: () => can.traffic },
    { key: "imports", label: "Imports", gate: () => can.imports },
    { key: "system", label: "System", gate: () => can.system },
    { key: "errors", label: "Errors", gate: () => can.errors },
    { key: "perf", label: "Perf", gate: () => can.perf },
    { key: "audit", label: "Audit", gate: () => can.audit },
  ];
  const activeGated = nav.find((n) => n.key === tab && n.gate()) ?? nav.find((n) => n.gate())!;

  return (
    <div className="admin-dashboard">
      <nav className="admin-tabs" aria-label="Admin sections">
        {nav
          .filter((n) => n.gate())
          .map((n) => (
            <button
              key={n.key}
              type="button"
              role="tab"
              aria-selected={activeGated.key === n.key}
              className={`admin-tab${activeGated.key === n.key ? " admin-tab--active" : ""}`}
              onClick={() => setTab(n.key)}
            >
              {n.label}
            </button>
          ))}
      </nav>

      <div className="admin-tabpanel" role="tabpanel">
        {activeGated.key === "dashboard" && <OverviewTab session={session} onSessionExpired={onSessionExpired} />}
        {activeGated.key === "users" && <ReportView kind="users" label="Player users" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "admins" && <AdminsView onSessionExpired={onSessionExpired} />}
        {activeGated.key === "sessions" && <SessionsView session={session} onSessionExpired={onSessionExpired} />}
        {activeGated.key === "songs" && <ReportView kind="songs" label="Songs & listening" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "playlists" && <PlaylistsView onSessionExpired={onSessionExpired} />}
        {activeGated.key === "rooms" && <HonestView kind="rooms" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "chat" && <HonestView kind="chat" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "voice" && <HonestView kind="voice" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "traffic" && <TrafficView onSessionExpired={onSessionExpired} />}
        {activeGated.key === "imports" && <ReportView kind="imports" label="Imports & resolution" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "system" && <ReportView kind="system" label="System health" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "errors" && <ReportView kind="errors" label="Error center" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "perf" && <ReportView kind="perf" label="Performance & indexes" onSessionExpired={onSessionExpired} />}
        {activeGated.key === "audit" && <AuditView onSessionExpired={onSessionExpired} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic report view shared by users/songs/imports/system/errors/perf
// ---------------------------------------------------------------------------

function useSessionWatcher(onSessionExpired: () => void) {
  // 60s silent re-validation, mirrors the dashboard's stale-token refresh.
  useEffect(() => {
    const t = window.setInterval(() => {
      fetchSession().catch((err) => {
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) onSessionExpired();
      });
    }, 60_000);
    return () => window.clearInterval(t);
  }, [onSessionExpired]);
}

function useReport(kind: ReportKind, onSessionExpired: () => void) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useSessionWatcher(onSessionExpired);
  const load = useCallback(() => {
    setBusy(true);
    fetchReport(kind)
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
          onSessionExpired();
          return;
        }
        setError(err instanceof Error ? err.message : "Load failed.");
      })
      .finally(() => setBusy(false));
  }, [kind, onSessionExpired]);
  useEffect(() => {
    load();
  }, [load]);
  const reload = useCallback(() => load(), [load]);
  return { data, error, busy, reload };
}

function ReportView({ kind, label, onSessionExpired }: { kind: ReportKind; label: string; onSessionExpired: () => void }) {
  const { data, error, busy, reload } = useReport(kind, onSessionExpired);
  return (
    <section className="admin-card" aria-live="polite" aria-busy={busy}>
      <div className="admin-viewhead">
        <h2>{label}</h2>
        <button type="button" className="admin-btn admin-btn--small" onClick={reload} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <pre className="admin-pre">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Honest realtime-only placeholders (rooms / chat / voice)
// ---------------------------------------------------------------------------

function HonestView({ kind, onSessionExpired }: { kind: Extract<ReportKind, "rooms" | "chat" | "voice">; onSessionExpired: () => void }) {
  const { data, error, busy, reload } = useReport(kind, onSessionExpired);
  const note = (data?.note as string) ?? "Realtime-only (no persisted table) — not yet available from the control plane.";
  return (
    <section className="admin-card" aria-live="polite" aria-busy={busy}>
      <div className="admin-viewhead">
        <h2>{kind}</h2>
        <button type="button" className="admin-btn admin-btn--small" onClick={reload} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <p className="admin-muted">{note}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Overview (exisiting live cards) — moved out of the old shell body
// ---------------------------------------------------------------------------

function OverviewTab({ session, onSessionExpired }: { session: SessionInfo; onSessionExpired: () => void }) {
  const { data, error, busy } = useReport("system", onSessionExpired);
  const cards = { system: data };
  return <OverviewCards session={session} onSessionExpired={onSessionExpired} extra={cards} busy={busy} error={error} />;
}

function OverviewCards({
  session,
  onSessionExpired,
  extra,
  busy,
  error,
}: {
  session: SessionInfo;
  onSessionExpired: () => void;
  extra?: { system: Record<string, unknown> | null };
  busy: boolean;
  error: string | null;
}) {
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [lastPoll, setLastPoll] = useState<number>(0);

  const load = useCallback(() => {
    fetchDashboard()
      .then((r) => {
        setCards(r.cards);
        setLastPoll(Date.now());
      })
      .catch((err) => {
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
          onSessionExpired();
        }
      });
  }, [onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
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
          <dt>Grants</dt>
          <dd>{session.permissions.length} of grants active</dd>
          <dt>Refreshing</dt>
          <dd>{busy ? "…" : "idle"}</dd>
        </dl>
      </section>

      <section className="admin-card">
        <div className="admin-viewhead">
          <h2>Live dashboard</h2>
          <button type="button" className="admin-btn" onClick={load}>
            Refresh
          </button>
        </div>
        {error && <p className="admin-error">{error}</p>}
        {cards && (
          <>
            <div className="admin-cards">
              <Card label="Users (owners)" value={cards.users.distinct_owners} hint={`${cards.users.publishers} publishers · ${cards.users.admins} admins`} />
              <Card label="Public playlists" value={cards.playlists.count} hint={`${cards.playlists.total_tracks} tracks`} />
              <Card label="Plays" value={cards.playback.total_plays} hint={cards.playback.source} />
              <Card label="Rooms" value={cards.rooms.available ? undefined : "—"} hint={cards.rooms.available ? "live" : cards.rooms.note ?? "realtime-only (Phase G)"} />
              <Card label="Admin sessions" value={cards.sessions.active} hint={`${cards.sessions.total} total`} />
              <Card label="Failed events 24h" value={cards.errors.failed_events_24h} hint={`${cards.errors.total_audit_failures} total failures`} />
              <Card label="Storage" value={formatBytes(cards.storage.approx_bytes)} hint={`${cards.storage.total_tracks} tracks`} />
              {extra?.system && <Card label="DB rows" value={String((extra.system.row_counts as Record<string, number> | undefined)?.admin_audit ?? "—")} hint="admin_audit rows" />}
            </div>
            <p className="admin-muted admin-poll">Last refresh {lastPoll ? new Date(lastPoll).toLocaleTimeString() : "…"}</p>
          </>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Admins (Phase D — create, list; audit-only UI, no password management)
// ---------------------------------------------------------------------------

function AdminsView({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { data, error, reload } = useReport("admins", onSessionExpired);
  const [flash, setFlash] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("MODERATOR");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFlash(null);
    try {
      const r = await createAdmin({ displayName: name.trim(), role });
      setFlash(`Created ${r.admin_id} (${r.role}). One-time temp password: ${r.temp_password} — share it and it forces a change on first sign-in.`);
      setName("");
      reload();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const admins = Array.isArray((data as { admins?: unknown } | null)?.admins) ? (data as { admins: unknown[] }).admins : [];
  return (
    <section className="admin-card">
      <div className="admin-viewhead">
        <h2>Admins ({admins.length})</h2>
        <button type="button" className="admin-btn" onClick={reload}>
          Refresh
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {flash && <p className="admin-flash admin-flash--success">{flash}</p>}
      <form className="admin-row" onSubmit={(e) => void submit(e)}>
        <input className="admin-input" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className="admin-input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="MODERATOR">MODERATOR</option>
          <option value="ADMIN">ADMIN</option>
          <option value="ANALYST">ANALYST</option>
        </select>
        <button className="admin-btn" type="submit" disabled={creating || name.trim().length === 0}>
          {creating ? "Creating…" : "Create admin"}
        </button>
      </form>
      <AdminTable
        columns={["Display name", "Role", "Password state", "Created"]}
        rows={admins.map((a) => ({
          id: (a as { admin_id?: string }).admin_id ?? "—",
          other: [
            (a as { display_name?: string }).display_name ?? "—",
            (a as { role?: string }).role ?? "—",
            (a as { must_change_password?: boolean }).must_change_password ? "must change" : "ok",
            formatDate((a as { created_at?: string }).created_at),
          ],
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sessions (Phase D — list + force revoke)
// ---------------------------------------------------------------------------

function SessionsView({ session, onSessionExpired }: { session: SessionInfo; onSessionExpired: () => void }) {
  const { data, error, reload } = useReport("admin_sessions", onSessionExpired);
  const [flash, setFlash] = useState<string | null>(null);
  const me = session.session_id;
  const sessions = Array.isArray((data as { sessions?: unknown } | null)?.sessions) ? (data as { sessions: Record<string, unknown>[] }).sessions : [];

  const doRevoke = async (sessionId: string) => {
    setFlash(null);
    try {
      const r = await revokeSession(sessionId);
      setFlash(`Revoked session ${r.revoked} (${r.admin_id}).`);
      reload();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Revoke failed.");
    }
  };

  return (
    <section className="admin-card">
      <div className="admin-viewhead">
        <h2>Admin sessions ({sessions.length})</h2>
        <button type="button" className="admin-btn" onClick={reload}>
          Refresh
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {flash && <p className="admin-flash admin-flash--success">{flash}</p>}
      <AdminTable
        columns={["Session ID", "Admin", "IP", "State", "Created", "Revoked"]}
        rows={sessions.map((s) => ({
          id: (s.session_id as string) ?? "—",
          other: [
            (s.admin_id as string) ?? "—",
            String(s.ip_address ?? "—"),
            ((s as { active?: boolean }).active ?? false) ? "active" : "inactive",
            formatDate((s as { created_at?: string }).created_at),
            (s as { revoked_at?: string | null }).revoked_at ? "revoked" : "—",
          ],
          actionLabel: (s.session_id as string) === me ? undefined : "Revoke",
          onAction: (s.session_id as string) === me ? undefined : () => void doRevoke(s.session_id as string),
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Playlists (Phase F — list + hide/unhide/remove)
// ---------------------------------------------------------------------------

function PlaylistsView({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { data, error, reload } = useReport("playlists", onSessionExpired);
  const [flash, setFlash] = useState<string | null>(null);
  const playlists = Array.isArray((data as { playlists?: unknown } | null)?.playlists) ? (data as { playlists: Record<string, unknown>[] }).playlists : [];

  const act = async (id: string, action: "hide" | "unhide" | "remove") => {
    setFlash(null);
    try {
      if (action === "hide") await hidePlaylist(id);
      else if (action === "unhide") await unhidePlaylist(id);
      else await removePlaylist(id);
      setFlash(`${action} ${id}`);
      reload();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : `${action} failed.`);
    }
  };

  return (
    <section className="admin-card">
      <div className="admin-viewhead">
        <h2>Public playlists ({Array.isArray((data as { total?: unknown } | null)?.total) ? (data as { total: number }).total : playlists.length})</h2>
        <button type="button" className="admin-btn" onClick={reload}>
          Refresh
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {flash && <p className="admin-flash admin-flash--success">{flash}</p>}
      <AdminTable
        columns={["Title", "Author", "Tracks", "Plays", "State", "Updated"]}
        rows={playlists.map((p) => ({
          id: (p.id as string) ?? "—",
          other: [
            (p.title as string) ?? "—",
            (p.author as string) ?? "—",
            String(p.track_count ?? 0),
            String(p.play_count ?? 0),
            (p.hidden as boolean) ? "hidden" : "public",
            formatDate((p as { updated_at?: string }).updated_at),
          ],
          actions: [
            (p.hidden as boolean)
              ? { label: "Unhide", fn: () => void act(p.id as string, "unhide") }
              : { label: "Hide", fn: () => void act(p.id as string, "hide") },
            { label: "Remove", fn: () => void act(p.id as string, "remove") },
          ],
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Traffic (Phase J — summary + CSV export)
// ---------------------------------------------------------------------------

function TrafficView({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { data, error, reload } = useReport("traffic", onSessionExpired);
  const [flash, setFlash] = useState<string | null>(null);
  const d = (data ?? {}) as Record<string, unknown>;

  const exportCsv = async () => {
    setFlash(null);
    try {
      const { csv } = await fetchTrafficCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "creespy-traffic.csv";
      a.click();
      URL.revokeObjectURL(url);
      setFlash("Traffic CSV exported (day, playlists_created).");
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Export failed.");
    }
  };

  return (
    <section className="admin-card">
      <div className="admin-viewhead">
        <h2>Traffic & growth</h2>
        <button type="button" className="admin-btn" onClick={reload}>
          Refresh
        </button>
        <button type="button" className="admin-btn" onClick={() => void exportCsv()}>
          Export CSV
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {flash && <p className="admin-flash admin-flash--success">{flash}</p>}
      <div className="admin-cards">
        <Card label="Playlists 7d" value={Number(d.playlists_created_7d ?? 0)} />
        <Card label="Playlists 30d" value={Number(d.playlists_created_30d ?? 0)} />
        <Card label="Active owners 7d" value={Number(d.active_owners_7d ?? 0)} />
        <Card label="Active owners 30d" value={Number(d.active_owners_30d ?? 0)} />
        <Card label="Total plays" value={Number(d.total_plays ?? 0)} />
        <Card label="Avg plays/playlist" value={Number(d.avg_plays_per_playlist ?? 0)} />
      </div>
      {typeof d.note === "string" && d.note && <p className="admin-muted">{d.note}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Audit (Phase B — SUPER_ADMIN)
// ---------------------------------------------------------------------------

function AuditView({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [entries, setEntries] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSessionWatcher(onSessionExpired);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    fetch("/api/admin/audit", { credentials: "same-origin", headers: { "Content-Type": "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new AdminApiError(res.status, "Audit unavailable.");
        return (await res.json()) as { entries: Record<string, unknown>[] };
      })
      .then((r) => {
        setEntries(r.entries ?? []);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
          onSessionExpired();
          return;
        }
        setError(err instanceof Error ? err.message : "Audit load failed.");
      })
      .finally(() => setBusy(false));
  }, [onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="admin-card">
      <div className="admin-viewhead">
        <h2>Audit trail</h2>
        <button type="button" className="admin-btn" onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <AdminTable
        columns={["Admin", "Action", "Target", "Result", "When"]}
        rows={(entries ?? []).map((e) => ({
          id: (e.created_at as string) ?? "—",
          other: [
            (e.admin_id as string) ?? "—",
            (e.action as string) ?? "—",
            (e.target_type as string) ?? "—",
            (e.result as string) ?? "—",
            formatDate(e.created_at as string),
          ],
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared table + date helpers
// ---------------------------------------------------------------------------

function AdminTable({ columns, rows }: { columns?: string[]; rows: { id: string; other: string[]; actionLabel?: string; onAction?: (() => void) | undefined; actions?: { label: string; fn: () => void }[] }[] }) {
  if (rows.length === 0) return <p className="admin-muted">No rows yet.</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">ID</th>
            {(columns ?? []).map((c) => (
              <th scope="col" key={c}>{c}</th>
            ))}
            {(rows.some((r) => r.onAction) || rows.some((r) => (r.actions?.length ?? 0) > 0)) && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.id}-${i}`}>
              <td className="admin-td-id">{r.id}</td>
              {r.other.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
              <td className="admin-td-actions">
                {r.onAction && <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => r.onAction!()}>{r.actionLabel ?? "Revoke"}</button>}
                {r.actions?.map((a) => (
                  <button key={a.label} type="button" className="admin-btn admin-btn--small" onClick={a.fn}>
                    {a.label}
                  </button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(input?: string | null): string {
  if (!input) return "—";
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) return input;
  return new Date(ms).toLocaleString();
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