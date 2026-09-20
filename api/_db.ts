import fs from 'fs';

const DB_PATH = '/tmp/music.db';
const JSON_BACKUP_PATH = '/tmp/music-fallback.json';

export interface PlaylistData {
  id: string;
  owner_uid: string;
  title: string;
  description?: string;
  cover_art?: string | null;
  track_count?: number;
  tracks?: any;
  author?: string;
  play_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RoomData {
  id: string;
  room_code: string;
  name: string;
  room_type?: string;
  host_id: string;
  control_mode?: string;
  require_approval?: number | boolean;
  chat_enabled?: number | boolean;
  voice_enabled?: number | boolean;
  status?: string;
  max_participants?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  message: string;
  created_at?: string;
}

// Check if node:sqlite is available
let sqliteDb: any = null;
let useSqlite = false;

try {
  // Try dynamic require or import for node:sqlite
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const sqlite = require('node:sqlite');
  if (sqlite && sqlite.DatabaseSync) {
    sqliteDb = new sqlite.DatabaseSync(DB_PATH);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS public_playlists (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover_art TEXT,
        track_count INTEGER DEFAULT 0,
        tracks TEXT DEFAULT '[]',
        author TEXT DEFAULT 'Anonymous',
        play_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pp_updated ON public_playlists(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pp_owner ON public_playlists(owner_uid);

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        room_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        room_type TEXT DEFAULT 'public',
        host_id TEXT NOT NULL,
        control_mode TEXT DEFAULT 'host_only',
        require_approval INTEGER DEFAULT 0,
        chat_enabled INTEGER DEFAULT 1,
        voice_enabled INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        max_participants INTEGER DEFAULT 20,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS room_chat (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chat_room ON room_chat(room_id, created_at DESC);
    `);
    useSqlite = true;
  }
} catch {
  useSqlite = false;
}

// Fallback JSON in-memory & file store
interface FallbackStore {
  playlists: Record<string, PlaylistData>;
  rooms: Record<string, RoomData>;
  chat: ChatMessage[];
}

function loadFallbackStore(): FallbackStore {
  try {
    if (fs.existsSync(JSON_BACKUP_PATH)) {
      const raw = fs.readFileSync(JSON_BACKUP_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return { playlists: {}, rooms: {}, chat: [] };
}

function saveFallbackStore(store: FallbackStore) {
  try {
    fs.writeFileSync(JSON_BACKUP_PATH, JSON.stringify(store), 'utf-8');
  } catch {}
}

export const dbService = {
  // --- PLAYLISTS ---
  getPlaylists(owner?: string, id?: string): PlaylistData[] | PlaylistData | null {
    if (useSqlite) {
      if (id) {
        return sqliteDb.prepare('SELECT * FROM public_playlists WHERE id = ?').get(id) || null;
      }
      if (owner) {
        return sqliteDb.prepare('SELECT * FROM public_playlists WHERE owner_uid = ? ORDER BY updated_at DESC').all(owner);
      }
      return sqliteDb.prepare('SELECT * FROM public_playlists ORDER BY updated_at DESC LIMIT 100').all();
    } else {
      const store = loadFallbackStore();
      if (id) {
        return store.playlists[id] || null;
      }
      const list = Object.values(store.playlists);
      if (owner) {
        return list.filter((p) => p.owner_uid === owner).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      }
      return list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 100);
    }
  },

  upsertPlaylist(data: PlaylistData): PlaylistData {
    const now = new Date().toISOString();
    const tracksStr = typeof data.tracks === 'string' ? data.tracks : JSON.stringify(data.tracks || []);
    if (useSqlite) {
      sqliteDb.prepare(`
        INSERT INTO public_playlists (id, owner_uid, title, description, cover_art, tracks, author, track_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          cover_art = excluded.cover_art,
          tracks = excluded.tracks,
          author = excluded.author,
          track_count = excluded.track_count,
          updated_at = datetime('now')
      `).run(
        data.id,
        data.owner_uid,
        data.title,
        data.description || '',
        data.cover_art || null,
        tracksStr,
        data.author || 'Anonymous',
        data.track_count || 0
      );
      return sqliteDb.prepare('SELECT * FROM public_playlists WHERE id = ?').get(data.id);
    } else {
      const store = loadFallbackStore();
      const existing = store.playlists[data.id];
      const saved: PlaylistData = {
        id: data.id,
        owner_uid: data.owner_uid,
        title: data.title,
        description: data.description || '',
        cover_art: data.cover_art || null,
        tracks: tracksStr,
        author: data.author || 'Anonymous',
        track_count: data.track_count || 0,
        play_count: existing ? existing.play_count || 0 : 0,
        created_at: existing ? existing.created_at || now : now,
        updated_at: now,
      };
      store.playlists[data.id] = saved;
      saveFallbackStore(store);
      return saved;
    }
  },

  deletePlaylist(id: string, owner: string): boolean {
    if (useSqlite) {
      const res = sqliteDb.prepare('DELETE FROM public_playlists WHERE id = ? AND owner_uid = ?').run(id, owner);
      return res.changes > 0;
    } else {
      const store = loadFallbackStore();
      if (store.playlists[id] && store.playlists[id].owner_uid === owner) {
        delete store.playlists[id];
        saveFallbackStore(store);
        return true;
      }
      return false;
    }
  },

  incrementPlayCount(id: string): boolean {
    if (useSqlite) {
      sqliteDb.prepare('UPDATE public_playlists SET play_count = play_count + 1 WHERE id = ?').run(id);
      return true;
    } else {
      const store = loadFallbackStore();
      if (store.playlists[id]) {
        store.playlists[id].play_count = (store.playlists[id].play_count || 0) + 1;
        saveFallbackStore(store);
        return true;
      }
      return false;
    }
  },

  // --- ROOMS ---
  getRoom(code?: string): RoomData[] | RoomData | null {
    if (useSqlite) {
      if (code) {
        return sqliteDb.prepare('SELECT * FROM rooms WHERE room_code = ?').get(code) || null;
      }
      return sqliteDb.prepare("SELECT * FROM rooms WHERE status = 'active' ORDER BY created_at DESC LIMIT 50").all();
    } else {
      const store = loadFallbackStore();
      if (code) {
        const found = Object.values(store.rooms).find((r) => r.room_code === code);
        return found || null;
      }
      return Object.values(store.rooms).filter((r) => r.status === 'active');
    }
  },

  createRoom(data: RoomData): RoomData {
    const now = new Date().toISOString();
    if (useSqlite) {
      sqliteDb.prepare(`
        INSERT INTO rooms (id, room_code, name, room_type, host_id, control_mode, require_approval, chat_enabled, voice_enabled, max_participants)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.room_code,
        data.name,
        data.room_type || 'public',
        data.host_id,
        data.control_mode || 'host_only',
        data.require_approval ? 1 : 0,
        data.chat_enabled !== undefined ? (data.chat_enabled ? 1 : 0) : 1,
        data.voice_enabled !== undefined ? (data.voice_enabled ? 1 : 0) : 1,
        data.max_participants || 20
      );
      return sqliteDb.prepare('SELECT * FROM rooms WHERE id = ?').get(data.id);
    } else {
      const store = loadFallbackStore();
      const saved: RoomData = {
        id: data.id,
        room_code: data.room_code,
        name: data.name,
        room_type: data.room_type || 'public',
        host_id: data.host_id,
        control_mode: data.control_mode || 'host_only',
        require_approval: data.require_approval ? 1 : 0,
        chat_enabled: data.chat_enabled !== undefined ? (data.chat_enabled ? 1 : 0) : 1,
        voice_enabled: data.voice_enabled !== undefined ? (data.voice_enabled ? 1 : 0) : 1,
        status: 'active',
        max_participants: data.max_participants || 20,
        created_at: now,
        updated_at: now,
      };
      store.rooms[data.id] = saved;
      saveFallbackStore(store);
      return saved;
    }
  },

  updateRoom(id: string, updates: Partial<RoomData>): RoomData | null {
    if (useSqlite) {
      const keys = Object.keys(updates);
      if (keys.length === 0) return null;
      const setClauses = keys.map((k) => `${k} = ?`).join(', ');
      const values = [...Object.values(updates), id];
      sqliteDb.prepare(`UPDATE rooms SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`).run(...values);
      return sqliteDb.prepare('SELECT * FROM rooms WHERE id = ?').get(id) || null;
    } else {
      const store = loadFallbackStore();
      if (!store.rooms[id]) return null;
      store.rooms[id] = { ...store.rooms[id], ...updates, updated_at: new Date().toISOString() };
      saveFallbackStore(store);
      return store.rooms[id];
    }
  },

  closeRoom(id: string, hostId: string): boolean {
    if (useSqlite) {
      const res = sqliteDb.prepare("UPDATE rooms SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND host_id = ?").run(id, hostId);
      return res.changes > 0;
    } else {
      const store = loadFallbackStore();
      if (store.rooms[id] && store.rooms[id].host_id === hostId) {
        store.rooms[id].status = 'closed';
        store.rooms[id].updated_at = new Date().toISOString();
        saveFallbackStore(store);
        return true;
      }
      return false;
    }
  },

  // --- CHAT ---
  getChat(roomId: string, limit = 100): ChatMessage[] {
    if (useSqlite) {
      const rows = sqliteDb.prepare('SELECT * FROM room_chat WHERE room_id = ? ORDER BY created_at DESC LIMIT ?').all(roomId, limit);
      return (rows || []).reverse();
    } else {
      const store = loadFallbackStore();
      return (store.chat || [])
        .filter((c) => c.room_id === roomId)
        .slice(-limit);
    }
  },

  addChatMessage(data: ChatMessage): ChatMessage {
    const now = new Date().toISOString();
    if (useSqlite) {
      sqliteDb.prepare(`
        INSERT INTO room_chat (id, room_id, user_id, nickname, message)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.id, data.room_id, data.user_id, data.nickname, data.message);
      return sqliteDb.prepare('SELECT * FROM room_chat WHERE id = ?').get(data.id);
    } else {
      const store = loadFallbackStore();
      const saved: ChatMessage = { ...data, created_at: now };
      store.chat = store.chat || [];
      store.chat.push(saved);
      if (store.chat.length > 500) store.chat = store.chat.slice(-500);
      saveFallbackStore(store);
      return saved;
    }
  },
};
