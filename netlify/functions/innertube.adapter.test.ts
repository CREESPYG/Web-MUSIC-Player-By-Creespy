import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./innertube", () => ({ default: vi.fn() }));

import handler from "../../api/innertube";
import innertubeHandler from "./innertube";

const dispatcher = vi.mocked(innertubeHandler);

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer | null;
  status(code: number): MockRes;
  setHeader(name: string, value: string): void;
  end(body: Buffer): void;
}

function mockRes(): MockRes {
  const r: MockRes = {
    statusCode: 0,
    headers: {},
    body: null,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    setHeader(name, value) {
      r.headers[name.toLowerCase()] = value;
    },
    end(body) {
      r.body = body;
    },
  };
  return r;
}

describe("Vercel function · /api/innertube adapter", () => {
  // NOTE: must be a block body — `() => mockReset()` would return the mock
// (chainable), which vitest 5 then invokes as a cleanup "function" during the
// afterEach-cleanup pass, re-running a throwing mock implementation outside
// the test body and failing the test.
beforeEach(() => {
  dispatcher.mockReset();
});

  it("forwards the incoming URL (path + query) to the shared dispatcher", async () => {
    dispatcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      })
    );
    const res = mockRes();
    await handler(
      { url: "/api/innertube?kind=search&q=hello&limit=6", method: "GET", headers: { host: "example.com" } },
      res
    );
    const forwarded = dispatcher.mock.calls[0][0] as Request;
    expect(forwarded.method).toBe("GET");
    expect(new URL(forwarded.url).pathname).toBe("/api/innertube");
    expect(new URL(forwarded.url).searchParams.get("kind")).toBe("search");
    expect(new URL(forwarded.url).searchParams.get("q")).toBe("hello");
    expect(new URL(forwarded.url).host).toBe("example.com");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body!.toString()).ok).toBe(true);
  });

  it("maps the dispatcher's failure status and body verbatim", async () => {
    dispatcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, status: 429, error: "slow down" }), { status: 429 })
    );
    const res = mockRes();
    await handler({ url: "/api/innertube?id=abc&kind=audio", headers: {} }, res);
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body!.toString());
    expect(body.ok).toBe(false);
    expect(body.error).toBe("slow down");
    // missing host must not crash — falls back to localhost
    expect(new URL((dispatcher.mock.calls[0][0] as Request).url).host).toBe("localhost");
  });

  it("defaults the method to GET when Vercel omits it", async () => {
    dispatcher.mockResolvedValue(new Response("{}", { status: 200 }));
    await handler({ url: "/api/innertube?id=x", method: undefined, headers: { host: "h" } }, mockRes());
    expect((dispatcher.mock.calls[0][0] as Request).method).toBe("GET");
  });

  it("serializes dispatcher crashes as JSON 500 instead of throwing", async () => {
    dispatcher.mockImplementation(() => {
      throw new TypeError("Request is not defined");
    });
    const res = mockRes();
    await handler({ url: "/api/innertube?kind=search&q=x", headers: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.headers["content-type"]).toContain("application/json");
    const body = JSON.parse(res.body!.toString());
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Request is not defined");
  });
});
