import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, PRESENCE_ROOM } from "../lib/supabase";
import { DIRECTORY_CHANNEL, type PublicRoomEntry } from "../lib/room";
import type {
  AdminPlaylist,
  AdminTrack,
  AdminUserRecord,
  AdminRoomRecord,
  AdminChatLog,
  AdminPlayLog,
  AdminLeaderboard,
} from "./types";

// Master Supabase client for Admin
const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Keys for cached/historical logs in localStorage
const OLD_ROOMS_KEY = "creespy_admin_old_rooms_v1";
const PLAY_LOGS_KEY = "creespy_admin_play_logs_v1";
const CHAT_LOGS_KEY = "creespy_admin_chat_logs_v1";
const HIDDEN_PLAYLISTS_KEY = "creespy_admin_hidden_playlists_v1";

export class SupabaseAdminService {
  private static instance: SupabaseAdminService;
  private onlineUsers: Set<string> = new Set();
  private activeRoomsMap: Map<string, AdminRoomRecord> = new Map();
  private chatLogs: AdminChatLog[] = [];
  private playLogs: AdminPlayLog[] = [];
  private listeners: Set<() => void> = new Set();
  private isListening = false;

  private constructor() {
    this.loadPersistedLogs();
  }

  public static getInstance(): SupabaseAdminService {
    if (!SupabaseAdminService.instance) {
      SupabaseAdminService.instance = new SupabaseAdminService();
    }
    return SupabaseAdminService.instance;
  }

  private loadPersistedLogs() {
    try {
      const rawRooms = localStorage.getItem(OLD_ROOMS_KEY);
      if (rawRooms) {
        const parsed: AdminRoomRecord[] = JSON.parse(rawRooms);
        parsed.forEach((r) => {
          if (!this.activeRoomsMap.has(r.code)) {
            this.activeRoomsMap.set(r.code, { ...r, status: "ended" });
          }
        });
      }

      const rawPlays = localStorage.getItem(PLAY_LOGS_KEY);
      if (rawPlays) {
        this.playLogs = JSON.parse(rawPlays);
      }

      const rawChats = localStorage.getItem(CHAT_LOGS_KEY);
      if (rawChats) {
        this.chatLogs = JSON.parse(rawChats);
      }
    } catch {
      /* ignore storage errors */
    }
  }

  private persistLogs() {
    try {
      const roomList = Array.from(this.activeRoomsMap.values()).slice(-100);
      localStorage.setItem(OLD_ROOMS_KEY, JSON.stringify(roomList));
      localStorage.setItem(PLAY_LOGS_KEY, JSON.stringify(this.playLogs.slice(-200)));
      localStorage.setItem(CHAT_LOGS_KEY, JSON.stringify(this.chatLogs.slice(-200)));
    } catch {
      /* ignore storage errors */
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    if (!this.isListening) {
      this.initRealtimeListeners();
    }
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        /* noop */
      }
    });
  }

  private initRealtimeListeners() {
    this.isListening = true;

    // 1. Listen for Online Users Presence
    const presenceChannel = supabaseAdmin.channel(PRESENCE_ROOM);
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const activeIds = new Set<string>();
        for (const key of Object.keys(state)) {
          const presences = state[key] as Array<{ userId?: string; name?: string; platform?: string }>;
          presences.forEach((p) => {
            if (p.userId) activeIds.add(p.userId);
          });
        }
        this.onlineUsers = activeIds;
        this.notify();
      })
      .subscribe();

    // 2. Listen for Active Rooms on DIRECTORY_CHANNEL (broadcast + presence sync)
    const dirChannel = supabaseAdmin.channel(DIRECTORY_CHANNEL, {
      config: { presence: { key: "admin-inspector" }, broadcast: { self: false } },
    });

    const syncDirectoryPresence = () => {
      const state = dirChannel.presenceState();
      Object.values(state).forEach((metas: any) => {
        const m = metas?.[0] as PublicRoomEntry | undefined;
        if (m && m.code) {
          const code = m.code.toUpperCase();
          const existing = this.activeRoomsMap.get(code);
          this.activeRoomsMap.set(code, {
            code,
            name: m.name || `Room ${code}`,
            hostName: m.hostName || "Host",
            hostId: existing?.hostId || `host-${code.toLowerCase()}`,
            isPublic: true,
            requireApproval: !!m.requireApproval,
            count: m.count || 1,
            createdAt: existing?.createdAt || m.at || Date.now(),
            lastActive: Date.now(),
            status: "active",
          });
          this.listenToRoomChat(code);
        }
      });
      this.persistLogs();
      this.notify();
    };

    dirChannel
      .on("presence", { event: "sync" }, syncDirectoryPresence)
      .on("presence", { event: "join" }, syncDirectoryPresence)
      .on("presence", { event: "leave" }, syncDirectoryPresence)
      .on("broadcast", { event: "directory_update" }, ({ payload }: { payload: any }) => {
        const entry = payload?.entry as PublicRoomEntry | undefined;
        if (!entry || !entry.code) return;
        const code = String(entry.code).trim().toUpperCase();
        const existing = this.activeRoomsMap.get(code);
        this.activeRoomsMap.set(code, {
          code,
          name: entry.name || `Room ${code}`,
          hostName: entry.hostName || "Host",
          hostId: existing?.hostId || `host-${code.toLowerCase()}`,
          isPublic: true,
          requireApproval: !!entry.requireApproval,
          count: entry.count || 1,
          createdAt: existing?.createdAt || entry.at || Date.now(),
          lastActive: Date.now(),
          status: "active",
        });
        this.persistLogs();
        this.notify();
        this.listenToRoomChat(code);
      })
      .on("broadcast", { event: "directory_remove" }, ({ payload }: { payload: any }) => {
        const code = payload?.code ? String(payload.code).trim().toUpperCase() : "";
        if (!code) return;
        const existing = this.activeRoomsMap.get(code);
        if (existing) {
          this.activeRoomsMap.set(code, { ...existing, status: "ended" });
          this.persistLogs();
          this.notify();
        }
      })
      .on("broadcast", { event: "announce" }, ({ payload }: { payload: PublicRoomEntry }) => {
        if (!payload || !payload.code) return;
        const code = payload.code.toUpperCase();
        const existing = this.activeRoomsMap.get(code);
        this.activeRoomsMap.set(code, {
          code,
          name: payload.name || `Room ${code}`,
          hostName: payload.hostName || "Host",
          hostId: existing?.hostId || `host-${code.toLowerCase()}`,
          isPublic: true,
          requireApproval: !!payload.requireApproval,
          count: payload.count || 1,
          createdAt: existing?.createdAt || payload.at || Date.now(),
          lastActive: Date.now(),
          status: "active",
        });
        this.persistLogs();
        this.notify();
        this.listenToRoomChat(code);
      })
      .on("broadcast", { event: "close" }, ({ payload }: { payload: { code: string } }) => {
        if (!payload?.code) return;
        const code = payload.code.toUpperCase();
        const existing = this.activeRoomsMap.get(code);
        if (existing) {
          this.activeRoomsMap.set(code, { ...existing, status: "ended" });
          this.persistLogs();
          this.notify();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Immediately query all active rooms across the network
          dirChannel.send({
            type: "broadcast",
            event: "directory_query",
            payload: { from: "admin-inspector" },
          }).catch(() => {});
        }
      });

    // Check browser session for any currently open room
    try {
      const sessRaw = sessionStorage.getItem("creespy.room_session.v1");
      if (sessRaw) {
        const s = JSON.parse(sessRaw);
        if (s && s.roomCode) {
          const code = s.roomCode.toUpperCase();
          this.activeRoomsMap.set(code, {
            code,
            name: s.roomName || `Room ${code}`,
            hostName: s.role === "host" ? "You (Host)" : "Host",
            hostId: s.userId || "user",
            isPublic: true,
            requireApproval: false,
            count: 1,
            createdAt: s.joinedAt || Date.now(),
            lastActive: Date.now(),
            status: "active",
          });
          this.listenToRoomChat(code);
        }
      }
    } catch {
      /* ignore */
    }

    // Periodic room discovery query every 15 seconds
    setInterval(() => {
      dirChannel.send({
        type: "broadcast",
        event: "directory_query",
        payload: { from: "admin-inspector" },
      }).catch(() => {});
    }, 15000);

    // 3. Listen for changes to public_playlists table in Realtime
    supabaseAdmin
      .channel("admin-playlists-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_playlists" },
        () => {
          this.notify();
        }
      )
      .subscribe();
  }

  private activeRoomSubs = new Set<string>();
  private listenToRoomChat(roomCode: string) {
    if (this.activeRoomSubs.has(roomCode)) return;
    this.activeRoomSubs.add(roomCode);

    const chatChannelName = `room:${roomCode.toUpperCase()}:chat`;
    supabaseAdmin
      .channel(chatChannelName)
      .on("broadcast", { event: "chat" }, ({ payload }: { payload: any }) => {
        if (!payload) return;
        this.chatLogs.unshift({
          id: payload.id || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          roomCode: roomCode.toUpperCase(),
          userId: payload.userId || "anonymous",
          nickname: payload.nickname || "User",
          message: payload.message || "",
          timestamp: payload.ts || Date.now(),
        });
        if (this.chatLogs.length > 250) this.chatLogs.pop();
        this.persistLogs();
        this.notify();
      })
      .subscribe();
  }

  // Record playback event for admin telemetry
  public recordPlayEvent(item: Omit<AdminPlayLog, "id" | "timestamp">) {
    const log: AdminPlayLog = {
      ...item,
      id: `play_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.playLogs.unshift(log);
    if (this.playLogs.length > 300) this.playLogs.pop();
    this.persistLogs();
    this.notify();
  }

  // Add room manually or from probe
  public registerRoom(room: AdminRoomRecord) {
    this.activeRoomsMap.set(room.code.toUpperCase(), room);
    this.persistLogs();
    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Data queries
  // ---------------------------------------------------------------------------

  public getHiddenPlaylistIds(): Set<string> {
    try {
      const raw = localStorage.getItem(HIDDEN_PLAYLISTS_KEY);
      if (raw) {
        return new Set(JSON.parse(raw));
      }
    } catch {
      /* ignore */
    }
    return new Set();
  }

  public saveHiddenPlaylistIds(ids: Set<string>) {
    try {
      localStorage.setItem(HIDDEN_PLAYLISTS_KEY, JSON.stringify(Array.from(ids)));
    } catch {
      /* ignore */
    }
  }

  public getLocalPlaylists(): AdminPlaylist[] {
    try {
      const raw = localStorage.getItem("ripple.central_store.v3");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const results: AdminPlaylist[] = [];

      if (Array.isArray(parsed.playlists)) {
        for (const p of parsed.playlists) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          results.push({
            id: p.id,
            owner_uid: p.owner_uid || "local-browser-user",
            title: p.title || "Untitled Local Playlist",
            description: p.description || "Local browser playlist",
            cover_art: p.cover || p.coverArt,
            track_count: Array.isArray(p.tracks) ? p.tracks.length : 0,
            tracks: Array.isArray(p.tracks) ? p.tracks : [],
            author: p.author || "Local User",
            play_count: 0,
            hidden: false,
            sourceType: "local",
            sourceLink: `${origin}/#playlist=${encodeURIComponent(p.id)}`,
            created_at: new Date(p.createdAt || Date.now()).toISOString(),
            updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
          });
        }
      }

      if (Array.isArray(parsed.likedTracks) && parsed.likedTracks.length > 0) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        results.push({
          id: "__liked_songs__",
          owner_uid: "local-browser-user",
          title: "Liked Songs",
          description: "Local user favorite saved tracks",
          track_count: parsed.likedTracks.length,
          tracks: parsed.likedTracks,
          author: "Local User",
          play_count: 0,
          hidden: false,
          sourceType: "local",
          sourceLink: `${origin}/#view=playlists`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  public async fetchPlaylists(): Promise<AdminPlaylist[]> {
    const hiddenSet = this.getHiddenPlaylistIds();
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    let remotePlaylists: AdminPlaylist[] = [];
    try {
      const { data, error } = await supabaseAdmin
        .from("public_playlists")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        console.warn("Failed to fetch public_playlists from Supabase:", error);
      } else if (data) {
        remotePlaylists = data.map((row: any) => ({
          id: row.id,
          owner_uid: row.owner_uid || "anonymous",
          title: row.title || "Untitled",
          description: row.description || "",
          cover_art: row.cover_art || undefined,
          track_count: Number(row.track_count) || (Array.isArray(row.tracks) ? row.tracks.length : 0),
          tracks: Array.isArray(row.tracks) ? row.tracks : [],
          author: row.author || "Anonymous",
          play_count: Number(row.play_count) || 0,
          hidden: hiddenSet.has(row.id),
          sourceType: "supabase",
          sourceLink: `${origin}/#playlist=${encodeURIComponent(row.id)}`,
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.warn("Network error querying Supabase playlists:", err);
    }

    // Merge with any local custom playlists
    const localPlaylists = this.getLocalPlaylists();
    const remoteIdSet = new Set(remotePlaylists.map((p) => p.id));
    const combined = [...remotePlaylists];
    for (const lp of localPlaylists) {
      if (!remoteIdSet.has(lp.id)) {
        combined.push(lp);
      }
    }

    return combined;
  }

  public async fetchUsers(playlists?: AdminPlaylist[]): Promise<AdminUserRecord[]> {
    const list = playlists || (await this.fetchPlaylists());
    const userMap = new Map<string, AdminUserRecord>();

    // Scan users from playlists
    for (const pl of list) {
      const uid = pl.owner_uid || "unknown";
      const existing = userMap.get(uid);
      const isOnline = this.onlineUsers.has(uid);

      if (!existing) {
        userMap.set(uid, {
          uid,
          authorName: pl.author || "Anonymous",
          playlistsCount: 1,
          tracksCount: pl.track_count,
          totalPlays: pl.play_count,
          firstSeen: pl.created_at,
          lastActive: pl.updated_at,
          isOnline,
          platform: this.detectPlatformFromTracks(pl.tracks),
          device: "Web Browser",
        });
      } else {
        existing.playlistsCount += 1;
        existing.tracksCount += pl.track_count;
        existing.totalPlays += pl.play_count;
        if (new Date(pl.created_at) < new Date(existing.firstSeen)) {
          existing.firstSeen = pl.created_at;
        }
        if (new Date(pl.updated_at) > new Date(existing.lastActive)) {
          existing.lastActive = pl.updated_at;
          if (pl.author && pl.author !== "Anonymous" && pl.author !== "You") {
            existing.authorName = pl.author;
          }
        }
        if (isOnline) existing.isOnline = true;
      }
    }

    // Add online users who may not have created playlists yet
    this.onlineUsers.forEach((uid) => {
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          uid,
          authorName: `User ${uid.slice(-4)}`,
          playlistsCount: 0,
          tracksCount: 0,
          totalPlays: 0,
          firstSeen: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          isOnline: true,
          platform: "Web Client",
          device: "Desktop / Mobile",
        });
      }
    });

    return Array.from(userMap.values()).sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return b.playlistsCount - a.playlistsCount;
    });
  }

  private detectPlatformFromTracks(tracks: AdminTrack[]): string {
    if (!tracks || tracks.length === 0) return "Web App";
    const counts: Record<string, number> = {};
    for (const t of tracks) {
      const p = t.sourcePlatform || t.sourceType || "youtube";
      counts[p] = (counts[p] || 0) + 1;
    }
    let top = "YouTube";
    let max = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > max) {
        max = v;
        top = k;
      }
    }
    return top.charAt(0).toUpperCase() + top.slice(1);
  }

  public getRooms(): { active: AdminRoomRecord[]; old: AdminRoomRecord[]; all: AdminRoomRecord[] } {
    const all = Array.from(this.activeRoomsMap.values());
    const now = Date.now();

    // A room is considered actively live if updated within last 10 minutes and marked active
    const active = all.filter((r) => r.status === "active" && now - r.lastActive < 10 * 60 * 1000);
    const old = all.filter((r) => !active.includes(r));

    return { active, old, all };
  }

  public getChatLogs(roomCode?: string): AdminChatLog[] {
    if (roomCode) {
      return this.chatLogs.filter((c) => c.roomCode.toUpperCase() === roomCode.toUpperCase());
    }
    return [...this.chatLogs];
  }

  public getPlayLogs(): AdminPlayLog[] {
    return [...this.playLogs];
  }

  public computeLeaderboard(playlists: AdminPlaylist[], users: AdminUserRecord[]): AdminLeaderboard {
    // 1. Top Creators
    const topCreators = [...users]
      .sort((a, b) => b.playlistsCount - a.playlistsCount || b.tracksCount - a.tracksCount)
      .slice(0, 10)
      .map((u) => ({
        uid: u.uid,
        name: u.authorName,
        playlists: u.playlistsCount,
        tracks: u.tracksCount,
      }));

    // 2. Top Played Songs
    const songMap = new Map<string, { title: string; artist: string; plays: number; playlistsCount: number; platform: string }>();
    for (const pl of playlists) {
      for (const t of pl.tracks || []) {
        const key = `${(t.title || "").trim().toLowerCase()}|${(t.artist || "").trim().toLowerCase()}`;
        const existing = songMap.get(key);
        const platform = t.sourcePlatform || t.sourceType || "YouTube";
        if (!existing) {
          songMap.set(key, {
            title: t.title || "Unknown Title",
            artist: t.artist || "Unknown Artist",
            plays: pl.play_count,
            playlistsCount: 1,
            platform,
          });
        } else {
          existing.plays += pl.play_count;
          existing.playlistsCount += 1;
        }
      }
    }

    const topPlayedSongs = Array.from(songMap.values())
      .sort((a, b) => b.playlistsCount - a.playlistsCount || b.plays - a.plays)
      .slice(0, 10);

    // 3. Platform Breakdown
    const platformCounts: Record<string, number> = { YouTube: 0, JioSaavn: 0, Spotify: 0, SoundCloud: 0, Other: 0 };
    let totalTracks = 0;

    for (const pl of playlists) {
      for (const t of pl.tracks || []) {
        totalTracks++;
        const raw = (t.sourcePlatform || t.sourceType || "youtube").toLowerCase();
        if (raw.includes("youtube")) platformCounts.YouTube++;
        else if (raw.includes("jio") || raw.includes("saavn")) platformCounts.JioSaavn++;
        else if (raw.includes("spotify")) platformCounts.Spotify++;
        else if (raw.includes("sound")) platformCounts.SoundCloud++;
        else platformCounts.Other++;
      }
    }

    const topPlatforms = Object.entries(platformCounts).map(([platform, count]) => ({
      platform,
      count,
      percentage: totalTracks > 0 ? Math.round((count / totalTracks) * 100) : 0,
    }));

    // 4. Top Active Users
    const topActiveUsers = [...users]
      .sort((a, b) => b.totalPlays - a.totalPlays || (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0))
      .slice(0, 10)
      .map((u) => ({
        uid: u.uid,
        name: u.authorName,
        totalPlays: u.totalPlays,
        lastActive: u.lastActive,
      }));

    return {
      topCreators,
      topPlayedSongs,
      topPlatforms,
      topActiveUsers,
    };
  }

  // ---------------------------------------------------------------------------
  // Admin Management Mutations
  // ---------------------------------------------------------------------------

  public async updatePlaylist(
    id: string,
    updates: Partial<{
      title: string;
      author: string;
      description: string;
      cover_art: string;
      play_count: number;
      hidden: boolean;
      tracks: AdminTrack[];
    }>
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (updates.hidden !== undefined) {
        const hiddenSet = this.getHiddenPlaylistIds();
        if (updates.hidden) {
          hiddenSet.add(id);
        } else {
          hiddenSet.delete(id);
        }
        this.saveHiddenPlaylistIds(hiddenSet);
      }

      // Check if it's a local playlist
      if (id.startsWith("__") || id.startsWith("pl-local")) {
        this.notify();
        return { ok: true };
      }

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.title !== undefined) patch.title = updates.title.trim();
      if (updates.author !== undefined) patch.author = updates.author.trim();
      if (updates.description !== undefined) patch.description = updates.description.trim();
      if (updates.cover_art !== undefined) patch.cover_art = updates.cover_art.trim();
      if (updates.play_count !== undefined) patch.play_count = updates.play_count;
      // Note: 'hidden' is managed in admin moderation store to avoid Postgres column error
      if (updates.tracks !== undefined) {
        patch.tracks = updates.tracks;
        patch.track_count = updates.tracks.length;
      }

      const { error } = await supabaseAdmin.from("public_playlists").update(patch).eq("id", id);
      if (error) throw error;
      this.notify();
      return { ok: true };
    } catch (err: any) {
      console.error("Admin updatePlaylist failed:", err);
      return { ok: false, error: err.message || "Update failed." };
    }
  }

  public async deletePlaylist(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!id.startsWith("__")) {
        const { error } = await supabaseAdmin.from("public_playlists").delete().eq("id", id);
        if (error) throw error;
      }
      this.notify();
      return { ok: true };
    } catch (err: any) {
      console.error("Admin deletePlaylist failed:", err);
      return { ok: false, error: err.message || "Delete failed." };
    }
  }

  public async toggleHidePlaylist(id: string, currentlyHidden: boolean): Promise<{ ok: boolean; error?: string }> {
    const hiddenSet = this.getHiddenPlaylistIds();
    if (currentlyHidden) {
      hiddenSet.delete(id);
    } else {
      hiddenSet.add(id);
    }
    this.saveHiddenPlaylistIds(hiddenSet);
    this.notify();
    return { ok: true };
  }

  public async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const { data, error } = await supabaseAdmin
        .from("public_playlists")
        .select("tracks")
        .eq("id", playlistId)
        .single();

      if (error || !data) throw new Error("Playlist not found");
      const currentTracks: AdminTrack[] = Array.isArray(data.tracks) ? data.tracks : [];
      const updatedTracks = currentTracks.filter((t) => t.id !== trackId);

      return this.updatePlaylist(playlistId, { tracks: updatedTracks });
    } catch (err: any) {
      return { ok: false, error: err.message || "Failed to remove track." };
    }
  }

  public async updateTrackInPlaylist(
    playlistId: string,
    trackId: string,
    trackUpdates: Partial<AdminTrack>
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const { data, error } = await supabaseAdmin
        .from("public_playlists")
        .select("tracks")
        .eq("id", playlistId)
        .single();

      if (error || !data) throw new Error("Playlist not found");
      const currentTracks: AdminTrack[] = Array.isArray(data.tracks) ? data.tracks : [];
      const updatedTracks = currentTracks.map((t) => (t.id === trackId ? { ...t, ...trackUpdates } : t));

      return this.updatePlaylist(playlistId, { tracks: updatedTracks });
    } catch (err: any) {
      return { ok: false, error: err.message || "Failed to update track." };
    }
  }
}

export const adminService = SupabaseAdminService.getInstance();
