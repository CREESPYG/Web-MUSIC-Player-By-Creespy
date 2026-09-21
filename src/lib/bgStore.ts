/**
 * Persistent background media library.
 * Blobs live in the Cache Storage API (huge quota, survives reloads) with an
 * IndexedDB fallback. Only tiny metadata lives in localStorage, so 25 MB video
 * clips can't blow the quota. Every upload is kept as a history entry so the
 * user can jump between wallpapers instantly.
 */
const CACHE = "ripple-media-v2";
const DB = "ripple-media";
const STORE = "blobs";
const LIB_KEY = "ripple.bg.library.v2";
const MAX_ITEMS = 12;

export interface BgItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  at: number;
  kind: "video" | "image";
}

export interface BgLibrary {
  active: string | null;
  items: BgItem[];
}

const hasCaches = () => typeof caches !== "undefined";

export const prettyBytes = (n: number) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

export const kindOf = (mime: string, name = ""): "video" | "image" =>
  mime.startsWith("video/") || /\.(mp4|webm|ogv|mov|m4v)$/i.test(name) ? "video" : "image";

function readLib(): BgLibrary {
  try {
    const raw = JSON.parse(localStorage.getItem(LIB_KEY) || "null");
    if (raw && Array.isArray(raw.items)) return { active: raw.active ?? null, items: raw.items.slice(0, MAX_ITEMS) };
  } catch {
    /* noop */
  }
  return { active: null, items: [] };
}

function writeLib(lib: BgLibrary) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify({ active: lib.active, items: lib.items.slice(0, MAX_ITEMS) }));
  } catch {
    /* noop */
  }
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  if (hasCaches()) {
    try {
      const c = await caches.open(CACHE);
      await c.put(`/ripple/bg/${id}`, new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }));
      return;
    } catch {
      /* fall through */
    }
  }
  const db = await idb();
  if (!db) throw new Error("no storage available");
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, `bg:${id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(id: string): Promise<Blob | null> {
  if (hasCaches()) {
    try {
      const c = await caches.open(CACHE);
      const res = await c.match(`/ripple/bg/${id}`);
      if (res) return await res.blob();
    } catch {
      /* fall through */
    }
  }
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(`bg:${id}`);
      r.onsuccess = () => resolve((r.result as Blob) || null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function dropBlob(id: string): Promise<void> {
  if (hasCaches()) {
    try {
      const c = await caches.open(CACHE);
      await c.delete(`/ripple/bg/${id}`);
    } catch {
      /* noop */
    }
  }
  const db = await idb();
  if (db) {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(`bg:${id}`);
    } catch {
      /* noop */
    }
  }
}

/* ---------------- public API ---------------- */

export function getLibrary(): BgLibrary {
  return readLib();
}

/** Stores a new clip/image, makes it active, trims the oldest beyond the cap. */
export async function addBgMedia(blob: Blob, name: string): Promise<{ item: BgItem; library: BgLibrary }> {
  const lib = readLib();
  const item: BgItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || "background",
    mime: blob.type || (kindOf("", name) === "video" ? "video/mp4" : "image/jpeg"),
    size: blob.size,
    at: Date.now(),
    kind: kindOf(blob.type, name),
  };
  await putBlob(item.id, blob);

  let items = [item, ...lib.items.filter((i) => i.id !== item.id)];
  const overflow = items.slice(MAX_ITEMS);
  items = items.slice(0, MAX_ITEMS);
  const next: BgLibrary = { active: item.id, items };
  writeLib(next);
  overflow.forEach((o) => void dropBlob(o.id));
  return { item, library: next };
}

/** Object URL for one library entry (caller revokes it). */
export async function openBgItem(id: string): Promise<{ url: string; item: BgItem } | null> {
  const lib = readLib();
  const item = lib.items.find((i) => i.id === id);
  if (!item) return null;
  const blob = await getBlob(id);
  if (!blob) return null;
  return { url: URL.createObjectURL(blob), item };
}

export async function openActiveBg(): Promise<{ url: string; item: BgItem } | null> {
  const lib = readLib();
  return lib.active ? openBgItem(lib.active) : null;
}

export function setActiveBg(id: string): BgLibrary {
  const lib = readLib();
  const next = { ...lib, active: id };
  writeLib(next);
  return next;
}

export async function deleteBgItem(id: string): Promise<BgLibrary> {
  const lib = readLib();
  await dropBlob(id);
  const items = lib.items.filter((i) => i.id !== id);
  const next: BgLibrary = { items, active: lib.active === id ? items[0]?.id ?? null : lib.active };
  writeLib(next);
  return next;
}

export async function clearBgMedia(): Promise<BgLibrary> {
  const lib = readLib();
  await Promise.all(lib.items.map((i) => dropBlob(i.id)));
  const next: BgLibrary = { items: [], active: null };
  writeLib(next);
  return next;
}
