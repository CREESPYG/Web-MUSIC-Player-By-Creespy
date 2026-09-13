import React from "react";
import {
  InfoIcon,
  BoltIcon,
  DiscIcon,
  RadioTowerIcon,
  SparklesIcon,
} from "./UiIcons";

export const AboutView: React.FC = () => {
  const shortcuts = [
    { key: "Space", desc: "Play or Pause current track" },
    { key: "J / ←", desc: "Rewind 5 seconds" },
    { key: "L / →", desc: "Fast forward 5 seconds" },
    { key: "K", desc: "Toggle Play / Pause" },
    { key: "N / Shift+→", desc: "Skip to next track" },
    { key: "P / Shift+←", desc: "Go to previous track" },
    { key: "M", desc: "Toggle Mute" },
    { key: "S", desc: "Cycle Shuffle mode (Off / Random / Magic)" },
    { key: "R", desc: "Cycle Repeat mode (Off / All / One)" },
    { key: "⌘K / /", desc: "Global Quick Search modal" },
  ];

  const techStack = [
    { name: "React 18 & TypeScript", role: "Component system & strict static types" },
    { name: "Supabase Realtime", role: "WebSocket room broadcasting, presence & sync" },
    { name: "Framer Motion", role: "Spring physics, mechanical flipper & transitions" },
    { name: "Tailwind CSS & Vanilla CSS", role: "Calibrated glassmorphic design tokens" },
    { name: "HTML5 Canvas API", role: "Real-time frequency visualizer & dynamic backdrop" },
    { name: "Open-Meteo API", role: "Live local weather & timezone telemetry" },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 md:px-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--acc0)]/20 text-[var(--acc0)]">
            <InfoIcon size={18} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">About CREEP CREEP Player</h1>
        </div>
        <p className="mt-1 text-xs text-[var(--dim)]">
          Minimalist, high-performance web music player with synchronized listening rooms
        </p>
      </div>

      {/* Philosophy Section */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <DiscIcon size={18} className="text-[var(--acc0)]" />
          The Philosophy Behind CREEP CREEP
        </h2>
        <blockquote className="mt-3 border-l-2 border-[var(--acc0)] pl-4 italic text-sm text-white/90 leading-relaxed">
          “A calm, distraction-free music player that happens to have powerful realtime collaborative rooms and playlist management — not a bloated dashboard containing a tiny player.”
        </blockquote>
        <p className="mt-4 text-xs text-[var(--dim)] leading-relaxed">
          CREEP CREEP was designed from the ground up to strip away visual noise, oversized marketing widgets, and heavy clutter. It provides an intimate listening experience with tactile mechanical animations, instant search, and drift-corrected synchronous rooms so friends can listen together anywhere in the world.
        </p>
      </div>

      {/* Keyboard Shortcuts Matrix */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          <BoltIcon size={18} className="text-[var(--acc0)]" />
          Keyboard Shortcuts Matrix
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-3.5 py-2.5"
            >
              <span className="text-xs text-[var(--dim)]">{sc.desc}</span>
              <kbd className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-white shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack & Architecture */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          <SparklesIcon size={18} className="text-[var(--acc0)]" />
          Technology Stack & Engine
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {techStack.map((tech) => (
            <div key={tech.name} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="text-xs font-semibold text-white">{tech.name}</div>
              <div className="text-[11px] text-[var(--dim)] mt-0.5">{tech.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* State & Privacy Statement */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-2">
          <RadioTowerIcon size={18} className="text-[var(--acc0)]" />
          Persistence & Privacy
        </h2>
        <p className="text-xs text-[var(--dim)] leading-relaxed">
          Your playback position, customized playlists, theme selections, and volume levels are safely persisted locally in your browser under schema versioning (<code className="font-mono text-[11px] text-white">v3</code>). No personal data or listening history is monetized or shared without your explicit room actions.
        </p>
      </div>

      {/* Footer / Credits */}
      <div className="text-center text-xs text-[var(--dim)] pt-4 pb-8">
        <p className="flex items-center justify-center gap-1">
          Crafted with precision & care for audio enthusiasts.
        </p>
        <p className="mt-1 text-[11px] font-mono text-[var(--dim)]/60">
          CREEP CREEP Music Player By CREESPY • v3.2.0
        </p>
      </div>
    </div>
  );
};
