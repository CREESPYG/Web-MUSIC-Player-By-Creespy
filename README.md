<div align="center">

# 🎵 CREEP CREEP — Animated Glassmorphism Music Player

### A Premium Immersive YouTube Music Player with Music-Synced Visuals, Real-Time Rooms & Live Weather

Built by **CREESPY** · React + Vite + TailwindCSS + Supabase Realtime

---

![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-38B2AC?style=flat-square&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?style=flat-square&logo=supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-Private-red?style=flat-square)

</div>

---

## ✨ Overview

**CREEP CREEP** is a full-featured, glassmorphism-styled music player that streams YouTube audio with stunning music-reactive visuals. It features real-time collaborative listening rooms, a live weather dashboard, customizable themes, Spotify playlist import, and an elegant dark-mode interface with water-drop click effects, floating particles, and beat-synchronized animations.

---

## 🎯 Features

### 🎶 Music Player Core
- **YouTube Audio Streaming** — Streams any YouTube video as audio via the IFrame API
- **Queue Management** — Add tracks via YouTube URL (single videos & full playlists), drag-to-reorder, remove tracks
- **Playback Controls** — Play/Pause, Next, Previous, Seek (scrub bar), Volume slider with mute toggle
- **Playback Speed** — Cycle through 1×, 1.25×, 1.5×, 0.75× speeds
- **Repeat Modes** — Off, Repeat All, Repeat One
- **Shuffle Modes** — Off, Random, Magic Shuffle (AI-powered similar track discovery)
- **Magic Shuffle** — Automatically discovers and queues similar tracks using YouTube's recommendation engine, so playback never runs out
- **Media Session Integration** — Lock screen / notification controls on mobile and desktop (play, pause, next, previous, seek)
- **iOS Background Audio** — Silent audio keepalive ensures playback continues when the screen is locked
- **Resume Playback** — Automatically restores last played track and position on page load
- **Track Duration Cache** — Remembers durations across sessions for instant display

### 🎨 Visual Experience
- **Music-Reactive Background Canvas** — Full-viewport backdrop with:
  - 4 floating orbs that pulse with bass and beat
  - Dual waveform ribbons synchronized to tempo
  - 24 drifting particles that react to audio levels
  - Radial vignette for cinematic depth
- **Background Styles** — Switch between Dynamic (orbs + ribbons + particles), Wave (ribbons only), Solid (clean gradient), or Media (custom wallpaper)
- **Vinyl Disc Stage** — Spinning album art disc with:
  - Circular 48-bar spectrum visualizer
  - Concentric vinyl grooves overlay
  - Light reflection effects
  - Center brass spindle ring
  - Circular progress ring with buffering indicator
- **Water-Drop Ripple Effects** — Click anywhere for expanding rings + gravity-affected crown droplets
- **Cursor Glow** — Soft ambient light that trails the cursor with theme-colored radial gradient
- **Glassmorphism UI** — Frosted glass surfaces with dynamic blur, subtle borders, and inner highlights throughout the entire interface

### 🎭 Themes
- **Abyss** — Deep-sea neon (cyan/blue/mint)
- **Ember** — Molten late-night (amber/red/gold)
- **Verdant** — Bioluminescent grove (lime/green/mint)
- **Orchid** — Electric bloom (pink/purple/rose)

### ⏰ Clock & Weather Dashboard
- **Live Digital Clock** — Animated digit flipper with 12h/24h format and optional seconds
- **Compact Clock Card** — Time + weather at a glance in the sidebar
- **Full-Screen Clock View** — Massive display with complete weather dashboard
- **Live Weather** — Powered by Open-Meteo API:
  - Current temperature, feels-like, weather condition
  - Humidity, wind speed, daily hi/lo
  - 3-day forecast with weather icons
  - GPS, IP geolocation, or pinned city location
  - Auto-refresh every 90 seconds
- **Weather Icons** — Custom SVG icons for all WMO weather codes (clear, clouds, rain, snow, fog, thunderstorm, etc.)

### 🏠 Real-Time Rooms (Supabase Realtime)
- **Create or Join Rooms** — Host creates a room, others join via invite link/code
- **Synchronized Playback** — All room members hear the same track at the same position with drift correction
- **Room Types** — Public (anyone can join) or Private (invite-only)
- **Host Controls** — Host can manage permissions:
  - Play/Pause, Next, Previous, Seek, Add Songs, Shuffle
  - Toggle shared vs host-only control
  - Approve/deny join requests
- **Live Chat** — Real-time chat with message history and auto-scroll
- **Member List** — See who's in the room with online status
- **Nicknames** — Set display names for room participants

### 📋 Playlists Hub
- **Create Custom Playlists** — Name, description, and track management
- **Import YouTube Playlists** — Paste any YouTube playlist URL to import all tracks with album art
- **Import Spotify Playlists** — Paste Spotify playlist/album URLs; tracks are matched to YouTube automatically
- **Public Playlists** — Publish playlists to a global directory; browse and like others' playlists
- **Playlist Actions** — Play entire playlist, add all to queue, search within tracks
- **Real-Time Sync** — Public playlists update across devices via Supabase Realtime

### ❤️ Favorites & Persistence
- **Like Tracks** — Heart button with burst animation; liked tracks saved to local storage
- **Persistent Queue** — Custom tracks saved and restored across sessions
- **Settings Persistence** — All preferences stored in `localStorage`
- **Export/Import** — Export full setup (settings + queue) as JSON; import to restore

### 🎛️ Customization Panel
- **Background Style** — Dynamic / Wave / Solid / Media
- **Custom Wallpaper** — Upload images or videos (up to 100 MB) stored in IndexedDB
- **Wallpaper Library** — Save multiple wallpapers, quick-switch via bottom badges
- **Background Controls** — Blur radius, dim opacity sliders
- **Glass Tuning** — Border width, tile opacity, tile corner radius
- **FX Intensity** — Control visual effects strength
- **Click Effects** — Toggle water-drop ripples on/off
- **Clock Settings** — 12h/24h format, show/hide seconds, °C/°F temperature
- **Pin Weather Location** — Search and pin any city for weather
- **Export Setup** — Download all settings as JSON

### 🔎 Search
- **Search Modal** — Quick search across all tracks in queue
- **Filter by title, artist, or album**

### 👥 Live Presence
- **Global Listener Count** — Real-time count of all connected users via Supabase Presence
- **Local Fallback** — If Supabase is unreachable, counts open tabs via localStorage + BroadcastChannel
- **Animated Indicators** — Pulsing live dots and connection status

### ⌨️ Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` `→` | Seek ±5 seconds |
| `↑` `↓` | Volume ±5% |
| `S` | Cycle shuffle mode |
| `R` | Cycle repeat mode |
| `M` | Toggle mute |
| `T` | Cycle theme |
| `V` | Toggle view (split / full clock) |
| `C` | Open/close clock view |
| `E` | Open/close customize panel |
| `F` | Find similar tracks |
| `B` | Cycle wallpapers |
| `Esc` | Close panels / exit clock view |

### 📱 Responsive Design
- **Desktop** — Split layout with disc stage + queue sidebar
- **Mobile** — Tab-based navigation (Queue / Clock), optimized touch targets
- **PWA Ready** — Apple mobile web app meta tags, viewport-fit cover
- **Safe Area Support** — Respects notch and home indicator on modern devices

---

## 🛠️ Tech Stack

| Technology | Purpose |
|-----------|---------|
| **React 19** | UI framework with hooks-first architecture |
| **Vite 7** | Build tool with HMR and dev server |
| **TypeScript 5.9** | Type safety throughout the codebase |
| **TailwindCSS 4** | Utility-first styling with custom design tokens |
| **Supabase Realtime** | Live presence, room sync, chat, public playlists |
| **YouTube IFrame API** | Audio streaming and playback |
| **Open-Meteo API** | Free weather data (no API key needed) |
| **Motion (Framer Motion)** | Animations and transitions (AnimatePresence, spring physics) |
| **IndexedDB** | Client-side wallpaper storage cache |
| **Canvas 2D** | Music-reactive visualizations and ripple effects |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ 
- **npm** 9+

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd animated-glassmorphism-music-player

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

> **Note:** The player works fully without Supabase — rooms, presence, and public playlists will gracefully fall back to local mode.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 📁 Project Architecture

```
src/
├── App.tsx                 # Root component — state management, routing, all feature orchestration
├── main.tsx                # Entry point — React root render
├── index.css               # Global styles — glass surfaces, animations, scrollbars, keyframes
├── themes.ts               # Theme definitions (Abyss, Ember, Verdant, Orchid)
│
├── components/
│   ├── BackgroundCanvas.tsx # Music-reactive full-viewport canvas (orbs, ribbons, particles)
│   ├── CursorGlow.tsx       # Cursor-following ambient light effect
│   ├── RippleLayer.tsx      # Water-drop click splash effects (rings + droplets)
│   ├── MediaLayer.tsx       # Custom wallpaper layer (image/video with blur + dim)
│   ├── DiscStage.tsx        # Vinyl disc with album art, spectrum visualizer, progress ring
│   ├── Controls.tsx         # Playback controls (play, seek, volume, shuffle, repeat, speed)
│   ├── Playlist.tsx         # Queue panel with add/remove/reorder and similar tracks
│   ├── PlaylistsView.tsx    # Playlists hub — create, import (YouTube/Spotify), public gallery
│   ├── Clock.tsx            # Clock card (compact) + Clock view (full-screen)
│   ├── TimeScreen.tsx       # Full clock view wrapper
│   ├── TopBar.tsx           # Navigation bar — theme picker, view toggle, room, playlists
│   ├── CustomizePanel.tsx   # Right sidebar — all appearance and behavior settings
│   ├── RoomPanel.tsx        # Room management — create, join, chat, permissions, members
│   ├── RoomsView.tsx        # Room browser
│   ├── SearchModal.tsx      # Quick search across queue
│   ├── SettingsView.tsx     # Settings panel with import/export
│   ├── DigitFlipper.tsx     # Animated digit transition component
│   ├── WeatherIcon.tsx      # SVG weather condition icons
│   ├── Icons.tsx            # Player control SVG icons
│   ├── UiIcons.tsx          # UI element SVG icons
│   ├── Toasts.tsx           # Toast notification system
│   ├── ListenersCard.tsx    # Live listener count display
│   ├── FocusTasks.tsx       # Focus/task management
│   ├── StartScreen.tsx      # Initial loading screen
│   ├── LandingPage.tsx      # Landing page
│   ├── MainPlayer.tsx       # Main player layout wrapper
│   ├── AboutView.tsx        # About page
│   ├── HistoryView.tsx      # Listening history
│   ├── QueueView.tsx        # Queue management view
│   └── WhatsNewView.tsx     # Changelog/what's new
│
├── hooks/
│   ├── usePlayer.ts         # YouTube player — state, controls, shuffle, media session, auto top-up
│   ├── useBeat.ts           # Deterministic pseudo-spectrum engine (tempo-locked oscillators)
│   ├── useClock.ts          # Real-time clock with greeting
│   ├── usePresence.ts       # Supabase Realtime presence (global live user count)
│   ├── useRoom.ts           # Room management — create, join, sync, permissions, chat
│   ├── useSettings.ts       # Settings state with localStorage persistence
│   └── useFocus.ts          # Focus timer / Pomodoro hook
│
├── lib/
│   ├── media.ts             # Track model, YouTube metadata fetch, similar track discovery
│   ├── youtube.ts           # YouTube IFrame API loader
│   ├── weather.ts           # Open-Meteo weather fetch, geolocation, WMO codes
│   ├── room.ts              # Room utilities — invite codes, permissions, playback state
│   ├── playlist.ts          # YouTube playlist loader
│   ├── spotify.ts           # Spotify embed scraper + YouTube track matching
│   ├── publicPlaylists.ts   # Supabase public playlists CRUD + real-time subscriptions
│   ├── persistence.ts       # localStorage persistence layer — likes, playlists, history, preferences
│   ├── bgStore.ts           # IndexedDB wallpaper storage — add, remove, activate, cache
│   ├── color.ts             # Color utilities — hexToRgba (memoized), time formatting
│   ├── supabase.ts          # Supabase client initialization
│   └── trackModel.ts        # Track type definitions
│
├── data/
│   └── tracks.ts            # Default seed tracks (curated Bollywood/Pakistani mashups)
│
└── utils/
    └── cn.ts                # clsx + tailwind-merge utility
```

---

## ⚡ Performance Optimizations

This project has been extensively optimized to reduce RAM usage, CPU load, and ensure smooth 60fps navigation:

### Canvas Rendering
| Optimization | Before | After | Impact |
|-------------|--------|-------|--------|
| BackgroundCanvas DPR | 1.5× | 1.0× | ~56% less GPU memory for background canvas |
| BackgroundCanvas FPS | 60fps | 30fps (frame-skip) | 50% fewer draw calls |
| Particles | 54 | 24 | 56% fewer particle calculations per frame |
| Waveform step | 6px | 12px | 50% fewer path points per ribbon |
| RippleLayer DPR | 2× | 1× | 75% less GPU memory for ripple canvas |
| RippleLayer idle | Always running | Sleeps when empty | 0 CPU when not clicking |
| DiscStage bars | 64 | 48 | 25% fewer spectrum bars |
| DiscStage FPS | 60fps | 30fps | 50% fewer draw calls |

### Animation Loops
| Optimization | Before | After | Impact |
|-------------|--------|-------|--------|
| CursorGlow | Dedicated rAF loop | CSS `transition` on transform | Eliminated 1 entire rAF loop |
| Tab visibility | All loops run in background | All loops pause when tab hidden | 0 CPU when tab is inactive |
| Total rAF loops when idle | 4 simultaneous | 2 (at 30fps) + 0 (idle ripple) + 0 (CSS cursor) | ~75% reduction |

### React Re-renders
| Optimization | Before | After | Impact |
|-------------|--------|-------|--------|
| Player poll interval | 400ms | 500ms | 20% fewer polls |
| setTime guard | Every poll | Only when Δ ≥ 0.3s | Eliminates redundant renders |
| setBuffered guard | Every poll | Only when Δ ≥ 0.5% | Eliminates redundant renders |

### Computation
| Optimization | Before | After | Impact |
|-------------|--------|-------|--------|
| hexToRgba | Parsed fresh every call | Memoized with Map cache | ~0 string parsing on repeat calls |
| BeatEngine.read() | Recomputed per caller per frame | Frame-dedup (2ms cache window) | 48 sin() calls saved per frame |

---

## 📄 License

This project is private and proprietary. Built by **CREESPY**.

---

## 🙏 Credits

- **YouTube** — Audio streaming via IFrame API
- **Open-Meteo** — Free weather data (no API key required)
- **Supabase** — Realtime presence, rooms, and public playlists
- **Google Fonts** — Rubik + JetBrains Mono typography
- **Motion** — Animation library (formerly Framer Motion)

---

<div align="center">

**CREEP CREEP** — *Feel the music. See the music.*

Made with 🎧 by **CREESPY**

</div>
