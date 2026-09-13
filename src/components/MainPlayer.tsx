import type { Track } from "../lib/trackModel";
import type { Theme } from "../themes";
import type { PlayerApi } from "../hooks/usePlayer";
import type { WeatherNow } from "../lib/weather";
import type { Peer } from "../hooks/usePresence";
import { DiscStage } from "./DiscStage";
import { Controls } from "./Controls";
import { ClockCard } from "./Clock";

interface MainPlayerProps {
  track: Track;
  player: PlayerApi;
  theme: Theme;
  weather: WeatherNow | null;
  weatherBusy: boolean;
  weatherUnit: "c" | "f";
  clock24: boolean;
  showSeconds: boolean;
  onRefreshWeather: () => void;
  onOpenTimeStudio: () => void;
  onlineCount: number;
  peers: Peer[];
  liked: boolean;
  onToggleLike: () => void;
  roomLocked?: boolean;
}

export function MainPlayer({
  track,
  player,
  theme,
  weather,
  weatherBusy,
  weatherUnit,
  clock24,
  showSeconds,
  onRefreshWeather,
  onOpenTimeStudio,
  liked,
  onToggleLike,
  roomLocked,
}: MainPlayerProps) {
  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col items-center gap-4 pb-24">
      {/* Top Mini Clock & Weather Card */}
      <div className="w-full">
        <ClockCard
          weather={weather}
          loading={weatherBusy}
          unit={weatherUnit}
          clock24={clock24}
          showSeconds={showSeconds}
          onRefresh={onRefreshWeather}
          onExpand={onOpenTimeStudio}
        />
      </div>

      {/* Main Vinyl Disc Stage */}
      <div className="w-full my-auto py-2">
        <DiscStage
          track={track}
          playing={player.playing}
          buffering={player.buffering}
          ready={player.ready}
          time={player.time}
          duration={player.duration}
          buffered={player.buffered}
          liked={liked}
          onLike={onToggleLike}
          theme={theme}
        />
      </div>

      {/* Main Audio Controls */}
      <div className="w-full">
        <Controls player={player} locked={roomLocked} />
      </div>
    </div>
  );
}
