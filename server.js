'use strict';

require('dotenv').config();

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app         = express();
const PORT        = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');
const TMDB_KEY    = process.env.TMDB_API_KEY;
const TMDB_IMG    = 'https://image.tmdb.org/t/p/w1280';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── TMDB fetch helpers ────────────────────────────────────────────────────────

// Single env var supports both v3 API keys (32-char hex) and v4 JWT read tokens
function tmdbFetch(endpoint, params = {}) {
  if (!TMDB_KEY) return Promise.resolve(null);
  const url  = new URL(`https://api.themoviedb.org/3${endpoint}`);
  const hdrs = {};
  if (TMDB_KEY.startsWith('ey')) {
    hdrs.Authorization = `Bearer ${TMDB_KEY}`;
  } else {
    url.searchParams.set('api_key', TMDB_KEY);
  }
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return fetch(url.toString(), { headers: hdrs, signal: AbortSignal.timeout(8000) });
}

function normalizeItem(r, type) {
  const title    = r.title || r.name || '';
  const tagline  = (r.overview || '').slice(0, 180).trim();
  const backdrop = r.backdrop_path ? `${TMDB_IMG}${r.backdrop_path}` : null;
  if (!backdrop || !title) return null;
  return { id: r.id, title, tagline, backdrop, mediaType: type || r.media_type || 'movie' };
}

async function fetchTrending() {
  try {
    const res = await tmdbFetch('/trending/all/day', { language: 'en-US' });
    if (!res?.ok) throw new Error(res ? `HTTP ${res.status}` : 'key not configured');
    const data = await res.json();
    return (data.results || []).map(r => normalizeItem(r)).filter(Boolean).slice(0, 10);
  } catch (err) {
    console.error('TMDB global trending failed:', err.message);
    return [];
  }
}

async function fetchProviderContent(providerId) {
  const base = {
    watch_region: 'US', with_watch_providers: providerId,
    sort_by: 'popularity.desc', include_adult: false, language: 'en-US',
  };
  try {
    const [mRes, tRes] = await Promise.allSettled([
      tmdbFetch('/discover/movie', base),
      tmdbFetch('/discover/tv',    base),
    ]);
    const items = [];
    if (mRes.status === 'fulfilled' && mRes.value?.ok) {
      const d = await mRes.value.json();
      items.push(...(d.results || []).map(r => normalizeItem(r, 'movie')).filter(Boolean));
    }
    if (tRes.status === 'fulfilled' && tRes.value?.ok) {
      const d = await tRes.value.json();
      items.push(...(d.results || []).map(r => normalizeItem(r, 'tv')).filter(Boolean));
    }
    return items.slice(0, 10);
  } catch (err) {
    console.error(`TMDB provider ${providerId} failed:`, err.message);
    return [];
  }
}

// ── Hero cache ────────────────────────────────────────────────────────────────

const hero = { global: null, providers: {} };   // populated at startup + every 6h

async function populateHeroCache() {
  if (!TMDB_KEY) {
    console.log('TMDB_API_KEY not set — set it in .env to enable hero content');
    return;
  }

  let tiles = [];
  try { tiles = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}

  const ids = [...new Set(tiles.map(t => t.tmdb_provider_id).filter(id => id != null))];
  console.log(`TMDB: prefetching global trending + ${ids.length} provider(s)…`);

  const settled = await Promise.allSettled([
    fetchTrending(),
    ...ids.map(id => fetchProviderContent(id).then(items => ({ id, items }))),
  ]);

  const [globalRes, ...provRes] = settled;
  if (globalRes.status === 'fulfilled' && globalRes.value.length)
    hero.global = globalRes.value;

  for (const r of provRes) {
    if (r.status === 'fulfilled' && r.value.items.length)
      hero.providers[r.value.id] = r.value.items;
  }

  const n = Object.keys(hero.providers).length;
  console.log(`TMDB cache ready — ${hero.global?.length ?? 0} global, ${n}/${ids.length} providers`);
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (err) {
    console.error('Error reading config.json:', err.message);
    res.status(500).json({ error: 'Could not read config.json' });
  }
});

app.post('/api/config', (req, res) => {
  const { tiles } = req.body || {};
  if (!Array.isArray(tiles))
    return res.status(400).json({ error: '"tiles" must be an array' });
  for (const t of tiles) {
    if (!t.name?.trim()) return res.status(400).json({ error: 'Each tile requires a non-empty "name"' });
    if (!t.url?.trim())  return res.status(400).json({ error: 'Each tile requires a non-empty "url"' });
  }
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(tiles, null, 2), 'utf8');
  } catch {
    return res.status(500).json({ error: 'Could not write config.json' });
  }
  res.json({ success: true });
});

// GET /api/hero — global trending items
app.get('/api/hero', (_req, res) => res.json(hero.global ?? []));

// GET /api/hero/:providerId — provider-specific items, falls back to global
app.get('/api/hero/:providerId', (req, res) => {
  const id    = parseInt(req.params.providerId, 10);
  const items = Number.isFinite(id)
    ? (hero.providers[id] ?? hero.global ?? [])
    : (hero.global ?? []);
  res.json(items);
});

// GET /api/videos/:mediaType/:id — proxy TMDB videos for trailer fetch
app.get('/api/videos/:mediaType/:id', async (req, res) => {
  if (!TMDB_KEY) return res.json([]);
  const { mediaType, id } = req.params;
  try {
    const r = await tmdbFetch(`/${mediaType}/${id}/videos`, { language: 'en-US' });
    if (!r?.ok) return res.json([]);
    const data = await r.json();
    res.json(data.results || []);
  } catch {
    res.json([]);
  }
});

app.get('/admin', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Streaming Launcher → http://localhost:${PORT}`);
  console.log(`Admin panel        → http://localhost:${PORT}/admin`);
  populateHeroCache();
  setInterval(populateHeroCache, 6 * 60 * 60 * 1000);
});
