import React, { useState } from "react";
import { createAdmin, revokeSession, type SessionInfo } from "../api";

interface SystemHealthViewProps {
  session: SessionInfo;
  adminsData: unknown[];
  sessionsData: Record<string, unknown>[];
  auditEntries: Record<string, unknown>[];
  onRefresh: () => void;
  loading: boolean;
}

export const SystemHealthView: React.FC<SystemHealthViewProps> = ({
  session,
  adminsData,
  sessionsData,
  auditEntries,
  onRefresh,
  loading,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"system" | "admins" | "sessions" | "audit">("system");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("MODERATOR");
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim()) return;
    setCreatingAdmin(true);
    try {
      const res = await createAdmin({ displayName: newAdminName.trim(), role: newAdminRole });
      setFlash({
        kind: "success",
        text: `Created admin ${res.admin_id} (${res.role}). One-time temp password: ${res.temp_password}`,
      });
      setNewAdminName("");
      onRefresh();
    } catch (err: any) {
      setFlash({ kind: "error", text: err.message || "Failed to create admin." });
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await revokeSession(sessionId);
      setFlash({ kind: "success", text: `Revoked session ${res.revoked} for admin ${res.admin_id}.` });
      onRefresh();
    } catch (err: any) {
      setFlash({ kind: "error", text: err.message || "Failed to revoke session." });
    }
  };

  return (
    <div className="admin-view-container">
      {/* Header */}
      <div className="admin-panel-head">
        <div>
          <h2 className="admin-title-gradient">System Infrastructure, Admins & Audit</h2>
          <p className="admin-desc">Control plane health, role-based access, active tokens, and immutable audit logs</p>
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
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {flash && (
        <div className={`admin-flash admin-flash--${flash.kind}`} role="status">
          {flash.text}
        </div>
      )}

      {/* Sub tabs */}
      <div className="admin-filter-bar">
        <div className="admin-segmented-control">
          <button
            type="button"
            className={`admin-seg-btn ${activeSubTab === "system" ? "admin-seg-btn--active" : ""}`}
            onClick={() => setActiveSubTab("system")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>health_and_safety</span>
            <span>System Health</span>
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${activeSubTab === "admins" ? "admin-seg-btn--active" : ""}`}
            onClick={() => setActiveSubTab("admins")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>admin_panel_settings</span>
            <span>Admins ({adminsData.length})</span>
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${activeSubTab === "sessions" ? "admin-seg-btn--active" : ""}`}
            onClick={() => setActiveSubTab("sessions")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>key</span>
            <span>Sessions ({sessionsData.length})</span>
          </button>
          <button
            type="button"
            className={`admin-seg-btn ${activeSubTab === "audit" ? "admin-seg-btn--active" : ""}`}
            onClick={() => setActiveSubTab("audit")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>policy</span>
            <span>Audit Trail ({auditEntries.length})</span>
          </button>
        </div>
      </div>

      {/* Content based on sub tab — fills remaining height */}
      {activeSubTab === "system" && (
        <div className="admin-view-scroll">
          <div className="admin-grid-2col">
            <div className="admin-card-glass">
              <h3 className="admin-card-title">Database & Infrastructure Status</h3>
              <div className="admin-dl-modern" style={{ marginTop: "16px" }}>
                <div className="admin-dl-row">
                  <span className="admin-dl-term">Database Engine</span>
                  <span className="admin-dl-def text-emerald">Supabase PostgreSQL 15+ (Online)</span>
                </div>
                <div className="admin-dl-row">
                  <span className="admin-dl-term">Realtime Subscriptions</span>
                  <span className="admin-dl-def text-cyan">Active (Heartbeat 5s, 50 ev/s)</span>
                </div>
                <div className="admin-dl-row">
                  <span className="admin-dl-term">Admin Functions</span>
                  <span className="admin-dl-def">Netlify Serverless + Local Dev Fallback</span>
                </div>
                <div className="admin-dl-row">
                  <span className="admin-dl-term">CSRF & Session Protection</span>
                  <span className="admin-dl-def text-emerald">Strict SameSite + Token SHA-256</span>
                </div>
                <div className="admin-dl-row">
                  <span className="admin-dl-term">Current Admin Session</span>
                  <span className="admin-dl-def">{session.display_name} ({session.role})</span>
                </div>
                <div className="admin-dl-row">
                  <span className="admin-dl-term">Session Expires</span>
                  <span className="admin-dl-def">{new Date(session.expires_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="admin-card-glass">
              <h3 className="admin-card-title">Access Gates & Permissions</h3>
              <div className="admin-tag-cloud" style={{ marginTop: "16px" }}>
                {session.permissions.map((p) => (
                  <span key={p} className="admin-pill admin-pill--ok" style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>check_circle</span>
                    <span>{p}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "admins" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: "12px" }}>
          <div className="admin-card-glass" style={{ flexShrink: 0 }}>
            <div className="admin-card-title-row">
              <div>
                <h3 className="admin-card-title">Admin Accounts Directory</h3>
                <p className="admin-card-subtitle">Create new administrators with role-based access control</p>
              </div>
            </div>

            <form className="admin-inline-create-form" onSubmit={handleCreateAdmin} style={{ marginTop: "16px" }}>
              <input
                type="text"
                className="admin-input-modern"
                placeholder="Admin Display Name"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                required
              />
              <select
                className="admin-input-modern"
                value={newAdminRole}
                onChange={(e) => setNewAdminRole(e.target.value)}
              >
                <option value="MODERATOR">MODERATOR</option>
                <option value="ADMIN">ADMIN</option>
                <option value="ANALYST">ANALYST</option>
              </select>
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={creatingAdmin || !newAdminName.trim()}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_add</span>
                <span>{creatingAdmin ? "Creating…" : "Create Admin"}</span>
              </button>
            </form>
          </div>

          <div className="admin-table-container">
            <table className="admin-brutalist-table">
              <thead>
                <tr>
                  <th>Admin ID</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>Password State</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {adminsData.map((a: any) => (
                  <tr key={a.admin_id}>
                    <td><code className="admin-mono-bold">{a.admin_id}</code></td>
                    <td>{a.display_name}</td>
                    <td><span className="admin-pill admin-pill--platform">{a.role}</span></td>
                    <td>
                      {a.must_change_password ? (
                        <span className="admin-pill admin-pill--warning">Must Change</span>
                      ) : (
                        <span className="admin-pill admin-pill--ok">Active</span>
                      )}
                    </td>
                    <td className="admin-date-cell">{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === "sessions" && (
        <div className="admin-table-container">
          <table className="admin-brutalist-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Admin ID</th>
                <th>IP Address</th>
                <th>State</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessionsData.map((s) => {
                const isCurrent = s.session_id === session.session_id;
                const isActive = (s as any).active || (!s.revoked_at && Date.parse(s.expires_at as string) > Date.now());
                return (
                  <tr key={s.session_id as string}>
                    <td><code className="admin-mono-text-sm">{s.session_id as string}</code></td>
                    <td><span className="admin-author-badge">{s.admin_id as string}</span></td>
                    <td><code className="admin-mono-muted-xs">{String(s.ip_address || "—")}</code></td>
                    <td>
                      {isActive ? (
                        <span className="admin-pill admin-pill--online">Active</span>
                      ) : (
                        <span className="admin-pill admin-pill--offline">Revoked / Expired</span>
                      )}
                    </td>
                    <td className="admin-date-cell">{new Date(s.created_at as string).toLocaleString()}</td>
                    <td>
                      {isCurrent ? (
                        <span className="admin-mono-muted-xs">Current Session</span>
                      ) : isActive ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--micro admin-btn--danger"
                          onClick={() => handleRevokeSession(s.session_id as string)}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="admin-mono-muted-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeSubTab === "audit" && (
        <div className="admin-table-container">
          <table className="admin-brutalist-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Admin ID</th>
                <th>Action</th>
                <th>Target Type</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">No audit entries recorded.</td>
                </tr>
              ) : (
                auditEntries.map((e, i) => (
                  <tr key={i}>
                    <td className="admin-date-cell">{new Date(e.created_at as string).toLocaleString()}</td>
                    <td><code className="admin-mono-bold">{String(e.admin_id || "system")}</code></td>
                    <td><span className="admin-mono-text-sm text-cyan">{String(e.action)}</span></td>
                    <td><span className="admin-pill admin-pill--source">{String(e.target_type || "—")}</span></td>
                    <td>
                      <span className={`admin-pill ${e.result === "ok" ? "admin-pill--ok" : "admin-pill--warning"}`}>
                        {String(e.result)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
