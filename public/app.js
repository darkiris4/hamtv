// app.js — launcher: config + TMDB hero content, Apple TV-style UX

// ── Hero content state ────────────────────────────────────────────────────────

let globalHeroItems = [];     // from /api/hero
const providerCache = {};     // { tmdb_provider_id → items[] }, populated in background

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
  const grid = document.getElementById('grid');

  let tiles;
  try {
    // Fetch config and global hero in parallel; hero failure is non-fatal
    const [configRes, heroRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/hero').catch(() => null),
    ]);
    if (!configRes.ok) throw new Error(`HTTP ${configRes.status}`);
    tiles = await configRes.json();
    if (heroRes?.ok) globalHeroItems = await heroRes.json().catch(() => []);
  } catch (err) {
    grid.innerHTML =
      '<p class="grid-message">Could not load tiles — is the server running?</p>';
    console.error('init failed:', err);
    return;
  }

  if (!Array.isArray(tiles) || tiles.length === 0) {
    grid.innerHTML =
      '<p class="grid-message">No tiles yet.<br>' +
      'Visit <a href="/admin">/admin</a> to add some.</p>';
    return;
  }

  for (const tile of tiles) grid.appendChild(buildTile(tile));
  grid.appendChild(buildSettingsTile());

  // Initial hero — TMDB global content if available, else tile metadata fallback
  focusTile(tiles[0], false);

  // Background-prefetch per-provider content so hovers are instant
  for (const tile of tiles) {
    if (tile.tmdb_provider_id != null) {
      fetch(`/api/hero/${tile.tmdb_provider_id}`)
        .then(r => r.ok ? r.json() : [])
        .then(items => { if (items.length) providerCache[tile.tmdb_provider_id] = items; })
        .catch(() => {});
    }
  }
}());

// ── TMDB hero item helpers ────────────────────────────────────────────────────

// Provider → global → [] (always silent, never throws)
// Tiles with no tmdb_provider_id skip TMDB entirely and return [] so the
// caller falls back to static branding; global trending is only used when a
// provider-specific fetch failed.
function heroItemsFor(tile) {
  if (tile?.tmdb_provider_id != null) {
    return providerCache[tile.tmdb_provider_id] ?? globalHeroItems;
  }
  return [];
}

function pickRandom(arr) {
  const valid = (arr || []).filter(item => item?.backdrop);
  return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
}

// ── Service tile ──────────────────────────────────────────────────────────────

function buildTile(data) {
  const accent = data.color || 'rgba(255,255,255,0.6)';
  const a      = document.createElement('a');
  a.className  = 'tile';
  a.href       = data.url;
  a.title      = data.name;
  if (data.newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }

  if (data.logo) {
    const img     = document.createElement('img');
    img.className = 'tile-logo';
    img.src       = data.logo;
    img.alt       = data.name;
    img.loading   = 'lazy';
    img.draggable = false;
    img.onerror   = () => img.replaceWith(makeInitial(data.name));
    a.appendChild(img);
  } else {
    a.appendChild(makeInitial(data.name));
  }

  attachHoverEvents(a, accent, data);
  return a;
}

// ── Settings tile ─────────────────────────────────────────────────────────────

function buildSettingsTile() {
  const GRAY = '#3A3A3C';
  const LOGO = 'https://i.pinimg.com/1200x/52/e3/4c/52e34cdb514c7c65600eb18604a3903c.jpg';
  const tileData = { name: 'Settings', url: '/admin', logo: LOGO, color: GRAY, newTab: false };

  const a       = document.createElement('a');
  a.className   = 'tile';
  a.href        = '/admin';
  a.title       = 'Settings';
  const img     = document.createElement('img');
  img.className = 'tile-logo';
  img.src       = LOGO;
  img.alt       = 'Settings';
  img.draggable = false;
  img.onerror   = () => img.replaceWith(makeInitial('S'));
  a.appendChild(img);

  attachHoverEvents(a, '#8E8E93', tileData);
  return a;
}

// ── Hover / tilt / specular ───────────────────────────────────────────────────

function attachHoverEvents(a, accent, tileData) {
  a.addEventListener('mouseenter', () => {
    a.style.transition  = 'border-color 0.12s ease, box-shadow 0.15s ease';
    a.style.borderColor = 'rgba(255,255,255,0.75)';
    a.style.boxShadow   =
      `0 0 0 1px rgba(255,255,255,0.5), 0 12px 44px ${toRgba(accent, 0.55)}`;
    focusTile(tileData, true);
  });

  a.addEventListener('mousemove', e => {
    const r  = a.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width  / 2)) / (r.width  / 2);
    const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
    const sx = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
    const sy = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
    a.style.transition = 'border-color 0.12s ease, box-shadow 0.15s ease';
    a.style.transform  =
      `scale(1.07) perspective(600px) rotateX(${-dy * 10}deg) rotateY(${dx * 10}deg)`;
    a.style.setProperty('--shine-x', `${sx}%`);
    a.style.setProperty('--shine-y', `${sy}%`);
  });

  a.addEventListener('mouseleave', () => {
    a.style.transition =
      'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), ' +
      'border-color 0.18s ease, box-shadow 0.18s ease';
    a.style.transform   = '';
    a.style.borderColor = 'rgba(255,255,255,0.08)';
    a.style.boxShadow   = '';
    focusGlobal(true);
  });
}

// ── Text-initial fallback ─────────────────────────────────────────────────────

function makeInitial(name) {
  const d            = document.createElement('div');
  d.className        = 'tile-initial';
  d.textContent      = (name || '?').charAt(0).toUpperCase();
  d.style.background = 'rgba(0,0,0,0.22)';
  d.style.color      = '#fff';
  d.style.border     = '1.5px solid rgba(255,255,255,0.25)';
  return d;
}

// ── Hero DOM refs ─────────────────────────────────────────────────────────────

const heroCard     = document.getElementById('hero-card');
const heroLogo     = document.getElementById('hero-logo');
const heroInitial  = document.getElementById('hero-initial');
const heroName     = document.getElementById('hero-name');
const heroTagline  = document.getElementById('hero-tagline');
const heroDomain   = document.getElementById('hero-domain');
const heroBackdrop = document.getElementById('hero-backdrop');
const bgGlow       = document.getElementById('bg-glow');

let heroTimer;

// ── Hero focus — tile ─────────────────────────────────────────────────────────

function focusTile(data, animate) {
  const accent = data.color || 'rgba(255,255,255,0.5)';
  bgGlow.style.backgroundColor = accent;

  if (!animate) { applyHeroContent(data, accent); return; }

  heroCard.style.opacity   = '0';
  heroCard.style.transform = 'translateY(10px)';
  clearTimeout(heroTimer);
  heroTimer = setTimeout(() => {
    applyHeroContent(data, accent);
    heroCard.style.opacity   = '1';
    heroCard.style.transform = 'translateY(0)';
  }, 140);
}

// ── Hero focus — global trending (on mouse-out) ───────────────────────────────

function focusGlobal(animate) {
  if (!globalHeroItems.length) return;   // nothing to show; leave hero as-is

  bgGlow.style.backgroundColor = '#1c1c1e';
  clearTimeout(heroTimer);

  if (!animate) { applyGlobalHero(); return; }

  heroCard.style.opacity   = '0';
  heroCard.style.transform = 'translateY(10px)';
  heroTimer = setTimeout(() => {
    applyGlobalHero();
    heroCard.style.opacity   = '1';
    heroCard.style.transform = 'translateY(0)';
  }, 140);
}

function applyGlobalHero() {
  const item = pickRandom(globalHeroItems);
  if (!item) return;

  // No specific service to navigate to in global trending state
  heroCard.removeAttribute('href');
  heroCard.style.cursor = 'default';

  heroName.textContent    = item.title;
  heroTagline.textContent = item.tagline;
  heroTagline.hidden      = !item.tagline;
  heroDomain.textContent  = 'Trending Today';

  setHeroBackdrop(item.backdrop);
  heroLogo.style.display    = 'none';
  heroInitial.style.display = 'none';
}

// ── Hero content — tile-specific ──────────────────────────────────────────────

function applyHeroContent(data, accent) {
  heroCard.href         = data.url;
  heroCard.style.cursor = '';
  heroCard.target       = data.newTab ? '_blank' : '';
  heroCard.rel          = data.newTab ? 'noopener noreferrer' : '';

  const item = pickRandom(heroItemsFor(data));

  if (item) {
    // Content mode: TMDB backdrop + title/tagline, service logo as badge
    heroName.textContent    = item.title;
    heroTagline.textContent = item.tagline;
    heroTagline.hidden      = !item.tagline;
    heroDomain.textContent  = data.name === 'Settings' ? 'Configure launcher' : data.name;

    setHeroBackdrop(item.backdrop);
    setHeroLogo(data, accent);
  } else {
    // Fallback: service name + logo, no tagline
    heroName.textContent    = data.name;
    heroTagline.textContent = '';
    heroTagline.hidden      = true;

    if (data.name === 'Settings') {
      heroDomain.textContent = 'Configure launcher';
    } else {
      try       { heroDomain.textContent = new URL(data.url).hostname; }
      catch (_) { heroDomain.textContent = data.url; }
    }

    if (data.logo) {
      setHeroBackdrop(data.logo);
    } else {
      heroBackdrop.style.backgroundImage = 'none';
      heroBackdrop.classList.remove('loaded');
    }

    setHeroLogo(data, accent);
  }
}

// ── Shared hero helpers ───────────────────────────────────────────────────────

function setHeroBackdrop(url) {
  heroBackdrop.classList.remove('loaded');
  heroBackdrop.style.backgroundImage = `url(${url})`;
  // Double rAF ensures the browser processes the opacity:0 before we fade back in
  requestAnimationFrame(() => requestAnimationFrame(() =>
    heroBackdrop.classList.add('loaded')
  ));
}

function setHeroLogo(data, accent) {
  if (!data.logo) { showHeroInitial(data.name, accent); return; }

  heroLogo.alt     = data.name;
  heroLogo.onload  = () => { heroLogo.style.display = 'block'; heroInitial.style.display = 'none'; };
  heroLogo.onerror = () => showHeroInitial(data.name, accent);
  if (heroLogo.src !== new URL(data.logo, location.href).href) heroLogo.src = data.logo;
  if (heroLogo.complete && heroLogo.naturalWidth > 0) {
    heroLogo.style.display    = 'block';
    heroInitial.style.display = 'none';
  }
}

function showHeroInitial(name, accent) {
  heroLogo.style.display       = 'none';
  heroInitial.style.display    = 'flex';
  heroInitial.textContent      = (name || '?').charAt(0).toUpperCase();
  heroInitial.style.background = toRgba(accent, 0.2);
  heroInitial.style.color      = accent;
  heroInitial.style.border     = `2px solid ${toRgba(accent, 0.35)}`;
}

// ── Colour helper — #hex or rgb() → rgba(r,g,b,a) ────────────────────────────

function toRgba(color, alpha) {
  if (!color) return `rgba(255,255,255,${alpha})`;
  if (color.startsWith('rgb')) {
    const parts = color.replace(/rgba?\(|\)/g, '').split(',').slice(0, 3).map(s => s.trim());
    return `rgba(${parts.join(',')},${alpha})`;
  }
  let hex = color.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
