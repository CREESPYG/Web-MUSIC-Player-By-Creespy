const tryFetch = async (url) => {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
};

const bases = ["https://invidious.f5.si", "https://yewtu.be"];
const queries = [
  "lofi playlist", "90s hits", "bollywood songs", "best of pop",
  "rock classics", "party songs", "chill music", "hip hop playlist",
  "edm mix", "retro songs"
];
const candidates = [];
for (const base of bases) {
  for (const qq of queries) {
    const q = await tryFetch(`${base}/api/v1/search?q=${encodeURIComponent(qq)}&type=playlist`);
    for (const r of q || []) {
      if (r?.type === "playlist" && r?.playlistId?.startsWith("PL") && !candidates.includes(r.playlistId)) {
        candidates.push(r.playlistId);
      }
    }
    if (candidates.length >= 12) break;
  }
  if (candidates.length >= 12) break;
}
console.log("PL candidates:", candidates.length);

let verified = null;
for (const id of candidates) {
  const j = await tryFetch(`${bases[0]}/api/v1/playlists/${id}?page=1`);
  const vc = j?.videoCount ?? 0;
  if (vc > 100) { verified = { id, vc, title: j.title }; break; }
}
if (!verified) {
  console.log("No >100 playlist found among candidates — sanity limited.");
} else {
  console.log(`\nENUMERATING "${verified.title}" videoCount=${verified.vc} id=${verified.id}`);
  const out = new Set();
  let pages = 0;
  for (let page = 1; page <= 40; page++) {
    const j = await tryFetch(`${bases[0]}/api/v1/playlists/${verified.id}?page=${page}`);
    if (!j) { console.log(`page=${page}: FAIL break`); break; }
    let added = 0;
    for (const v of j.videos || []) { if (v?.videoId && v.videoId.length === 11 && !out.has(v.videoId)) { out.add(v.videoId); added++; } }
    pages++;
    if (added === 0) break;
  }
  const match = out.size === verified.vc;
  console.log(`RESULT: totalSeen=${out.size} vs videoCount=${verified.vc} pages=${pages} => ${match ? "PASS (full playback, no caps)" : "DIFFERS"}`);
}