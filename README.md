<div align="center">

# 🎵 CReEPUSIK

**Your Music. Synchronized. Ad-Free. Everywhere.**

A premium, open-source music streaming application and real-time social listening platform. Stream any track with high fidelity, create synchronized listening rooms with live chat, discover community playlists synced across devices, and enjoy a seamless modern UI on Web, Android, and Desktop.

[![Latest Release](https://img.shields.io/badge/Release-v1.5.1-c3ec52?style=for-the-badge&logo=android&logoColor=black)](release-apk/CReEPUSIK-release-signed.apk)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20%7C%20Desktop-121318?style=for-the-badge&logo=capacitor&logoColor=c3ec52)](https://github.com/CREESPYG/CReESPUSIK)
[![React 19](https://img.shields.io/badge/React-19.2-121318?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Realtime-Supabase-121318?style=for-the-badge&logo=supabase&logoColor=3ECF8E)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-121318?style=for-the-badge&logo=open-source-initiative&logoColor=c3ec52)](LICENSE)

<br/>

[📥 **Download Latest Signed Android APK**](release-apk/CReEPUSIK-release-signed.apk) &nbsp;•&nbsp; [✨ Features](#-key-features) &nbsp;•&nbsp; [🗺️ Pages & Navigation](#-pages--navigation-sitemap) &nbsp;•&nbsp; [🛠️ Tech Stack](#-technology-stack) &nbsp;•&nbsp; [🚀 Getting Started](#-getting-started)

</div>

---

## ⚡ Highlights

- 🎧 **Ad-Free High-Fidelity Audio**: Pure, uninterrupted playback with zero commercials, background audio streaming, and instant play from playlists.
- 👥 **Real-Time "Listen Together" Rooms**: Join or host live rooms with sub-millisecond synchronization powered by Supabase Realtime presence and broadcast channels.
- 💬 **Integrated Live Room Chat**: Communicate in real time with fellow listeners inside the room or via the global drawer from any screen.
- 🌐 **Global (Community) Playlist Sync**: Create **Public (Global)** or **Private** playlists. Public playlists automatically sync to Supabase Cloud so other listeners worldwide can discover and play them.
- 📱 **Mobile First & Notch-Safe**: Beautiful responsive mobile layout designed with notch safe-area insets, floating mini-player, and gesture controls.
- 🎨 **State-of-the-Art Aesthetic**: Crafted with modern dark mode, fluid typography (Geist), vibrant accent themes, glassmorphism, and micro-animations.

---

## 📱 Mobile APK Download & Installation

The latest production-ready signed APK is packaged directly in the repository:

### 📦 [Download CReEPUSIK-release-signed.apk](release-apk/CReEPUSIK-release-signed.apk)

| File | Type | Signature | Size |
|------|------|-----------|------|
| [`CReEPUSIK-release-signed.apk`](release-apk/CReEPUSIK-release-signed.apk) | **Production Release** | **v2 + v3 Signed** | `~3.9 MB` |
| [`CReEPUSIK-debug.apk`](release-apk/CReEPUSIK-debug.apk) | Debug Build | Debug Keystore | `~5.5 MB` |

### 📲 How to Install on Android
1. Download [`CReEPUSIK-release-signed.apk`](release-apk/CReEPUSIK-release-signed.apk) to your Android device.
2. When prompted, tap **Install** (if prompted, allow *Install unknown apps* for your browser or file manager).
3. Open **CReEPUSIK** and enjoy unlimited music streaming, background playback, and live listening rooms!

---

## ✨ Key Features

### 1. 👥 Live Listening Rooms ("Listen Together")
- **Instant Host / Join**: Host your own listening broadcast or join active rooms via room code or from the live rooms directory.
- **Synchronized Playback**: Music position and playback state (play/pause/seek/queue) automatically synchronize across all active members.
- **Flexible Playback Control**: Switch between **Host Only** control (host dictates the queue) and **Shared** control (anyone in the room can queue and control tracks).
- **In-Room Live Chat**: Chat stream with live presence badges, member list, and notification indicators.
- **Host Transfer & Promotion**: Promote listeners to co-hosts or transfer host permissions dynamically.
- **Mobile Notch Clearance**: Dedicated safe-area padding (`safe-top-room`) ensures the room header never collides with the phone status bar or camera notch.

### 2. 🌐 Global (Community) & Private Playlists
- **Public (Global) Toggle**: Choose between **Public (Global)** and **Private** when creating playlists.
- **Supabase Cloud Sync**: Public playlists sync in real-time to the Supabase community catalog, accessible across all devices and listeners.
- **Playlist Management**: Add or remove tracks, sync manually or automatically, and explore community-curated playlists directly from the **Library**.

### 3. 🔍 Comprehensive Music Search
- **Universal Search**: Search tracks, artists, albums, and music videos.
- **Batch Search (`/search/list`)**: Enter multiple songs at once to instantly generate a continuous queue.
- **Rich Meta Exploration**: Browse genres, explore artist discographies, and view complete albums.

### 4. 🎛️ Audio Engine & Playback Controls
- **Audio-Only Streaming**: Lightweight, battery-efficient streaming with no video distractions.
- **Floating MiniPlayer**: Persistent player across all screens with track artwork, play/pause, seek progress, and quick chat drawer access.
- **Now Playing Sheet**: Expandable full-screen player with lyrics, animated equalizer, queue overview, and track options.
- **Keyboard Shortcuts**: Full desktop keyboard control (`Space` to play/pause, `J`/`K` to seek, `L` to toggle library, `N` for next track).

---

## 🗺️ Pages & Navigation Sitemap

Below is the complete architectural layout and page navigation of **CReEPUSIK**:

```
CReEPUSIK
├── 🏠 Home (/)
│   ├── Featured / Trending Releases
│   ├── Quick Picks & Recent History
│   └── Curated Genres & Playlists
│
├── 🔍 Search (/search)
│   ├── Live Search Input (Songs, Artists, Albums, Videos)
│   ├── Category & Genre Chips
│   └── 📋 Batch Search (/search/list) — Paste a list of songs to auto-queue
│
├── 📚 Library (/library)
│   ├── 👤 My Playlists (Private & Public)
│   ├── 🌐 Global (Community) Playlists (Synced from Supabase)
│   ├── ❤️ Favorites (/favorites)
│   ├── 🕒 History (/history)
│   └── ➕ New Playlist Dialog (with Public / Private Toggle)
│
├── 📡 Rooms (/rooms)
│   ├── 🚪 Lobby View (When not in room)
│   │   ├── User Identity Banner (Avatar, Nickname & Quick Edit)
│   │   ├── Active Public Rooms List (Live listeners & Join)
│   │   ├── Create a Room (Name, Public/Private, Host/Shared control)
│   │   └── Join with Code (Enter 5-character invite code)
│   │
│   └── 🎙️ Active Room Studio (When inside room)
│       ├── Header Card (Room Avatar, Live Presence, Code Copy, Leave Room)
│       ├── Tab: 💬 Live Chat (Realtime chat messages, typing indicator, quick send)
│       └── Tab: 👥 Music & Listeners (Synced playback track, online listeners, host controls)
│
├── 🎵 Detail Views
│   ├── 💿 Playlist Details (/playlist/:id)
│   │   └── Hero Header, Play, Shuffle, [...] More Menu (Sync with Global, Rename, Delete)
│   ├── 🎤 Artist Profile (/search/artist/:id)
│   ├── 📀 Album View (/search/album/:id)
│   └── 🎸 Genre Explorer (/search/genre/:id)
│
└── 🎛️ Global Persistent Overlays
    ├── 📱 Bottom TabBar (Home, Search, Library, Rooms on Mobile)
    ├── 🎵 MiniPlayer (Bottom floating player bar)
    ├── 📄 NowPlayingSheet (Expandable full-screen playback interface)
    ├── 💬 SideChatDrawer (Quick slide-in chat drawer accessible from any page)
    └── ⚙️ Settings Dialog (Theme accent picker, audio preferences, cache)
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend Framework** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) |
| **Bundler & Build Tool** | [Vite 8](https://vitejs.dev/) with SWC & PWA plugin |
| **Styling & Design System** | [Tailwind CSS v4](https://tailwindcss.com/), Glassmorphism, Geist Font |
| **Icons & Micro-animations** | [@phosphor-icons/react](https://phosphoricons.com/), [Motion](https://motion.dev/) |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) (Player, Library, UI, RoomStore) |
| **Realtime & Cloud Sync** | [Supabase Realtime & PostgreSQL](https://supabase.com/) |
| **Mobile Runtime** | [Capacitor 8](https://capacitorjs.com/) (Android native bridge) |
| **Backend & Stream Resolver** | Node.js, [YouTubei.js](https://github.com/LuanRT/YouTube.js) / Innertube |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20.0 or higher
- **Package Manager**: `pnpm` (recommended) or `npm`
- **For Android Development**: Android Studio / SDK (API 34+), Java JDK 17+

### 1. Clone the Repository
```bash
git clone https://github.com/CREESPYG/CReESPUSIK.git
cd CReESPUSIK
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
Create `.env` in the root or `web/.env`:
```env
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run Development Server
```bash
# Starts both web client and audio streaming backend
pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Building for Production

### Web Build
```bash
pnpm --filter @musike/web build
```

### Native Android Build
```bash
# 1. Build web client for native
pnpm --filter @musike/web build:native

# 2. Sync web assets into Android project
npx cap sync android

# 3. Assemble Release APK
cd mobile/android
./gradlew.bat assembleRelease
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the LICENSE file for details.

---

<div align="center">

Crafted with ❤️ by [CREESPY](https://github.com/CREESPYG)

**[⭐ Star this repository](https://github.com/CREESPYG/CReESPUSIK) if you enjoy using CReEPUSIK!**

</div>
