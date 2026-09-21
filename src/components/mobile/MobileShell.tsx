import { useMobileNavigation } from "../../hooks/useMobileNavigation";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import type { Track } from "../../lib/trackModel";
import type { Theme } from "../../themes";
import type { Settings } from "../../hooks/useSettings";
import type { PlayerApi } from "../Controls";
import type { RoomApi } from "../../hooks/useRoom";
import type { WeatherNow } from "../../lib/weather";

import { MobileHeader } from "./MobileHeader";
import { MobileMiniPlayer } from "./MobileMiniPlayer";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { MobileBackGuardModal } from "./MobileBackGuardModal";

import { MobilePlayerScreen } from "./screens/MobilePlayerScreen";
import { MobilePlaylistScreen } from "./screens/MobilePlaylistScreen";
import { MobileRoomScreen } from "./screens/MobileRoomScreen";
import { MobileQueueScreen } from "./screens/MobileQueueScreen";
import { MobileClockScreen } from "./screens/MobileClockScreen";
import { MobileCustomizeScreen } from "./screens/MobileCustomizeScreen";

interface Props {
  track: Track | undefined;
  tracks: Track[];
  player: PlayerApi;
  liked: Set<string>;
  onLike: () => void;
  onLikeTrack: (track: Track) => void;
  theme: Theme;
  settings: Settings;
  update: <K extends keyof Settings>(key: K, val: Settings[K]) => void;
  reset: () => void;
  onTheme: (id: string) => void;
  room: RoomApi;
  weather: WeatherNow | null;
  wLoading: boolean;
  onRefreshWeather: () => void;
  onAddTrack: (url: string) => void;
  onPlayEntirePlaylist?: (tracks: Track[]) => void;
  onAddPlaylistToQueue?: (tracks: Track[]) => void;
  onRemoveTrack: (idx: number) => void;
  onReorderTrack: (from: number, to: number) => void;
  onFindSimilar: () => void;
  similarBusy: boolean;
  onFile: (file: File) => void;
  uploadBusy: boolean;
  maxUpload: number;
  onToast: (msg: string) => void;
  library: any;
  onUseItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onClearMedia: () => void;
  onSeek?: (pos: number) => void;
}

export function MobileShell({
  track,
  tracks,
  player,
  liked,
  onLike,
  onLikeTrack,
  theme,
  settings,
  update,
  reset,
  onTheme,
  room,
  weather,
  wLoading,
  onRefreshWeather,
  onAddTrack,
  onPlayEntirePlaylist,
  onAddPlaylistToQueue,
  onRemoveTrack,
  onReorderTrack,
  onFindSimilar,
  similarBusy,
  onFile,
  uploadBusy,
  maxUpload,
  onToast,
  library,
  onUseItem,
  onDeleteItem,
  onClearMedia,
  onSeek,
}: Props) {
  const {
    activeTab,
    setActiveTab,
    moreOpen,
    setMoreOpen,
    showExitModal,
    confirmExit,
    cancelExit,
  } = useMobileNavigation(true);

  const { canInstall, promptInstall, isFullscreen, toggleFullscreen } = usePwaInstall();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent">
      {/* 1. Mobile Header */}
      <MobileHeader
        activeTab={activeTab}
        onBack={() => setActiveTab("player")}
        inRoom={room.inRoom}
        roomConnected={room.connection === "connected"}
        canInstall={canInstall}
        onInstall={promptInstall}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onOpenCustomize={() => setActiveTab("customization")}
      />

      {/* 2. Middle Scrollable Screen Area */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {activeTab === "player" && (
          <MobilePlayerScreen
            track={track}
            player={player}
            liked={liked.has(track?.id ?? "")}
            onLike={onLike}
            theme={theme}
            onOpenQueue={() => setActiveTab("queue")}
            onToast={onToast}
            onSeek={onSeek}
          />
        )}

        {activeTab === "playlist" && (
          <MobilePlaylistScreen
            currentTrackId={track?.id}
            onPlayTrack={(t) => {
              const idx = tracks.findIndex((x) => x.id === t.id);
              if (idx !== -1) {
                player.select(idx);
              } else {
                onAddTrack(t.videoId ? `https://www.youtube.com/watch?v=${t.videoId}` : t.title);
              }
            }}
            onAddToQueue={(t) => {
              onAddTrack(t.videoId ? `https://www.youtube.com/watch?v=${t.videoId}` : t.title);
              onToast(`Added "${t.title.slice(0, 20)}…" to Queue`);
            }}
            onPlayEntirePlaylist={onPlayEntirePlaylist}
            onAddPlaylistToQueue={onAddPlaylistToQueue}
            likedTrackIds={liked}
            onToggleLike={onLikeTrack}
            onToast={onToast}
          />
        )}

        {activeTab === "room" && (
          <MobileRoomScreen room={room} onToast={onToast} />
        )}

        {activeTab === "queue" && (
          <MobileQueueScreen
            tracks={tracks}
            player={player}
            onAdd={onAddTrack}
            onRemove={onRemoveTrack}
            onReorder={onReorderTrack}
            onFindSimilar={onFindSimilar}
            similarBusy={similarBusy}
            onToast={onToast}
          />
        )}

        {activeTab === "clock" && (
          <MobileClockScreen
            weather={weather}
            wLoading={wLoading}
            onRefreshWeather={onRefreshWeather}
            player={player}
            onToast={onToast}
            showSeconds={settings.showSeconds}
            clock24={settings.clock24}
          />
        )}

        {activeTab === "customization" && (
          <MobileCustomizeScreen
            settings={settings}
            update={update}
            reset={reset}
            theme={theme}
            onTheme={onTheme}
            onFile={onFile}
            uploadBusy={uploadBusy}
            maxUpload={maxUpload}
            onToast={onToast}
            library={library}
            onUseItem={onUseItem}
            onDeleteItem={onDeleteItem}
            onClearMedia={onClearMedia}
          />
        )}
      </main>

      {/* 3. Lower Dock Area */}
      <div className="relative z-30 shrink-0">
        {activeTab !== "player" && (
          <MobileMiniPlayer
            track={track}
            player={player}
            liked={liked.has(track?.id ?? "")}
            onLike={onLike}
            onOpenPlayer={() => setActiveTab("player")}
          />
        )}
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenMore={() => setMoreOpen(true)}
          moreOpen={moreOpen}
          inRoom={room.inRoom}
          queueCount={tracks.length}
        />
      </div>

      {/* 4. More Sheet */}
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        inRoom={room.inRoom}
        chatCount={room.chat.length}
        memberCount={room.online}
      />

      {/* 5. Back Guard Modal */}
      <MobileBackGuardModal
        open={showExitModal}
        onStay={cancelExit}
        onExit={confirmExit}
      />
    </div>
  );
}
