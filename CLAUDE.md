# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hamtv** is a self-hosted, Apple TV-style launcher for streaming services. It's a single-page web app with no build step or framework—just vanilla JavaScript, HTML/CSS, and a tiny Node.js/Express backend.

### Key Architecture

The app has two main parts:

1. **Backend (server.js)** — Express server that:
   - Serves static files from `public/`
   - Exposes `/api/config` for tile CRUD operations
   - Manages TMDB hero content caching (refreshed every 6 hours)
   - Supports both TMDB API v3 keys and v4 JWT read tokens via the `TMDB_API_KEY` env var

2. **Frontend (public/)**
   - **index.html + app.js** — Main launcher with tile grid and TMDB hero section
   - **admin.html + admin.js** — Tile editor for add/edit/delete/reorder via DOM manipulation
   - **style.css** — Apple TV-inspired styling with glassmorphism, backdrop blur, 3D tile transforms on hover

### Core Features

- **Tile Grid** — Responsive grid of clickable service tiles with fallback text initials
- **TMDB Hero Section** — Full-bleed backdrop that cycles through trending/provider-specific content when a tile is focused (keyboard or mouse)
- **Ambient Glow** — Large blurred background blob that shifts color to match the focused tile's accent
- **3D Hover Effects** — Tiles tilt, scale, and shine when hovered, mimicking physical surface reflections
- **Admin Panel** — Drag-reorder tiles, edit config.json in real-time

### Configuration

Tiles are stored in `config.json` as a JSON array. Each tile has:
- `name`, `url` (required)
- `logo` (image URL or local path; falls back to text initial)
- `color` (hex accent for glow and shine)
- `newTab` (boolean; defaults to false)
- `tmdb_provider_id` (TMDB provider ID for provider-specific hero content)

## Development

### Setup

```bash
# Install dependencies
npm install

# Copy .env template and add TMDB_API_KEY (optional)
cp .env.example .env

# Run the server
npm start
# or: node server.js
```

Open http://localhost:3000 for the launcher, http://localhost:3000/admin for the tile editor.

### Environment Variables

- `PORT` (default: 3000) — Server port
- `TMDB_API_KEY` — TMDB v3 API key (32-char hex) or v4 JWT read token (starts with `ey`). If unset, hero section is disabled.

### Dependencies

- **express** ^4.19.2 — Web framework
- **dotenv** ^16.4.5 — Environment loading

No build step, no transpilation, no CSS preprocessor.

### Docker

```bash
# Build and run
docker compose up -d

# Note: config.json must exist as a file before `docker compose up`
echo '[]' > config.json
```

The container is published to GHCR on every push to `main`:
```
ghcr.io/darkiris4/hamtv:latest
```

config.json is bind-mounted at runtime so tile edits survive container rebuilds.

## API

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/config` | Array of tile objects |
| POST | `/api/config` | `{ tiles: [...] }` — overwrites config.json |
| GET | `/api/hero` | Global TMDB trending (10 items max) |
| GET | `/api/hero/:providerId` | Provider-specific items; falls back to global |

## Frontend Flow

1. **Init** (`app.js` IIFE)
   - Fetch `/api/config` and `/api/hero` in parallel
   - Build tile elements via `buildTile()`, add to grid
   - Append a "Settings" tile that links to `/admin`
   - Background-prefetch provider-specific hero content (stored in `providerCache`)

2. **Focus Logic** (`focusTile()`, `focusGlobal()`)
   - Keyboard focus or click → `focusTile(tileData)`, which:
     - Updates hero card with service name/logo
     - Seeds auto-scroll state with provider's TMDB items (or fallback to global)
     - Randomly picks an item and displays its backdrop + title/tagline
     - Schedules next item every 5–10s via `scheduleHeroScroll()`
   - Blur → `focusGlobal()` returns hero to idle state (Ham TV logo, no backdrop)

3. **Hover Effects**
   - `mouseenter` → glow + shine effect
   - `mousemove` → 3D perspective transform + shine position follows cursor
   - `mouseleave` → spring back

4. **Admin Panel**
   - Load config on page open
   - DOM-driven editing (add, edit, delete, reorder tiles)
   - Save writes back to `/api/config` POST endpoint → config.json on disk

## Key Design Notes

- **`/admin` is an explicit route** — `server.js` registers `GET /admin` to serve `admin.html` directly (not via static middleware) so the URL stays `/admin` rather than `/admin.html`.
- **No auth on POST /api/config** — Assumes deployment is behind a reverse proxy with auth/firewall.
- **TMDB fetch is non-fatal** — If TMDB is down or key is missing, hero still shows static branding.
- **Lazy logo loading** — Tiles use `img.onerror` to fall back to text initials; admin.js uses DOM directly (no framework).
- **Hero transitions** — Fade + slide happen via `opacity` and `transform` on the hero card; backdrop crossfades via `opacity` on `#hero-backdrop` and a `.loaded` class.
- **Color handling** — `toRgba()` helper converts hex or rgb() to rgba for dynamic opacity in glow/shine.
- **Provider cache** — Prefetched in background at startup; global trending is always used as fallback if provider has no TMDB ID.


No tests, linting, or build step. `npm start` is the only command needed for development.
