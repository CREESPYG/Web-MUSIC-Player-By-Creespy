import React from "react";
import { motion } from "framer-motion";
import { SparklesIcon } from "./UiIcons";

interface ReleaseItem {
  version: string;
  date: string;
  tag: string;
  title: string;
  highlights: {
    category: "New" | "Improved" | "Fixed";
    items: string[];
  }[];
}

const RELEASES: ReleaseItem[] = [
  {
    version: "v3.2.0",
    date: "Current Release",
    tag: "Latest",
    title: "Multi-Screen Architecture & Realtime Room Sync",
    highlights: [
      {
        category: "New",
        items: [
          "Dedicated multi-screen navigation: Player, Queue, Playlists, Rooms, History, and Settings without UI overlap",
          "Realtime Public & Private listening rooms powered by Supabase with live chat, sync tolerance, and presence",
          "Direct invite link routing (?room=<code>) with automated instant joining",
          "Public & Private playlist management system with YouTube & Spotify link importation",
          "Deduplicated Playback & Room History with 1-click restore",
        ],
      },
      {
        category: "Improved",
        items: [
          "Circular vinyl disc artwork with strict 1:1 aspect ratio, centered object-fit cover, and concentric grooves",
          "Mechanical sliding DigitFlipper timestamps and clock with smooth spring physics",
          "Centralized versioned persistence store (ripple.central_store.v3) remembering exact track position and paused state",
          "Clean desktop split-screen view with mobile-first bottom tabs and responsive drawers",
        ],
      },
      {
        category: "Fixed",
        items: [
          "Song progress jumping on browser refresh resolved via drift-corrected client clock algorithm",
          "Room auto-close grace period (5-10 min) to prevent premature disconnection on brief reloads",
          "Reduced motion accessibility preference respected across all sliding animations",
        ],
      },
    ],
  },
  {
    version: "v2.5.0",
    date: "August 2026",
    tag: "Milestone",
    title: "Universal Track Engine & Dynamic Themes",
    highlights: [
      {
        category: "New",
        items: [
          "Universal track normalization layer supporting multi-provider audio sources",
          "Live audio visualizer with circular spectrum and frequency responsive vinyl disc",
          "Customizable backdrop canvas with WebGL noise, dynamic blurs, and wallpaper video support",
        ],
      },
      {
        category: "Improved",
        items: [
          "Volume curve tuning with seamless keyboard shortcuts (M to mute, Space to play/pause)",
          "Touch target scaling for mobile devices and high DPI displays",
        ],
      },
    ],
  },
  {
    version: "v2.0.0",
    date: "July 2026",
    tag: "Foundational",
    title: "Time Studio & Focus Productivity Modes",
    highlights: [
      {
        category: "New",
        items: [
          "Integrated mechanical flip clock with world timezone & live Open-Meteo weather integration",
          "Focus Pomodoro timer with ambient rain and lo-fi presets",
        ],
      },
    ],
  },
];

export const WhatsNewView: React.FC = () => {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 md:px-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--acc0)]/20 text-[var(--acc0)]">
            <SparklesIcon size={18} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">What's New</h1>
        </div>
        <p className="mt-1 text-xs text-[var(--dim)]">
          Continuous updates, changelogs, and features shipped to CREEP CREEP
        </p>
      </div>

      {/* Release Timeline */}
      <div className="space-y-8">
        {RELEASES.map((release, rIdx) => (
          <motion.div
            key={release.version}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: rIdx * 0.05 }}
            className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-bold text-white">{release.version}</span>
                <span className="rounded-full bg-[var(--acc0)]/20 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--acc0)] border border-[var(--acc0)]/30">
                  {release.tag}
                </span>
              </div>
              <span className="text-xs text-[var(--dim)]">{release.date}</span>
            </div>

            <h3 className="mt-4 text-base font-medium text-white">{release.title}</h3>

            <div className="mt-5 space-y-4">
              {release.highlights.map((h) => (
                <div key={h.category} className="space-y-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      h.category === "New"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : h.category === "Improved"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {h.category}
                  </span>
                  <ul className="space-y-1.5 pl-2">
                    {h.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/80 leading-relaxed">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--acc0)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
