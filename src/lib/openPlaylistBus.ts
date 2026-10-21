/**
 * Cross-screen "open this playlist" bus.
 *
 * The Search section (and any other entry point) can request navigation to a
 * specific playlist without knowing which screen is currently mounted.
 * LibraryScreen, MobilePlaylistScreen and PlaylistsView subscribe and route
 * by playlist id (local, pinned or global). Requests fired before any screen
 * subscribes are buffered and delivered on the first subscription.
 */

type OpenPlaylistHandler = (playlistId: string) => void;

const handlers = new Set<OpenPlaylistHandler>();
let pending: string | null = null;

export function subscribeOpenPlaylist(fn: OpenPlaylistHandler): () => void {
  handlers.add(fn);
  if (pending !== null) {
    const id = pending;
    pending = null;
    window.setTimeout(() => {
      if (handlers.has(fn)) {
        try {
          fn(id);
        } catch {
          /* noop */
        }
      }
    }, 0);
  }
  return () => {
    handlers.delete(fn);
  };
}

export function requestOpenPlaylist(playlistId: string): boolean {
  if (!handlers.size) {
    pending = playlistId;
    return false;
  }
  handlers.forEach((fn) => {
    try {
      fn(playlistId);
    } catch {
      /* keep notifying the rest */
    }
  });
  return true;
}
