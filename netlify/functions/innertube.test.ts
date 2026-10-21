import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../innertube/resolve", () => ({
  resolveInnertube: vi.fn(),
}));
vi.mock("../innertube/search", () => ({
  searchInnertube: vi.fn(),
}));

import innertubeHandler from "./innertube";
import { resolveInnertube } from "../innertube/resolve";
import { searchInnertube } from "../innertube/search";

const resolveMock = vi.mocked(resolveInnertube);
const searchMock = vi.mocked(searchInnertube);

const okAudio = { ok: true, url: "https://cdn.example/a?expire=1", expireAt: Date.now() + 3_600_000, durationSeconds: 214 } as any;
const failResult = { ok: false, status: 404, error: "not found" } as any;

describe("Netlify function · innertube dispatcher", () => {
  beforeEach(() => {
    resolveMock.mockReset();
    searchMock.mockReset();
  });

  it("kind=audio resolves an audio stream and mirrors status/headers", async () => {
    resolveMock.mockResolvedValue(okAudio);
    const res = await innertubeHandler(new Request("https://x/.netlify/functions/innertube?id=abc&kind=audio"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe(okAudio.url);
    expect(resolveMock).toHaveBeenCalledWith("abc", "audio");
  });

  it("kind=video resolves a video stream", async () => {
    resolveMock.mockResolvedValue({ ok: true, url: "v", expireAt: 1, width: 1280, height: 720 } as any);
    const res = await innertubeHandler(new Request("https://x/?id=vid&kind=video"));
    expect(res.status).toBe(200);
    expect(resolveMock).toHaveBeenCalledWith("vid", "video");
  });

  it("missing/unknown kind defaults to audio", async () => {
    resolveMock.mockResolvedValue(okAudio);
    await innertubeHandler(new Request("https://x/?id=abc"));
    expect(resolveMock).toHaveBeenCalledWith("abc", "audio");
    await innertubeHandler(new Request("https://x/?id=abc&kind=bogus"));
    expect(resolveMock).toHaveBeenLastCalledWith("abc", "audio");
  });

  it("propagates the resolver's failure status (expired/403 path)", async () => {
    resolveMock.mockResolvedValue(failResult);
    const res = await innertubeHandler(new Request("https://x/?id=dead&kind=audio"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not found");
  });

  it("kind=search defaults limit to 10 and returns the search payload", async () => {
    searchMock.mockResolvedValue({ ok: true, items: [{ videoId: "v1", title: "T", author: "A" }] } as any);
    const res = await innertubeHandler(new Request("https://x/?kind=search&q=hello"));
    expect(res.status).toBe(200);
    expect(searchMock).toHaveBeenCalledWith("hello", 10);
    const body = await res.json();
    expect(body.items).toHaveLength(1);

    searchMock.mockResolvedValue({ ok: true, items: [] } as any);
    await innertubeHandler(new Request("https://x/?kind=search&q=x&limit=5"));
    expect(searchMock).toHaveBeenLastCalledWith("x", 5);
  });

  it("search failure maps its own status (offline/429 path)", async () => {
    searchMock.mockResolvedValue({ ok: false, status: 503, error: "upstream down" } as any);
    const res = await innertubeHandler(new Request("https://x/?kind=search&q=x"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("upstream down");
  });
});
