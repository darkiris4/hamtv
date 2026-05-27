// app.js — launcher: config + TMDB hero content, Apple TV-style UX

// ── Hero content state ────────────────────────────────────────────────────────

let globalHeroItems = [];     // from /api/hero
const providerCache = {};     // { tmdb_provider_id → items[] }, populated in background

// Auto-scroll state
let autoScrollItems  = [];
let autoScrollIndex  = 0;
let autoScrollData   = null;
let autoScrollAccent = null;
let heroAutoTimer    = null;  // setTimeout handle for 5-10s cycle

// ── Hero content cache (sessionStorage, per-tab) ──────────────────────────────

function getCachedHero(key) {
  try { return JSON.parse(sessionStorage.getItem(`hamtv_hero_${key}`)) ?? null; } catch { return null; }
}
function setCachedHero(key, data) {
  try { sessionStorage.setItem(`hamtv_hero_${key}`, JSON.stringify(data)); } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
  const grid = document.getElementById('grid');

  let tiles;
  try {
    const cachedGlobal = getCachedHero('__global__');
    const [configRes, heroRes] = await Promise.all([
      fetch('/api/config'),
      cachedGlobal ? Promise.resolve(null) : fetch('/api/hero').catch(() => null),
    ]);
    if (!configRes.ok) throw new Error(`HTTP ${configRes.status}`);
    tiles = await configRes.json();
    if (cachedGlobal) {
      globalHeroItems = cachedGlobal;
    } else if (heroRes?.ok) {
      globalHeroItems = await heroRes.json().catch(() => []);
      if (globalHeroItems.length) setCachedHero('__global__', globalHeroItems);
    }
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

  const glassRow   = document.createElement('div');
  glassRow.className = 'tile-row-glass';
  const remaining  = document.createElement('div');
  remaining.className = 'tile-remaining';

  const hero        = document.getElementById('hero');
  const serviceTileEls = tiles.map(buildTile);
  const settingsEl     = buildSettingsTile();

  const hasTraySelection = tiles.some(t => t.inTray);
  if (hasTraySelection) {
    serviceTileEls.forEach((el, i) => {
      (tiles[i].inTray ? glassRow : remaining).appendChild(el);
    });
  } else {
    const n = tilesPerRow(hero);
    serviceTileEls.slice(0, n).forEach(el => glassRow.appendChild(el));
    serviceTileEls.slice(n).forEach(el => remaining.appendChild(el));
  }
  remaining.appendChild(settingsEl);

  hero.appendChild(glassRow);
  if (remaining.children.length) grid.appendChild(remaining);

  // Initial state — show project logo (no service hovered yet)
  focusGlobal(false);

  // Background-prefetch per-provider content so hovers are instant
  for (const tile of tiles) {
    if (tile.tmdb_provider_id != null) {
      const pid    = tile.tmdb_provider_id;
      const cached = getCachedHero(pid);
      if (cached) {
        providerCache[pid] = cached;
      } else {
        fetch(`/api/hero/${pid}`)
          .then(r => r.ok ? r.json() : [])
          .then(items => {
            if (items.length) { providerCache[pid] = items; setCachedHero(pid, items); }
          })
          .catch(() => {});
      }
    }
  }
}());

// ── Tile row layout ───────────────────────────────────────────────────────────

// How many 200px tiles (22px gap) fit in one row of .tile-row-glass.
// Glass has 28px horizontal padding on each side, so subtract 56px from
// the grid's rendered width.
function tilesPerRow(gridEl) {
  const available = gridEl.clientWidth - 56;
  return Math.max(1, Math.floor((available + 22) / 222));
}

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
  a.style.setProperty('--tile-accent', data.color || '#1e1e1e');
  if (data.newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }

  if (data.logo) {
    const img     = document.createElement('img');
    img.className = 'tile-logo';
    img.src       = data.logo;
    img.alt       = data.name;
    img.loading   = 'lazy';
    img.draggable = false;
    img.onerror   = () => img.replaceWith(makeInitial(data.name));
    if (data.logoPadding) img.style.padding = `${data.logoPadding}px`;
    if (data.logoFit === 'fill-v') { img.style.width = 'auto';  img.style.height = '100%'; }
    if (data.logoFit === 'fill-h') { img.style.width = '100%';  img.style.height = 'auto'; }
    a.appendChild(img);
  } else {
    a.appendChild(makeInitial(data.name));
  }

  attachTileInteractions(a, accent, data);
  return a;
}

// ── Settings tile ─────────────────────────────────────────────────────────────

function buildSettingsTile() {
  const GRAY = '#86878b';
  const LOGO = '/icons/settings.png';
  const tileData = { name: 'Settings', url: '/admin', logo: LOGO, color: GRAY, newTab: false };

  const a       = document.createElement('a');
  a.className   = 'tile';
  a.href        = '/admin';
  a.title       = 'Settings';
  a.style.setProperty('--tile-accent', GRAY);
  const img     = document.createElement('img');
  img.className = 'tile-logo';
  img.src       = LOGO;
  img.alt       = 'Settings';
  img.draggable = false;
  img.onerror       = () => img.replaceWith(makeInitial('S'));
  img.style.width   = 'auto';
  img.style.height  = '100%';
  a.appendChild(img);

  attachTileInteractions(a, '#86878b', tileData);
  return a;
}

// ── Tile interactions — hover and focus both drive the hero; hover also drives tilt/shine ──

function attachTileInteractions(a, accent, tileData) {
  let isFocused = false;

  // Helper: get the top TMDB content item for this tile (for trailer fetching)
  function _topItem() {
    return (heroItemsFor(tileData) || []).find(i => i?.id && i?.mediaType) || null;
  }

  // Focus → update hero (keyboard nav or click)
  a.addEventListener('focus', () => {
    isFocused = true;
    a.style.transition  = 'border-color 0.12s ease, box-shadow 0.15s ease';
    a.style.borderColor = 'rgba(255,255,255,0.75)';
    a.style.boxShadow   =
      `0 0 0 1px rgba(255,255,255,0.5), 0 12px 44px ${toRgba(accent, 0.55)}`;
    focusTile(tileData, true);
    const t = _topItem(); if (t) window.onTileFocus?.(t.id, t.mediaType);
  });

  a.addEventListener('blur', () => {
    isFocused = false;
    a.style.transition =
      'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), ' +
      'border-color 0.18s ease, box-shadow 0.18s ease';
    a.style.transform   = '';
    a.style.borderColor = 'rgba(255,255,255,0.08)';
    a.style.boxShadow   = '';
    focusGlobal(true);
    window.onTileBlur?.();
  });

  // Hover → tile visual effects + hero update
  a.addEventListener('mouseenter', () => {
    a.style.transition  = 'border-color 0.12s ease, box-shadow 0.15s ease';
    a.style.borderColor = 'rgba(255,255,255,0.75)';
    a.style.boxShadow   =
      `0 0 0 1px rgba(255,255,255,0.5), 0 12px 44px ${toRgba(accent, 0.55)}`;
    focusTile(tileData, true);
    const t = _topItem(); if (t) window.onTileFocus?.(t.id, t.mediaType);
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
    a.style.transform = '';
    if (!isFocused) {
      a.style.borderColor = 'rgba(255,255,255,0.08)';
      a.style.boxShadow   = '';
    }
    window.onTileBlur?.();
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

const heroCard         = document.getElementById('hero-card');
const heroLogoWrap     = document.getElementById('hero-logo-wrap');
const heroLogo         = document.getElementById('hero-logo');
const heroInitial      = document.getElementById('hero-initial');
const heroName         = document.getElementById('hero-name');
const heroTagline      = document.getElementById('hero-tagline');
const heroDomain       = document.getElementById('hero-domain');
const heroBackdrop     = document.getElementById('hero-backdrop');
const heroBackdropPrev = document.getElementById('hero-backdrop-prev');
const bgGlow           = document.getElementById('bg-glow');

let heroTimer;

// Stagger config for hero content transitions: element, delay-ms, duration
const STAGGER = [
  { el: heroLogoWrap, delay: 0,   dur: '0.35s' },
  { el: heroName,     delay: 40,  dur: '1s'    },
  { el: heroTagline,  delay: 80,  dur: '1s'    },
  { el: heroDomain,   delay: 110, dur: '1s'    },
];

// ── Auto-scroll helpers ───────────────────────────────────────────────────────

function stopHeroAutoScroll() {
  clearTimeout(heroAutoTimer);
  heroAutoTimer = null;
}

// Slide hero content out-left, call applyFn to update data, slide in from right.
function heroAnimate(applyFn) {
  STAGGER.forEach(({ el }) => {
    el.style.transition = 'opacity 0.2s ease-in, transform 0.2s ease-in';
    el.style.opacity    = '0';
    el.style.transform  = 'translateX(-40px)';
  });
  clearTimeout(heroTimer);
  heroTimer = setTimeout(() => {
    applyFn();
    STAGGER.forEach(({ el }) => {
      el.style.transition = 'none';
      el.style.opacity    = '0';
      el.style.transform  = 'translateX(40px)';
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      STAGGER.forEach(({ el, delay, dur }) => {
        setTimeout(() => {
          el.style.transition = `opacity ${dur} ease-out, transform ${dur} ease-out`;
          el.style.opacity    = '1';
          el.style.transform  = 'translateX(0)';
        }, delay);
      });
    }));
  }, 220);
}

// Skip exit animation; call applyFn immediately then slide content in from right.
function heroAnimateInitial(applyFn) {
  clearTimeout(heroTimer);
  applyFn();
  STAGGER.forEach(({ el }) => {
    el.style.transition = 'none';
    el.style.opacity    = '0';
    el.style.transform  = 'translateX(40px)';
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    STAGGER.forEach(({ el, delay, dur }) => {
      setTimeout(() => {
        el.style.transition = `opacity ${dur} ease-out, transform ${dur} ease-out`;
        el.style.opacity    = '1';
        el.style.transform  = 'translateX(0)';
      }, delay);
    });
  }));
}

// Schedule the next TMDB item advance (5-10s random interval).
// Reschedules itself until stopHeroAutoScroll() is called.
function scheduleHeroScroll() {
  stopHeroAutoScroll();
  if (autoScrollItems.length < 2) return;

  const delay = 5000 + Math.random() * 5000;
  heroAutoTimer = setTimeout(() => {
    autoScrollIndex = (autoScrollIndex + 1) % autoScrollItems.length;
    heroAnimate(() => {
      applyHeroContent(autoScrollData, autoScrollAccent, autoScrollItems[autoScrollIndex]);
    });
    scheduleHeroScroll();
  }, delay);
}

// ── Hero focus — tile ─────────────────────────────────────────────────────────

function focusTile(data, animate) {
  const accent = data.color || 'rgba(255,255,255,0.5)';
  bgGlow.style.backgroundColor = accent;
  stopHeroAutoScroll();

  // Seed auto-scroll state for this service
  autoScrollData   = data;
  autoScrollAccent = accent;
  autoScrollItems  = (heroItemsFor(data) || []).filter(i => i?.backdrop);
  autoScrollIndex  = autoScrollItems.length
    ? Math.floor(Math.random() * autoScrollItems.length)
    : 0;
  const item    = autoScrollItems[autoScrollIndex] || null;
  const applyFn = () => applyHeroContent(data, accent, item);

  if (animate) {
    heroAnimate(applyFn);
  } else {
    heroAnimateInitial(applyFn);
  }
  scheduleHeroScroll();
}

// ── Hero focus — idle (no service hovered) ────────────────────────────────────

function focusGlobal(animate) {
  stopHeroAutoScroll();
  bgGlow.style.backgroundColor = '#1c1c1e';

  if (animate) {
    heroAnimate(applyIdleHero);
  } else {
    heroAnimateInitial(applyIdleHero);
  }
}

function applyIdleHero() {
  heroCard.removeAttribute('href');
  heroCard.style.cursor = 'default';

  heroName.textContent    = 'Ham TV';
  heroTagline.textContent = '';
  heroTagline.hidden      = true;
  heroDomain.textContent  = '';

  setHeroBackdrop('/hamtv.png', 'auto 100%', 'center center');
  setHeroLogo({ logo: '/hamtv.png', name: 'Ham TV' }, 'rgba(255,255,255,0.6)');
}

// ── Hero content — tile-specific ──────────────────────────────────────────────

// item is pre-selected by the caller (auto-scroll) or null to pick randomly.
function applyHeroContent(data, accent, item = null) {
  heroCard.href         = data.url;
  heroCard.style.cursor = '';
  heroCard.target       = data.newTab ? '_blank' : '';
  heroCard.rel          = data.newTab ? 'noopener noreferrer' : '';

  if (item === null) item = pickRandom(heroItemsFor(data));

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
      setHeroBackdrop(data.logo, 'auto 100%', 'center center');
    } else {
      heroBackdropPrev.style.transition      = 'none';
      heroBackdropPrev.style.backgroundImage = 'none';
      heroBackdropPrev.style.opacity         = '0';
      heroBackdrop.style.transition          = 'none';
      heroBackdrop.style.backgroundImage     = 'none';
      heroBackdrop.style.opacity             = '0';
      heroBackdrop.classList.remove('loaded');
    }

    setHeroLogo(data, accent);
  }
}

// ── Shared hero helpers ───────────────────────────────────────────────────────

function setHeroBackdrop(url, size = 'cover', position = 'center top') {
  const curImg      = heroBackdrop.style.backgroundImage;
  const curOpacity  = heroBackdrop.style.opacity || '0';
  const curSize     = heroBackdrop.style.backgroundSize     || 'cover';
  const curPosition = heroBackdrop.style.backgroundPosition || 'center top';

  // Snapshot current backdrop onto the prev (lower) layer
  heroBackdropPrev.style.transition          = 'none';
  heroBackdropPrev.style.backgroundImage     = curImg;
  heroBackdropPrev.style.backgroundSize      = curSize;
  heroBackdropPrev.style.backgroundPosition  = curPosition;
  heroBackdropPrev.style.opacity             = curOpacity;
  heroBackdropPrev.style.transform           = 'scale(1.02) translateX(0)';

  // Stage new backdrop off-screen right
  heroBackdrop.style.transition          = 'none';
  heroBackdrop.style.backgroundImage     = `url(${url})`;
  heroBackdrop.style.backgroundSize      = size;
  heroBackdrop.style.backgroundPosition  = position;
  heroBackdrop.style.opacity             = '0';
  heroBackdrop.style.transform           = 'scale(1.02) translateX(60px)';
  heroBackdrop.classList.remove('loaded');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    // Prev exits left
    heroBackdropPrev.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    heroBackdropPrev.style.opacity    = '0';
    heroBackdropPrev.style.transform  = 'scale(1.02) translateX(-40px)';

    // New enters from right
    heroBackdrop.style.transition = 'opacity 1s ease, transform 1s ease';
    heroBackdrop.style.opacity    = '1';
    heroBackdrop.style.transform  = 'scale(1.02) translateX(0)';
  }));
}

function setHeroLogo(data, accent) {
  if (!data.logo) { showHeroInitial(data.name, accent); return; }

  // Already loaded in the DOM element — show immediately
  const target = new URL(data.logo, location.href).href;
  if (heroLogo.src === target && heroLogo.complete && heroLogo.naturalWidth > 0) {
    heroLogo.style.display    = 'block';
    heroInitial.style.display = 'none';
    return;
  }

  // Show initial as placeholder while the image preloads
  showHeroInitial(data.name, accent);

  const img = new Image();
  let settled = false;

  function applyLogo() {
    if (settled) return;
    settled               = true;
    heroLogo.alt          = data.name;
    heroLogo.src          = data.logo;
    heroLogo.style.display    = 'block';
    heroInitial.style.display = 'none';
  }

  img.onload  = applyLogo;
  img.onerror = () => { settled = true; }; // keep initial on error
  img.src     = data.logo;
  if (img.complete && img.naturalWidth > 0) applyLogo();
}

function showHeroInitial(name, accent) {
  heroLogo.style.display       = 'none';
  heroInitial.style.display    = 'flex';
  heroInitial.textContent      = (name || '?').charAt(0).toUpperCase();
  heroInitial.style.background = toRgba(accent, 0.2);
  heroInitial.style.color      = accent;
  heroInitial.style.border     = `2px solid ${toRgba(accent, 0.35)}`;
}

// ── Clock ─────────────────────────────────────────────────────────────────────

(function startClock() {
  const el = document.getElementById('clock-time');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}());

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
