import { describe, expect, it } from "vitest";
import {
  parsePlaylistId,
  parseYouTubeId,
  pickMagicIndex,
  similarity,
  tokens,
} from "./media";
import type { Track } from "./trackModel";

const track = (over: Partial<Track>): Track =>
  ({
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    videoId: "dQw4w9WgXcQ",
    title: "Test Song",
    artist: "Test Artist",
    source: "custom",
    sourceType: "youtube",
    playable: true,
    playableSource: "dQw4w9WgXcQ",
    playableSourceType: "youtube",
    resolverStatus: "EXACT",
    metadataConfidence: "EXACT",
    bpm: 100,
    seed: 1,
    ...over,
  }) as Track;

describe("parseYouTubeId", () => {
  it("extracts from watch URLs", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from youtu.be short links", () => {
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from shorts / embed / live paths", () => {
    expect(parseYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("accepts a bare 11-char id", () => {
    expect(parseYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("handles music subdomain", () => {
    expect(parseYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("rejects non-ids", () => {
    expect(parseYouTubeId("not a video")).toBeNull();
    expect(parseYouTubeId("dQw4w9WgXc")).toBeNull();
    expect(parseYouTubeId("dQw4w9WgXcQZ")).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
  });
});

describe("parsePlaylistId", () => {
  it("extracts list ids from playlist URLs", () => {
    const id = "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf";
    expect(parsePlaylistId(`https://www.youtube.com/playlist?list=${id}`)).toBe(id);
    expect(parsePlaylistId(`https://youtube.com/watch?v=dQw4w9WgXcQ&list=${id}`)).toBe(id);
  });
  it("accepts a bare playlist id", () => {
    expect(parsePlaylistId("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBe("PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf");
  });
  it("returns null when no list param and not a playlist id", () => {
    expect(parsePlaylistId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parsePlaylistId("hello")).toBeNull();
  });
});

describe("tokens", () => {
  it("lowercases, strips punctuation, drops short words", () => {
    expect(tokens("  Hi There , you & me!!  ")).toEqual(["there", "you"]);
  });
  it("removes stop words and pure numbers", () => {
    expect(tokens("the remix of love 2024")).toEqual(["love"]);
  });
  it("is empty for empty input", () => {
    expect(tokens("")).toEqual([]);
  });
});

describe("similarity", () => {
  it("returns 1 for the same track id", () => {
    const a = track({});
    expect(similarity(a, { ...a })).toBe(1);
  });
  it("gives a bonus for the same artist and shared tokens", () => {
    const a = track({ title: "Blinding Lights", artist: "The Weeknd" });
    const b = track({ title: "Blinding Lights remix", artist: "the weeknd" });
    const s1 = similarity(a, b);
    const c = track({ title: "Lemonade", artist: "Someone Else" });
    const s2 = similarity(a, c);
    expect(s1).toBeGreaterThan(s2);
  });
});

describe("pickMagicIndex", () => {
  it("returns 0 for a single-track queue", () => {
    expect(pickMagicIndex([track({})], 0, [])).toBe(0);
  });
  it("never returns the current index when other tracks exist", () => {
    const list = [track({}), track({}), track({})];
    for (let i = 0; i < 50; i++) {
      const picked = pickMagicIndex(list, 0, []);
      expect(picked).not.toBe(0);
    }
  });
  it("penalizes recently played tracks", () => {
    const list = [track({ id: "cur" }), track({ id: "hot", title: "Blinding Lights", artist: "The Weeknd" }), track({ id: "cold", title: "Blinding Lights", artist: "The Weeknd" })];
    // With "hot" recently played, it should get a severe weight penalty; over runs
    // it must rarely be picked relative to an identical-weight sibling.
    let hot = 0;
    let cold = 0;
    for (let i = 0; i < 200; i++) {
      const p = pickMagicIndex(list, 0, ["hot"]);
      if (p === 1) hot++;
      if (p === 2) cold++;
    }
    expect(cold).toBeGreaterThan(hot);
  });
});