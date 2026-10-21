import { describe, it, expect, beforeEach } from "vitest";
import { normalizeTrack, type Track } from "./trackModel";
import { makeTrack, parseYouTubeId, similarity } from "./media";
import { versionMarkersOf, stripVersion } from "./resolver";
import { persistence } from "./persistence";
import { genRoomCode, roomChannel, roomChatChannel, roomSyncChannel, lobbyChannel, inviteLink, readInviteCode, userId } from "./room";

/**
 * Phase 27 — cross-module integration seams.
 * These stitch the standalone modules (tested individually in media.test /
 * persistence.test) into the contracts the App actually depends on:
 *   import → normalize → queue identity → resolver version handling →
 *   persistence restore contract → room channel identity.
 * Browser/webRTC/multi-device behavior is covered by the manual Phase 27/28
 * matrix (cannot run headlessly).
 */

function stubLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("Phase 27 integration · import → normalize → queue", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("normalizeTrack preserves platform identity + version metadata", () => {
    const raw = {
      id: "js-123",
      videoId: "",
      title: "Song Name (Remix) [feat. Artist Two]",
      artist: "Artist One",
      artists: ["Artist One", "Artist Two"],
      album: "Album X (Deluxe)",
      duration: 225,
      isrc: "INZ031234567",
      source: "import",
      sourceType: "jiosaavn" as const,
      sourcePlatform: "jiosaavn",
      sourceUrl: "https://www.jiosaavn.com/song/...",
      sourceTrackId: "js-123",
      playlistPosition: 3,
      resolverStatus: "UNRESOLVED" as const,
    };
    const t = normalizeTrack(raw);
    expect(t.id).toBe("js-123");
    expect(t.isrc).toBe("INZ031234567");
    expect(t.artists).toEqual(["Artist One", "Artist Two"]);
    expect(t.sourcePlatform).toBe("jiosaavn");
    expect(t.resolverStatus).toBe("UNRESOLVED");
    expect(t.playable).toBe(false);
  });

  it("unresolved track stays queueable and keyed by id (not videoId)", () => {
    const unresolved = normalizeTrack({
      id: "local-abc",
      title: "Big Scenes",
      artist: "Random",
      videoId: "",
      resolverStatus: "UNRESOLVED",
    });
    const resolved = makeTrack("video999", "Big Scenes", "Random");
    const keys = [unresolved, resolved].map((t) => t.videoId || t.id);
    expect(keys).toEqual(["local-abc", "video999"]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("a queued-mix of resolved/unresolved stays unique for the player queue", () => {
    const queue: Track[] = [
      makeTrack("a", "A", "X"),
      normalizeTrack({ id: "un1", title: "U", artist: "Z", videoId: "", resolverStatus: "UNRESOLVED" }),
      makeTrack("b", "B", "Y"),
      makeTrack("a", "A", "X"), // duplicate videoId from another source
    ];
    const seen = new Set<string>();
    let dupes = 0;
    for (const t of queue) {
      const k = t.videoId || t.id;
      if (seen.has(k)) dupes += 1;
      seen.add(k);
    }
    expect(dupes).toBe(1); // only the intentional duplicate
  });
});

describe("Phase 27 integration · resolver version handling", () => {
  it("version markers survive normalization and are detected", () => {
    expect(versionMarkersOf("Song (Live)")).toContain("live");
    expect(versionMarkersOf("Darude - Sandstorm (Original Mix)")).toContain("original mix");
    const stripped = stripVersion("Song (Remix)");
    expect(stripped).not.toContain("Remix");
    expect(stripped).toContain("Song");
  });
});

describe("Phase 27 integration · persistence restore contract", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("full session restore round-trip", () => {
    const track = makeTrack("v9", "Nightcall", "Driveband");
    persistence.setPlayback({ volume: 55, muted: true, rate: 1.25, shuffleMode: "random", repeatMode: "off" });
    persistence.saveLastPlayed(track.videoId, 12.5, ["v9", "v8", "un1"], true);
    persistence.setPlaylists([
      {
        id: "pl-1",
        title: "Driving",
        description: "",
        isPublic: false,
        tracks: [track],
        author: "Anonymous",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    const pb = persistence.getPlayback();
    expect(pb?.volume).toBe(55);
    expect(pb?.shuffleMode).toBe("random");
    expect(pb?.repeatMode).toBe("off");

    const lp = persistence.getLastPlayed();
    expect(lp?.trackVideoId).toBe("v9");
    expect(lp?.position).toBe(12.5);
    expect(lp?.queueVideoIds).toEqual(["v9", "v8", "un1"]);
    expect(lp?.playing).toBe(true);
  });
});

describe("Phase 27 integration · room channel identity", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("room code is 5 chars long and channel names derive consistently", () => {
    const code = genRoomCode();
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    const u = code.toUpperCase();
    expect(roomChannel(code)).toBe(`room:${u}`);
    expect(roomChatChannel(code)).toBe(`room:${u}:chat`);
    expect(roomSyncChannel(code)).toBe(`room:${u}:sync`);
    expect(lobbyChannel(code)).toBe(`room:${u}:lobby`);
  });

  it("invite link contains the share code and readInviteCode reads it", () => {
    const url = inviteLink("ABC12");
    expect(url).toContain("#room=ABC12");
    (globalThis as any).location = { search: "", hash: "#room=DEF34", pathname: "/", href: url };
    (globalThis as any).window = { location: (globalThis as any).location };
    expect(readInviteCode()).toBe("DEF34");

    // Search Query params (?room=XYZ or ?code=XYZ)
    (globalThis as any).location = { search: "?room=XYZ78", hash: "", pathname: "/" };
    expect(readInviteCode()).toBe("XYZ78");
    (globalThis as any).location = { search: "?code=K9J21", hash: "", pathname: "/" };
    expect(readInviteCode()).toBe("K9J21");

    // Path params (/room/XYZ or /rooms/XYZ)
    (globalThis as any).location = { search: "", hash: "", pathname: "/room/ROOM12" };
    expect(readInviteCode()).toBe("ROOM12");
  });

  it("userId is browser-level (persists across 'tabs' in shared storage)", () => {
    const first = userId();
    // simulate another tab: new js-context storage would reset __CREESPY_UID__,
    // but the localStorage copy keeps identity stable
    delete (globalThis as any).__CREESPY_UID__;
    const second = userId();
    expect(second).toBe(first);
  });
});

describe("Phase 27 integration · fuzzy identity helpers", () => {
  it("tokens + similarity power cross-platform matching", () => {
    const a = makeTrack("x", "Midnight City", "M83");
    const b = makeTrack("y", "Midnight City (Extended)", "M83");
    expect(similarity(a, b)).toBeGreaterThan(0.5);
    expect(parseYouTubeId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
  });
});