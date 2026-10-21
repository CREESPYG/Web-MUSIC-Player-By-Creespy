import React, { useState, useEffect } from "react";
import type { AdminPlaylist, AdminTrack } from "../types";
import { adminService } from "../supabaseAdmin";

interface EditPlaylistModalProps {
  playlist: AdminPlaylist | null;
  onClose: () => void;
  onSaved: () => void;
}

export const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({ playlist, onClose, onSaved }) => {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [coverArt, setCoverArt] = useState("");
  const [playCount, setPlayCount] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (playlist) {
      setTitle(playlist.title || "");
      setAuthor(playlist.author || "");
      setDescription(playlist.description || "");
      setCoverArt(playlist.cover_art || "");
      setPlayCount(playlist.play_count || 0);
      setHidden(!!playlist.hidden);
      setTracks([...(playlist.tracks || [])]);
      setError(null);
    }
  }, [playlist]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!playlist) return null;

  const handleRemoveTrack = (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handleUpdateTrack = (trackId: string, field: "title" | "artist", value: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, [field]: value } : t))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await adminService.updatePlaylist(playlist.id, {
      title,
      author,
      description,
      cover_art: coverArt,
      play_count: playCount,
      hidden,
      tracks,
    });

    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      setError(res.error || "Failed to update playlist.");
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <div>
            <h3 className="admin-modal-title">Edit Playlist in Supabase</h3>
            <span className="admin-mono-muted-sm">ID: {playlist.id}</span>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} title="Close modal">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && <div className="admin-flash admin-flash--error">{error}</div>}

        <form onSubmit={handleSubmit} className="admin-modal-form">
          <div className="admin-modal-scroll-body">
            {/* Playlist Metadata Section */}
            <div className="admin-form-grid">
              <div className="admin-form-group">
                <label className="admin-label-modern">Playlist Title</label>
                <input
                  type="text"
                  className="admin-input-modern"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label-modern">Author / Creator Name</label>
                <input
                  type="text"
                  className="admin-input-modern"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group admin-col-span-2">
                <label className="admin-label-modern">Description</label>
                <textarea
                  className="admin-input-modern admin-textarea-modern"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label-modern">Cover Art Image URL</label>
                <input
                  type="url"
                  className="admin-input-modern"
                  placeholder="https://..."
                  value={coverArt}
                  onChange={(e) => setCoverArt(e.target.value)}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label-modern">Total Plays Count</label>
                <input
                  type="number"
                  className="admin-input-modern"
                  min={0}
                  value={playCount}
                  onChange={(e) => setPlayCount(Number(e.target.value) || 0)}
                />
              </div>

              <div className="admin-form-group admin-col-span-2">
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hidden}
                    onChange={(e) => setHidden(e.target.checked)}
                  />
                  <span>Hide from Public Directory (Admin Moderation Toggle)</span>
                </label>
              </div>
            </div>

            {/* Tracks Management Section */}
            <div className="admin-tracks-subhead">
              <h4>Manage Playlist Songs ({tracks.length})</h4>
              <p className="admin-muted-sm">
                Modify song titles/artists or remove individual tracks from this playlist
              </p>
            </div>

            <div className="admin-tracks-edit-list">
              {tracks.length === 0 ? (
                <div className="admin-table-empty">No tracks in this playlist.</div>
              ) : (
                tracks.map((t, idx) => (
                  <div key={t.id || idx} className="admin-track-edit-row">
                    <span className="admin-track-idx">{idx + 1}</span>
                    <div className="admin-track-inputs">
                      <input
                        type="text"
                        className="admin-input-modern admin-input--compact"
                        placeholder="Song Title"
                        value={t.title || ""}
                        onChange={(e) => handleUpdateTrack(t.id, "title", e.target.value)}
                      />
                      <input
                        type="text"
                        className="admin-input-modern admin-input--compact"
                        placeholder="Artist"
                        value={t.artist || ""}
                        onChange={(e) => handleUpdateTrack(t.id, "artist", e.target.value)}
                      />
                    </div>
                    <span className="admin-pill admin-pill--platform">
                      {t.sourcePlatform || t.sourceType || "youtube"}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn--micro admin-btn--danger"
                      onClick={() => handleRemoveTrack(t.id)}
                      title="Remove track from playlist"
                      style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>delete</span>
                      <span>Remove</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-modal-footer">
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={onClose}
              disabled={saving}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>cancel</span>
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={saving}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>save</span>
              <span>{saving ? "Saving to Supabase…" : "Save Changes"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
