# hamtv

A self-hosted, Apple TV-style launcher for your streaming services. Single-page web app with a TMDB-powered hero section, muted trailer autoplay, and liquid-glass UI — served by a tiny Node/Express server with no build step and no framework.

---

## Features

- **Tile grid** — Responsive grid of clickable service tiles with 3D perspective tilt, specular shine, and per-tile accent glow on hover
- **Glass tray** — First row of tiles floats in a frosted-glass panel anchored to the bottom of the hero
- **TMDB hero** — Full-bleed backdrop cycling through popular titles on the focused service; fades between items every 5–10 seconds
- **Trailer autoplay** — After 5 seconds on a tile, a muted YouTube trailer plays in the hero for the title currently on screen
  - Mute/unmute toggle (glass pill, bottom-right of hero) without restarting the video
  - Prev/next title navigation (glass pills, bottom-left of hero) to manually cycle through the service's catalogue
  - Content cycling pauses while a trailer is playing and resumes when it ends
  - Each title image is shown for at least 5 seconds before its trailer starts
- **Ambient glow** — Large blurred background blob that slowly shifts color to match the focused tile
- **Clock pill** — Live clock in the top-right corner of the hero
- **Admin panel** — Add, edit, delete, and drag-reorder tiles; per-tile logo padding and fill controls

---

## Quick Start

### Docker (recommended)

```bash
echo '[]' > config.json
docker compose up -d
```

Open **http://localhost:3000**. Configure tiles at **/admin**.

> **Note:** `config.json` must exist as a file before `docker compose up`. If Docker creates it as a directory you'll get an `EISDIR` error — `echo '[]' > config.json` fixes it.

### Bare Node.js

```bash
git clone https://github.com/darkiris4/hamtv
cd hamtv
cp .env.example .env   # add TMDB_API_KEY
npm install
node server.js
```

---

## Environment Variables

| Variable        | Default | Description |
|-----------------|---------|-------------|
| `PORT`          | `3000`  | Port the server listens on |
| `TMDB_API_KEY`  | —       | TMDB v3 key (32-char hex) or v4 JWT read token. Enables the hero backdrop and trailer features. Get one free at [themoviedb.org](https://www.themoviedb.org/settings/api) |

---

## TMDB Hero & Trailers

When `TMDB_API_KEY` is set:

1. The hero section shows a full-bleed backdrop cycling through popular titles available on the focused service.
2. Hovering a tile for 5 seconds triggers muted autoplay of the YouTube trailer for whichever title is currently on screen.
3. The prev/next buttons let you manually browse titles; each new title shows for 5 seconds before its trailer starts.
4. If a tile has no `tmdb_provider_id`, the hero falls back to the tile's own logo and branding.

To wire a tile to a TMDB provider, find the provider's numeric ID on TMDB and set `tmdb_provider_id` in `config.json`. Common IDs:

| Service     | ID  |
|-------------|-----|
| Netflix     | 8   |
| Apple TV+   | 350 |
| Disney+     | 337 |
| Hulu        | 15  |
| Amazon      | 9   |
| Max         | 1899|
| Paramount+  | 531 |
| Peacock     | 386 |

Hero content is prefetched at startup and refreshed every 6 hours.

---

## Configuration

Tiles are stored in `config.json` — a JSON array. Edit directly or use the admin panel at `/admin`.

```json
[
  {
    "name":             "Netflix",
    "url":              "https://www.netflix.com",
    "logo":             "/icons/netflix.png",
    "color":            "#E50914",
    "newTab":           true,
    "tmdb_provider_id": 8,
    "inTray":           true,
    "logoFit":          "contain",
    "logoPadding":      0
  }
]
```

| Field               | Required | Description |
|---------------------|----------|-------------|
| `name`              | Yes      | Display label and hero fallback title |
| `url`               | Yes      | URL opened when the tile is clicked |
| `logo`              | No       | Image URL or local path under `public/`. Falls back to a text initial. |
| `color`             | No       | Hex accent color for tile glow and ambient background (`#RRGGBB`) |
| `newTab`            | No       | `true` to open in a new tab |
| `tmdb_provider_id`  | No       | TMDB watch provider ID — enables hero backdrops and trailers |
| `inTray`            | No       | `true` to place the tile in the glass tray (first row); others go in the scrollable grid below |
| `logoFit`           | No       | `contain` (default), `fill-v` (full height), or `fill-h` (full width) |
| `logoPadding`       | No       | Inner padding in pixels applied to the tile logo image |

### Local logo files

Drop images into `public/icons/` and reference them as `/icons/filename.png`. The admin panel lets you set padding and fill direction per tile so logos that don't fit the 200×130 tile naturally can be adjusted without editing the file.

---

## Admin Panel

Navigate to **http://localhost:3000/admin**.

- Add, edit, and delete tiles
- Drag to reorder
- Set logo URL, accent color, padding, and fill direction per tile
- Changes write to `config.json` immediately

---

## Docker Image

Pre-built image published to GHCR on every push to `main`:

```
ghcr.io/darkiris4/hamtv:latest
```

`config.json` is bind-mounted at runtime so tile changes survive image updates.

---

## Reverse Proxy

Example Caddy config for HTTPS:

```
tv.example.com {
    reverse_proxy localhost:3000
}
```

---

## API

| Method | Path                      | Description |
|--------|---------------------------|-------------|
| GET    | `/api/config`             | Returns current tile array |
| POST   | `/api/config`             | Overwrites tiles with `{ tiles: [...] }` |
| GET    | `/api/hero`               | Global TMDB trending (up to 10 items) |
| GET    | `/api/hero/:providerId`   | Provider-specific items; falls back to global |
| GET    | `/api/videos/:type/:id`   | TMDB video list for a title (used by trailer autoplay) |
