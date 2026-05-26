'use strict';

// Ported from github.com/nikdelvin/liquid-glass (Astro/TS → vanilla JS).
// Generates a per-element SVG displacement filter as a data URI and applies
// it via backdrop-filter so the glass effect refracts whatever is painted
// behind the element. Falls back to simple blur+saturate on Safari (which
// does not support backdrop-filter: url()).

// ── Displacement map SVG (encodes edge-warp geometry) ────────────────────────

function getDisplacementMap({ height, width, radius, depth }) {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>.mix{mix-blend-mode:screen}</style>
  <defs>
    <linearGradient id="Y" x1="0" x2="0"
      y1="${Math.ceil((radius / height) * 15)}%"
      y2="${Math.floor(100 - (radius / height) * 15)}%">
      <stop offset="0%" stop-color="#0F0"/><stop offset="100%" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="X"
      x1="${Math.ceil((radius / width) * 15)}%"
      x2="${Math.floor(100 - (radius / width) * 15)}%"
      y1="0" y2="0">
      <stop offset="0%" stop-color="#F00"/><stop offset="100%" stop-color="#000"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" height="${height}" width="${width}" fill="#808080"/>
  <g filter="blur(2px)">
    <rect x="0" y="0" height="${height}" width="${width}" fill="#000080"/>
    <rect x="0" y="0" height="${height}" width="${width}" fill="url(#Y)" class="mix"/>
    <rect x="0" y="0" height="${height}" width="${width}" fill="url(#X)" class="mix"/>
    <rect x="${depth}" y="${depth}"
      height="${height - 2 * depth}" width="${width - 2 * depth}"
      fill="#808080" rx="${radius}" ry="${radius}" filter="blur(${depth}px)"/>
  </g>
</svg>`,
    )
  );
}

// ── Displacement filter SVG (RGB-split for chromatic aberration) ──────────────

function getDisplacementFilter({ height, width, radius, depth, strength = 100, chromaticAberration = 0 }) {
  const map = getDisplacementMap({ height, width, radius, depth });
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="displace" color-interpolation-filters="sRGB">
      <feImage x="0" y="0" height="${height}" width="${width}" href="${map}" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map"
        scale="${strength + chromaticAberration * 2}"
        xChannelSelector="R" yChannelSelector="G"/>
      <feColorMatrix type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="displacedR"/>
      <feDisplacementMap in="SourceGraphic" in2="map"
        scale="${strength + chromaticAberration}"
        xChannelSelector="R" yChannelSelector="G"/>
      <feColorMatrix type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="displacedG"/>
      <feDisplacementMap in="SourceGraphic" in2="map"
        scale="${strength}"
        xChannelSelector="R" yChannelSelector="G"/>
      <feColorMatrix type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="displacedB"/>
      <feBlend in="displacedR" in2="displacedG" mode="screen"/>
      <feBlend in2="displacedB" mode="screen"/>
    </filter>
  </defs>
</svg>`,
    ) +
    '#displace'
  );
}

// ── Feature detection ─────────────────────────────────────────────────────────

const supportsBackdropFilterUrl = (() => {
  const el = document.createElement('div');
  el.style.cssText = 'backdrop-filter: url(#test)';
  return (
    el.style.backdropFilter === 'url(#test)' ||
    el.style.backdropFilter === 'url("#test")'
  );
})();

// ── Core: compute and apply the filter to one .liquid-glass element ───────────

function redrawGlass(glass) {
  const box     = glass.querySelector('.glass-box');
  const content = glass.querySelector('.lg-content');
  if (!box || !content) return;

  const rect   = content.getBoundingClientRect();
  const width  = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (!width || !height) return;

  const blur        = parseFloat(box.dataset.blur       || '0');
  const cab         = parseFloat(box.dataset.cab        || '0');
  const depth       = parseFloat(box.dataset.depth      || '10');
  const strength    = parseFloat(box.dataset.strength   || '100');
  const saturate    = parseFloat(box.dataset.saturate   || '1.5');
  const brightness  = parseFloat(box.dataset.brightness || '1.1');
  const radius      = parseFloat(getComputedStyle(glass).borderRadius) || 0;

  box.style.width  = `${width}px`;
  box.style.height = `${height}px`;

  if (supportsBackdropFilterUrl) {
    const filterUri = getDisplacementFilter({ height, width, radius, depth, strength, chromaticAberration: cab });
    const value = `blur(${blur / 2}px) url('${filterUri}') blur(${blur}px) brightness(${brightness}) saturate(${saturate})`;
    box.style.backdropFilter       = value;
    box.style.webkitBackdropFilter = value;
  } else {
    // Built-in Safari fallback
    const fallback = `blur(${width / 10}px) saturate(180%)`;
    box.style.webkitBackdropFilter = fallback;
  }
}

// ── Init: find all uninitialised .liquid-glass elements and set up observers ──

function initLiquidGlass() {
  document.querySelectorAll('.liquid-glass:not([data-lg-init])').forEach(glass => {
    glass.dataset.lgInit = 'true';
    redrawGlass(glass);
    new ResizeObserver(() => redrawGlass(glass)).observe(glass);
  });
}

// app.js calls this after tiles are injected into the DOM
window.LiquidGlass = { init: initLiquidGlass, redraw: redrawGlass };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiquidGlass);
} else {
  initLiquidGlass();
}
