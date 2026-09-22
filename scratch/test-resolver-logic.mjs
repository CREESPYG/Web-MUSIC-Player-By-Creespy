// Pure-logic sanity check for Phase 7 Playable Source Resolver matching.
// Mirrors the pure helpers in src/lib/resolver.ts (no browser/web imports).

const VERSION_MARKERS = [
  "remix", "live", "acoustic", "extended", "radio edit", "instrumental",
  "remastered", "original mix", "sped up", "slowed", "cover", "edit",
];

function versionMarkersOf(title) {
  const t = String(title || "").toLowerCase();
  return VERSION_MARKERS.filter((m) => t.includes(m));
}

function stripVersion(title) {
  let out = String(title || "");
  for (const m of VERSION_MARKERS) {
    out = out
      .replace(new RegExp(`\\s*[\\[\\(]\\s*${m.replace(/ /g, "\\s*")}\\s*[\\]\\)]`, "gi"), " ")
      .replace(new RegExp(`\\b${m}\\b`, "gi"), " ");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const STOP = new Set([
  "the", "and", "feat", "ft", "prod", "remix", "version", "original", "audio",
  "official", "video", "lyrics", "with", "edit", "mix", "extended", "club", "radio", "music",
]);

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

function tokenCover(needle, candidate) {
  const n = tokens(needle);
  if (!n.length) return 1;
  const cand = new Set(tokens(candidate));
  let hit = 0;
  for (const t of n) if (cand.has(t)) hit++;
  return hit / n.length;
}

function durationMatches(queryDuration, candDuration) {
  if (typeof queryDuration !== "number" || queryDuration <= 0) return null;
  if (typeof candDuration !== "number" || candDuration <= 0) return null;
  if (candDuration > queryDuration * 3 || candDuration < queryDuration * 0.33) return false;
  if (candDuration >= queryDuration * 0.85 && candDuration <= queryDuration * 1.2) return true;
  return null;
}

function grade(titleCover, artistHit, dur, versionOk) {
  if (titleCover >= 0.75 && artistHit && versionOk) {
    if (dur === true && titleCover >= 0.9) return "EXACT";
    return "HIGH";
  }
  if (titleCover >= 0.6 && artistHit && versionOk) return "MEDIUM";
  return "LOW";
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

console.log("== version preservation ==");
check("versionMarkersOf('Tum Hi Ho (Sped Up)')", versionMarkersOf("Tum Hi Ho (Sped Up)"), ["sped up"]);
check("versionMarkersOf('Radioactive (Remastered)')", versionMarkersOf("Radioactive (Remastered)"), ["remastered"]);
check("versionMarkersOf('Plain Song')", versionMarkersOf("Plain Song"), []);
check("stripVersion preserves base title", stripVersion("Tum Hi Ho (Sped Up)"), "Tum Hi Ho");
check("stripVersion handles Angrezi Beet Remix", stripVersion("Angrezi Beet Remix"), "Angrezi Beet");
check("stripVersion no-op on plain", stripVersion("Tera Ban Jaunga"), "Tera Ban Jaunga");

console.log("== tokenCover ==");
check("same title → 1", tokenCover("Tum Hi Ho", "Tum Hi Ho Official Video"), 1);
check("unrelated → 0", tokenCover("Shape of You", "Despacito"), 0);
check("partial → 0.5", tokenCover("Tum Hi Ho", "Tum hi kaho"), 0.5);

console.log("== durationMatches ==");
check("same length → true", durationMatches(220, 225), true);
check("live 3x → false", durationMatches(220, 900), false);
check("unknown query → null", durationMatches(undefined, 900), null);
check("haircut <0.33 → false", durationMatches(220, 40), false);

console.log("== grade ==");
check("EXACT: strong title+artist+dur", grade(1.0, true, true, true), "EXACT");
check("HIGH: strong title+artist, dur null", grade(0.95, true, null, true), "HIGH");
check("MEDIUM: 0.6 title, artist hit", grade(0.65, true, null, true), "MEDIUM");
check("LOW: strong title but artist miss", grade(0.95, false, true, true), "LOW");
check("LOW: version mismatch", grade(0.95, true, true, false), "LOW");
check("LOW: weak title", grade(0.4, true, null, true), "LOW");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);