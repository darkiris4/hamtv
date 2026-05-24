# hamtv

A self-hosted, Apple TV-style launcher for your streaming services. Single-page web app with a TMDB-powered hero backdrop, served by a tiny Node/Express server — no build step, no framework.

---

## Quick Start

### Docker (recommended)

Create `config.json` in your deploy directory first, then pull and run:

```bash
echo '[]' > config.json
docker compose up -d
```

Open **http://localhost:3000**. Tiles are configured via the admin panel at **/admin**.

> **Note:** `config.json` must exist as a file before `docker compose up` — if Docker creates it as a directory you'll get an `EISDIR` error. Run `echo '[]' > config.json` to fix it.

### Bare Node.js

```bash
git clone https://github.com/darkiris4/hamtv
cd hamtv
cp .env.example .env   # add your TMDB_API_KEY
npm install
node server.js
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable        | Default | Description                              |
|-----------------|---------|------------------------------------------|
| `PORT`          | `3000`  | Port the server listens on               |
| `TMDB_API_KEY`  | —       | TMDB v3 API key or v4 JWT read token. Enables the hero backdrop feature. Get one free at themoviedb.org |

---

## TMDB Hero

When `TMDB_API_KEY` is set, the hero section at the top of the launcher shows a full-bleed backdrop image from the focused service's content catalogue. On focus, it fetches popular titles available on that provider; if a provider has no TMDB ID configured, the hero falls back to the tile's static branding instead.

To wire a tile to a TMDB provider, set `tmdb_provider_id` in `config.json` (e.g. Netflix = `8`, Disney+ = `337`, Hulu = `15`).

---

## Configuration

Tiles are defined in `config.json` — a JSON array. Edit it directly or use the admin panel.

```json
[
  {
    "name":             "Netflix",
    "url":              "https://www.netflix.com",
    "logo":             "/icons/netflix.png",
    "color":            "#E50914",
    "newTab":           false,
    "tmdb_provider_id": 8
  }
]
```

| Field               | Required | Description                                                        |
|---------------------|----------|--------------------------------------------------------------------|
| `name`              | Yes      | Display label                                                      |
| `url`               | Yes      | URL opened when the tile is clicked                                |
| `logo`              | No       | Image URL or local path. Falls back to a text initial.             |
| `color`             | No       | Hex accent color for the tile glow (`#RRGGBB`)                     |
| `newTab`            | No       | `true` to open in a new tab                                        |
| `tmdb_provider_id`  | No       | TMDB watch provider ID — enables provider-specific hero backdrops  |

---

## Admin Panel

Navigate to **http://localhost:3000/admin**.

- Add, edit, delete, and reorder tiles
- Changes are written to `config.json` immediately and reflected on next page load

---

## Docker Image

Pre-built image is published to GHCR on every push to `main`:

```
ghcr.io/darkiris4/hamtv:latest
```

The `config.json` is bind-mounted at runtime so tile changes survive image updates.

---

## Reverse Proxy

Example Caddy config for HTTPS:

```
tv.example.com {
    reverse_proxy localhost:3000
}
```

---

## Project Structure

```
hamtv/
├── server.js          # Express server — API + static file serving + TMDB cache
├── config.json        # Tile definitions (edit directly or via /admin)
├── package.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── public/
    ├── index.html     # Launcher page
    ├── style.css
    ├── app.js         # Config fetch, tile grid, TMDB hero logic
    ├── admin.html
    ├── admin.css
    └── admin.js
```

---

## API

| Method | Path                | Description                            |
|--------|---------------------|----------------------------------------|
| GET    | `/api/config`       | Returns current tile array             |
| POST   | `/api/config`       | Overwrites tiles (admin auth required) |
| GET    | `/api/hero`         | Global TMDB trending items             |
| GET    | `/api/hero/:id`     | Provider-specific items, falls back to global |
| POST   | `/api/admin/verify` | Verifies admin password                |
