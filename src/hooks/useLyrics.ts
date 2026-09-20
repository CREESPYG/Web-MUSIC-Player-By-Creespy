import { useEffect, useState, useMemo } from "react";
import { fetchLyrics, getActiveLyricIndex, type LyricsData } from "../lib/lrclib";
import type { Track } from "../data/tracks";

export interface LyricsState {
  data: LyricsData | null;
  loading: boolean;
  error: string | null;
  activeIndex: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  reload: (customQuery?: string) => Promise<void>;
}

export function useLyrics(track: Track | undefined, currentTime: number, duration: number): LyricsState {
  const [data, setData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const trackId = track?.id || track?.videoId || "";
  const trackTitle = track?.title || "";
  const trackArtist = track?.artist || "";

  // Reset query on track change
  useEffect(() => {
    setSearchQuery("");
  }, [trackId]);

  const load = async (customQuery?: string) => {
    if (!trackTitle) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result: LyricsData | null = null;
      if (customQuery && customQuery.trim()) {
        result = await fetchLyrics(customQuery.trim(), "", duration);
      } else {
        result = await fetchLyrics(trackTitle, trackArtist, duration);
      }

      setData(result);
      if (!result) {
        setError("No lyrics found for this track on LRCLIB");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load lyrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [trackId, trackTitle, trackArtist]);

  // Compute active lyric line
  const activeIndex = useMemo(() => {
    if (!data || !data.isSynced || !data.lines || data.lines.length === 0) return -1;
    return getActiveLyricIndex(data.lines, currentTime);
  }, [data, currentTime]);

  return {
    data,
    loading,
    error,
    activeIndex,
    searchQuery,
    setSearchQuery,
    reload: load,
  };
}
