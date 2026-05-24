# Streaming Launcher

A self-hosted, Apple TV-style launcher for your streaming services. Single-page web app served by a tiny Node/Express server — no build step, no framework.

![Dark tile grid with service logos and glowing hover effects](https://placeholder)

---

## Quick Start

### Bare Node.js

```bash
git clone <repo>
cd streaming-launcher
npm install
node server.js
```

Open **http://localhost:3000** in your browser.

### Docker

```bash
docker-compose up -d
```

Open **http://localhost:3000**. The `config.json` is volume-mounted, so tile changes survive container rebuilds.

---

## Configuration

### Environment variables

| Variable         | Default   | Description                              |
|------------------|-----------|------------------------------------------|
| `PORT`           | `3000`    | Port the server listens on               |
| `ADMIN_PASSWORD` | `admin`   | Password for the `/admin` panel          |

Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

### `config.json` schema

The tile grid is driven entirely by `config.json` at the project root. It's a JSON array of tile objects:

```json
[
  {
    "name":   "Netflix",
    "url":    "https://www.netflix.com",
    "logo":   "https://www.google.com/s2/favicons?domain=netflix.com&sz=128",
    "color":  "#E50914",
    "newTab": false
  }
]
```

| Field    | Required | Description                                                        |
|----------|----------|--------------------------------------------------------------------|
| `name`   | Yes      | Display label shown below the logo                                 |
| `url`    | Yes      | URL opened when the tile is clicked                                |
| `logo`   | No       | Image URL (local path or external). Falls back to a text initial.  |
| `color`  | No       | Hex accent color used for the tile glow on hover (`#RRGGBB`)       |
| `newTab` | No       | `true` to open in a new tab; `false` (default) for same tab        |

You can edit `config.json` directly, or use the admin panel.

---

## Admin Panel

Navigate to **http://localhost:3000/admin** and sign in with your `ADMIN_PASSWORD`.

From the editor you can:
- **Add** new tiles
- **Edit** name, URL, logo URL, accent color, and new-tab behavior
- **Delete** tiles (with confirmation)
- **Reorder** tiles with the ↑ / ↓ buttons
- **Save** — writes changes back to `config.json` on disk immediately

The launcher grid reloads from the server on every page load, so saved changes are live instantly.

---

## Deployment Tips

### Reverse proxy (HTTPS)

Put a reverse proxy in front for HTTPS and optional basic auth. Example Caddy config:

```
streaming.example.com {
    reverse_proxy localhost:3000
}
```

### Keeping config across rebuilds (Docker)

The `docker-compose.yml` mounts `./config.json` into the container. As long as `config.json` exists in the project directory on the host, your tiles survive any `docker-compose up --build`.

### Running on a home server / Raspberry Pi

The app requires only Node 18+ and has two production dependencies (`express`, `dotenv`). Memory footprint is minimal — suitable for low-power hardware.

---

## Project Structure

```
streaming-launcher/
├── server.js          # Express server (API + static file serving)
├── config.json        # Tile definitions (edit directly or via /admin)
├── package.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── public/
    ├── index.html     # Launcher page
    ├── style.css      # Dark Apple TV-style theme
    ├── app.js         # Fetches config, renders tile grid
    ├── admin.html     # Admin editor page
    ├── admin.css
    └── admin.js       # Auth, tile CRUD, save
```

---

## API

| Method | Path                  | Auth     | Description                           |
|--------|-----------------------|----------|---------------------------------------|
| GET    | `/api/config`         | —        | Returns the current tile array as JSON |
| POST   | `/api/admin/verify`   | password | Verifies the admin password            |
| POST   | `/api/config`         | password | Overwrites `config.json` with new tiles |

Password is sent in the JSON request body as `{ "password": "..." }`.
