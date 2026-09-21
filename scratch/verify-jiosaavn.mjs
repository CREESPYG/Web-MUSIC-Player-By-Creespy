const BASE = "http://localhost:5173/api/jiosaavn/api.php";

function parseJioSaavnUrl(input) {
  const url = new URL(input.startsWith("http") ? input : `https://${input}`);
  const segs = url.pathname.split("/").filter(Boolean);
  if (!segs.length) return null;
  const token = decodeURIComponent(segs[segs.length - 1]);
  let kindHint = null;
  const first = segs[0];
  if (first === "song") kindHint = "song";
  else if (first === "album") kindHint = "album";
  else if (["featured", "mixtape", "playlist"].includes(first)) kindHint = "playlist";
  return { token, kindHint };
}

async function webapiGet(token, type, page, n) {
  const res = await fetch(
    `${BASE}?__call=webapi.get&token=${encodeURIComponent(token)}&type=${type}&p=${page}&n=${n}&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0`
  );
  return res.ok ? res.json() : null;
}

function itemFromSongObj(o) {
  const subtitle = String(o?.subtitle || "");
  const parts = subtitle.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  const artistField = parts[0] || o?.more_info?.artists || o?.more_info?.singers || "";
  return {
    title: String(o?.title || o?.song || "Untitled").trim(),
    artist: String(artistField).split(",")[0]?.trim() || "JioSaavn Artist",
    album: (parts[1] || o?.more_info?.album || undefined) ? String(parts[1] || o?.more_info?.album).trim() : undefined,
    image: o?.image?.replace(/150x150\.jpg$/, "500x500.jpg"),
    duration: typeof o?.more_info?.duration === "number" ? o.more_info.duration : undefined,
  };
}

async function load(url) {
  const parsed = parseJioSaavnUrl(url);
  const candidates = parsed.kindHint
    ? [parsed.kindHint, ...["song", "album", "playlist"].filter((t) => t !== parsed.kindHint)]
    : ["song", "album", "playlist"];
  let kind = null, probed = null;
  for (const t of candidates) {
    const probe = await webapiGet(parsed.token, t, 1, 1);
    if (probe && (Array.isArray(probe.songs) || Array.isArray(probe.list))) {
      const firstItem = probe.list?.[0] || probe.songs?.[0];
      const isTrailer = firstItem && /sample\s+trailer/i.test(String(firstItem.title || ""));
      if (isTrailer) continue;
      kind = t; probed = probe; break;
    }
  }
  if (!kind) return { error: "not resolvable" };

  const items = [];
  const seen = new Set();
  if (kind === "song") {
    for (const s of probed.songs ?? []) items.push(itemFromSongObj(s));
  } else {
    for (let page = 1; page <= 200; page++) {
      const pageData = page === 1 ? await webapiGet(parsed.token, kind, page, 100) : await webapiGet(parsed.token, kind, page, 100);
      if (!pageData) break;
      const list = Array.isArray(pageData.list) ? pageData.list : [];
      let added = 0;
      for (const o of list) {
        const perma = String(o?.perma_url || "");
        if (perma) { if (seen.has(perma)) continue; seen.add(perma); }
        items.push(itemFromSongObj(o)); added++;
      }
      if (!list.length || added < 100) break;
    }
  }
  return { kind, title: kind === "song" ? items[0]?.title : probed?.title || kind, count: items.length, sample: items.slice(0, 3) };
}

const urls = [
  "https://www.jiosaavn.com/song/kesariya/AgIAQyBeWlI",
  "https://www.jiosaavn.com/album/brahmastra/xq4v9ZFC9iA_",
  "https://www.jiosaavn.com/featured/bollywood-bappa/B6QQ8fKsUOQ_",
  "https://www.jiosaavn.com/song/does-not-exist/ZZZZZZZZ",
];

for (const u of urls) {
  const r = await load(u);
  console.log("\n", u);
  console.log(r.error || `kind=${r.kind} title="${r.title}" count=${r.count}`);
  if (!r.error) for (const s of r.sample) console.log(`  - ${s.title} | ${s.artist} | ${s.album} | ${s.duration}s`);
}