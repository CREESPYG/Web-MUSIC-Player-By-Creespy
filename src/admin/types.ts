export interface AdminTrack {
  id: string;
  title: string;
  artist: string;
  duration?: number;
  thumb?: string;
  coverUrl?: string;
  artwork?: string;
  source?: string;
  sourceType?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  videoId?: string;
  resolverStatus?: "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "UNRESOLVED";
  tag?: string;
}

export interface AdminPlaylist {
  id: string;
  owner_uid: string;
  title: string;
  description?: string;
  cover_art?: string;
  track_count: number;
  tracks: AdminTrack[];
  author: string;
  play_count: number;
  hidden?: boolean;
  sourceType?: "supabase" | "local";
  sourceLink?: string;
  created_at: string;
  updated_at: string;
}

export interface AdminUserRecord {
  uid: string;
  authorName: string;
  playlistsCount: number;
  tracksCount: number;
  totalPlays: number;
  firstSeen: string;
  lastActive: string;
  isOnline: boolean;
  platform?: string;
  device?: string;
}

export interface AdminRoomRecord {
  code: string;
  name: string;
  hostName: string;
  hostId: string;
  isPublic: boolean;
  requireApproval: boolean;
  count: number;
  createdAt: number;
  lastActive: number;
  status: "active" | "idle" | "ended";
  chatCount?: number;
}

export interface AdminChatLog {
  id: string;
  roomCode: string;
  userId: string;
  nickname: string;
  message: string;
  timestamp: number;
}

export interface AdminPlayLog {
  id: string;
  userId: string;
  userName: string;
  songTitle: string;
  artist: string;
  platform: string;
  timestamp: number;
  playlistId?: string;
  playlistTitle?: string;
}

export interface AdminLeaderboard {
  topCreators: { uid: string; name: string; playlists: number; tracks: number }[];
  topPlayedSongs: { title: string; artist: string; plays: number; playlistsCount: number; platform: string }[];
  topPlatforms: { platform: string; count: number; percentage: number }[];
  topActiveUsers: { uid: string; name: string; totalPlays: number; lastActive: string }[];
}
