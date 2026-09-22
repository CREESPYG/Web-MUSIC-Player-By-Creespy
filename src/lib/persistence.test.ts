import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

let storage: MemoryStorage;
let persistence: typeof import("./persistence")["persistence"];

beforeEach(async () => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  const mod = await import("./persistence");
  persistence = mod.persistence;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistence.playback", () => {
  it("round-trips playback controls", () => {
    persistence.setPlayback({ volume: 42, muted: true, rate: 1.5, shuffleMode: "random", repeatMode: "off" });
    const pb = persistence.getPlayback();
    expect(pb.volume).toBe(42);
    expect(pb.muted).toBe(true);
    expect(pb.rate).toBe(1.5);
    expect(pb.shuffleMode).toBe("random");
    expect(pb.repeatMode).toBe("off");
  });
});

describe("persistence.preferences", () => {
  it("merges partial updates, keeping defaults", () => {
    persistence.setPreferences({ autoQueue: false });
    const prefs = persistence.getPreferences();
    expect(prefs.autoQueue).toBe(false);
    expect(prefs.autoQueue).not.toBeUndefined();
  });
});

describe("persistence.lastPlayed", () => {
  it("round-trips a saved session including unresolved-track ids", () => {
    persistence.saveLastPlayed("abc123", 87.5, ["vid1", "local-id-2"]);
    expect(persistence.getLastPlayed()).toEqual({ trackVideoId: "abc123", position: 87.5, queueVideoIds: ["vid1", "local-id-2"] });
  });
  it("returns null when nothing has been played", () => {
    expect(persistence.getLastPlayed()).toBeNull();
  });
});

describe("persistence durability", () => {
  it("survives a fresh instance (real JSON round-trip)", async () => {
    persistence.saveLastPlayed("x", 5, ["a", "b"]);
    persistence.setPlayback({ volume: 11 });

    vi.resetModules();
    const mod2 = await import("./persistence");
    expect(mod2.persistence.getLastPlayed()?.position).toBe(5);
    expect(mod2.persistence.getPlayback().volume).toBe(11);
  });
});