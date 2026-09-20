import { TRACKS } from "../data/tracks";
import type { Track } from "./trackModel";

export interface CustomPlaylist {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  cover?: string;
  coverArt?: string;
  tracks: Track[];
  author: string;
  owner_uid?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlaybackState {
  trackId: string | null;
  position: number;
  volume: number;
  muted: boolean;
  rate: number;
  shuffleMode: "off" | "random" | "magic";
  repeatMode: "off" | "all" | "one";
  lastActivePlaylistId: string | null;
}

export interface TrackHistoryItem {
  track: Track;
  playedAt: number;
}

export interface RoomHistoryItem {
  roomId: string;
  roomCode: string;
  name: string;
  isHost: boolean;
  lastJoined: number;
}

export interface AppPreferences {
  themeId: string;
  customAccent?: string;
  clock24: boolean;
  showSeconds: boolean;
  weatherUnit: "c" | "f";
  skipLanding: boolean;
  reducedMotion: boolean;
  visualizerMode: "circle" | "wave" | "bars" | "off";
  bgStyle: "dynamic" | "solid" | "wave" | "media";
  bgBlur: number;
  bgDim: number;
  borderWidth: number;
  tileOpacity: number;
  tileSize: number;
  activeScreen: "landing" | "player" | "queue" | "playlists" | "rooms" | "history" | "whatsnew" | "about" | "settings";
}

export interface PersistentStoreSchema {
  version: number;
  playback: PlaybackState;
  preferences: AppPreferences;
  playlists: CustomPlaylist[];
  trackHistory: TrackHistoryItem[];
  roomHistory: RoomHistoryItem[];
  likedTrackIds: string[];
  likedTracks?: Track[];
  likedGlobalPlaylistIds: string[];
  lastPlayed?: {
    trackVideoId: string;
    position: number;
    queueVideoIds: string[];
    savedAt: number;
  };
}

const STORAGE_KEY = "ripple.central_store.v3";
const CURRENT_VERSION = 4;

const DEFAULT_PLAYLISTS: CustomPlaylist[] = [];

const LEGACY_DUMMY_PLAYLIST_IDS = new Set(["pl-favorites", "pl-lofi-chill", "pl-midnight-ambient"]);

// Cross-tab playlist sync channel
let playlistChannel: BroadcastChannel | null = null;
try {
  playlistChannel = new BroadcastChannel("creespy-playlist-sync");
} catch {
  // BroadcastChannel not supported
}

// Playlist change subscribers
type PlaylistCallback = (playlists: CustomPlaylist[]) => void;
const playlistListeners: Set<PlaylistCallback> = new Set();

export function subscribeToPlaylistChanges(callback: PlaylistCallback): () => void {
  playlistListeners.add(callback);
  return () => playlistListeners.delete(callback);
}

const DEFAULT_STORE: PersistentStoreSchema = {
  version: CURRENT_VERSION,
  playback: {
    trackId: TRACKS[0]?.videoId || null,
    position: 0,
    volume: 80,
    muted: false,
    rate: 1,
    shuffleMode: "magic",
    repeatMode: "all",
    lastActivePlaylistId: null,
  },
  preferences: {
    themeId: "abyss",
    clock24: false,
    showSeconds: true,
    weatherUnit: "c",
    skipLanding: false,
    reducedMotion: false,
    visualizerMode: "circle",
    bgStyle: "dynamic",
    bgBlur: 14,
    bgDim: 0.5,
    borderWidth: 1,
    tileOpacity: 1,
    tileSize: 26,
    activeScreen: "landing",
  },
  playlists: DEFAULT_PLAYLISTS,
  trackHistory: [],
  roomHistory: [],
  likedTrackIds: [],
  likedGlobalPlaylistIds: [],
};

class PersistenceManager {
  private store: PersistentStoreSchema;

  constructor() {
    this.store = this.loadFromStorage();

    // Listen for cross-tab playlist sync via BroadcastChannel
    playlistChannel?.addEventListener("message", (e) => {
      if (e.data?.type === "playlists-updated" && Array.isArray(e.data.playlists)) {
        this.store.playlists = e.data.playlists;
        // Notify subscribers
        playlistListeners.forEach((cb) => cb(this.store.playlists));
      }
    });
  }

  private cleanPlaylists(playlists: any[]): CustomPlaylist[] {
    if (!Array.isArray(playlists)) return [];
    return playlists.filter((p) => p && typeof p.id === "string" && !LEGACY_DUMMY_PLAYLIST_IDS.has(p.id));
  }

  private loadFromStorage(): PersistentStoreSchema {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STORE };
      const parsed = JSON.parse(raw);

      const cleanedPlaylists = this.cleanPlaylists(parsed.playlists);

      // Safe migration check
      if (parsed.version !== CURRENT_VERSION) {
        return {
          ...DEFAULT_STORE,
          ...parsed,
          version: CURRENT_VERSION,
          playback: { ...DEFAULT_STORE.playback, ...parsed.playback },
          preferences: { ...DEFAULT_STORE.preferences, ...parsed.preferences },
          playlists: cleanedPlaylists,
        };
      }
      return {
        ...parsed,
        playlists: cleanedPlaylists,
      };
    } catch {
      return { ...DEFAULT_STORE };
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
    } catch (e) {
      console.warn("Failed to save central store", e);
    }
  }

  public getStore(): PersistentStoreSchema {
    return this.store;
  }

  public saveStore(store?: PersistentStoreSchema): void {
    if (store) this.store = store;
    this.saveToStorage();
  }

  public getPlayback(): PlaybackState {
    return this.store.playback;
  }

  public setPlayback(updates: Partial<PlaybackState>): void {
    this.store.playback = { ...this.store.playback, ...updates };
    this.saveToStorage();
  }

  public getPreferences(): AppPreferences {
    return this.store.preferences;
  }

  public setPreferences(updates: Partial<AppPreferences>): void {
    this.store.preferences = { ...this.store.preferences, ...updates };
    this.saveToStorage();
  }

  public getCustomTracks(): Track[] {
    const tracks = new Map<string, Track>();
    for (const pl of this.store.playlists) {
      if (Array.isArray(pl.tracks)) {
        for (const t of pl.tracks) {
          if (t && (t.id || t.videoId)) {
            tracks.set(t.id || t.videoId, t);
          }
        }
      }
    }
    return Array.from(tracks.values());
  }

  public getPlaylists(): CustomPlaylist[] {
    return this.store.playlists;
  }

  public setPlaylists(playlists: CustomPlaylist[]): void {
    this.store.playlists = playlists;
    this.saveToStorage();
    // Broadcast to other tabs for instant sync
    try {
      playlistChannel?.postMessage({ type: "playlists-updated", playlists });
    } catch {}
    // Notify local subscribers
    playlistListeners.forEach((cb) => cb(playlists));
  }

  public addTrackToHistory(track: Track): void {
    const existing = this.store.trackHistory.filter((h) => h.track.videoId !== track.videoId);
    this.store.trackHistory = [{ track, playedAt: Date.now() }, ...existing.slice(0, 49)];
    this.saveToStorage();
  }

  public getTrackHistory(): TrackHistoryItem[] {
    return this.store.trackHistory;
  }

  public clearTrackHistory(): void {
    this.store.trackHistory = [];
    this.saveToStorage();
  }

  public addRoomToHistory(room: Omit<RoomHistoryItem, "lastJoined">): void {
    const existing = this.store.roomHistory.filter((h) => h.roomCode !== room.roomCode && h.roomId !== room.roomId);
    this.store.roomHistory = [{ ...room, lastJoined: Date.now() }, ...existing.slice(0, 19)];
    this.saveToStorage();
  }

  public getRoomHistory(): RoomHistoryItem[] {
    return this.store.roomHistory;
  }

  public clearRoomHistory(): void {
    this.store.roomHistory = [];
    this.saveToStorage();
  }

  public toggleLike(trackId: string, track?: Track): boolean {
    const set = new Set(this.store.likedTrackIds);
    let isLiked = false;
    if (set.has(trackId)) {
      set.delete(trackId);
      isLiked = false;
    } else {
      set.add(trackId);
      isLiked = true;
    }
    this.store.likedTrackIds = Array.from(set);
    // Also store/remove the track object
    if (track) {
      if (isLiked) {
        // Add track if not already stored
        if (!this.store.likedTracks) this.store.likedTracks = [];
        if (!this.store.likedTracks.some((t) => t.videoId === trackId || t.id === trackId)) {
          this.store.likedTracks.push(track);
        }
      } else {
        // Remove track
        this.store.likedTracks = (this.store.likedTracks || []).filter(
          (t) => t.videoId !== trackId && t.id !== trackId
        );
      }
    } else if (!isLiked) {
      // Remove from likedTracks when unliking
      this.store.likedTracks = (this.store.likedTracks || []).filter(
        (t) => t.videoId !== trackId && t.id !== trackId
      );
    }
    this.saveToStorage();
    return isLiked;
  }

  public isLiked(trackId: string): boolean {
    return this.store.likedTrackIds.includes(trackId);
  }

  public getLikedTracks(): Track[] {
    return this.store.likedTracks || [];
  }

  public toggleGlobalPlaylistLike(playlistId: string): boolean {
    const set = new Set(this.store.likedGlobalPlaylistIds || []);
    let isLiked = false;
    if (set.has(playlistId)) {
      set.delete(playlistId);
      isLiked = false;
    } else {
      set.add(playlistId);
      isLiked = true;
    }
    this.store.likedGlobalPlaylistIds = Array.from(set);
    this.saveToStorage();
    return isLiked;
  }

  public isGlobalPlaylistLiked(playlistId: string): boolean {
    return (this.store.likedGlobalPlaylistIds || []).includes(playlistId);
  }

  public getLikedGlobalPlaylistIds(): string[] {
    return this.store.likedGlobalPlaylistIds || [];
  }

  public saveLastPlayed(trackVideoId: string, position: number, queueVideoIds: string[]): void {
    this.store.lastPlayed = {
      trackVideoId,
      position,
      queueVideoIds,
      savedAt: Date.now(),
    };
    this.saveToStorage();
  }

  public getLastPlayed(): { trackVideoId: string; position: number; queueVideoIds: string[] } | null {
    const lp = this.store.lastPlayed;
    if (!lp || !lp.trackVideoId) return null;
    // Don't restore if older than 7 days
    if (Date.now() - lp.savedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return { trackVideoId: lp.trackVideoId, position: lp.position, queueVideoIds: lp.queueVideoIds };
  }
}

export const persistence = new PersistenceManager();
