export interface BackgroundAudioPlugin {
  startService(): Promise<{ started: boolean }>;
  stopService(): Promise<void>;
  updateMetadata(opts: { title: string; artist: string; album: string; artworkUrl?: string }): Promise<void>;
  updatePlaybackState(opts: { state: "playing" | "paused" }): Promise<void>;
  setSleepTimer(opts: { seconds: number }): Promise<void>;
  cancelSleepTimer(): Promise<void>;
  isRunning(): Promise<{ running: boolean }>;
  addListener(event: "mediaCommand", handler: (data: { command: string }) => void): { remove(): void };
}

const noop = async () => {};

/**
 * Web-safe BackgroundAudio stub.
 * In the pure web player, Media Session API handles playback controls and metadata.
 */
const BackgroundAudio: BackgroundAudioPlugin = {
  startService: async () => ({ started: false }),
  stopService: noop,
  updateMetadata: noop,
  updatePlaybackState: noop,
  setSleepTimer: noop,
  cancelSleepTimer: noop,
  isRunning: async () => ({ running: false }),
  addListener: () => ({ remove: () => {} }),
};

export default BackgroundAudio;
