// trailer.js — hero trailer autoplay for focused service tiles
// Exposes globals: onTileFocus(tmdbContentId, mediaType), onTileBlur()

(function () {
  const wrap = document.getElementById('hero-trailer-wrap');

  const videoCache = new Map(); // `${mediaType}/${id}` → YouTube key | null | 'pending'

  let dwellTimer  = null;
  let safetyTimer = null;
  let pollTimer   = null;
  let reqSeq      = 0;   // incremented on each new focus to invalidate stale polls

  // ── Public API ──────────────────────────────────────────────────────────────

  window.onTileFocus = function (tmdbContentId, mediaType) {
    clearTimeout(dwellTimer);
    reqSeq++;                       // invalidate any pending poll
    _prefetch(tmdbContentId, mediaType);
    const seq = reqSeq;
    dwellTimer = setTimeout(() => _playTrailer(tmdbContentId, mediaType, seq), 2000);
  };

  window.onTileBlur = function () {
    clearTimeout(dwellTimer);
    dwellTimer = null;
    reqSeq++;                       // also invalidate any in-flight poll
    _stopTrailer();
  };

  // ── Prefetch ────────────────────────────────────────────────────────────────

  async function _prefetch(id, mediaType) {
    const cacheKey = `${mediaType}/${id}`;
    if (videoCache.has(cacheKey)) return;
    videoCache.set(cacheKey, 'pending');

    try {
      const res = await fetch(`/api/videos/${mediaType}/${id}`);
      if (!res.ok) { videoCache.set(cacheKey, null); return; }
      const results = await res.json();

      const vid = results.find(v => v.site === 'YouTube' && v.type === 'Trailer')
               ?? results.find(v => v.site === 'YouTube' && v.type === 'Teaser')
               ?? null;

      videoCache.set(cacheKey, vid ? vid.key : null);
    } catch {
      videoCache.set(cacheKey, null);
    }
  }

  // ── Play ────────────────────────────────────────────────────────────────────

  function _playTrailer(id, mediaType, seq) {
    const cacheKey = `${mediaType}/${id}`;
    let elapsed    = 0;

    function poll() {
      if (seq !== reqSeq) return;             // focus moved — abort

      const cached = videoCache.get(cacheKey);

      if (cached === undefined || cached === 'pending') {
        elapsed += 100;
        if (elapsed >= 3000) return;          // prefetch taking too long — give up
        pollTimer = setTimeout(poll, 100);
        return;
      }

      if (!cached) return;                    // no trailer found — stay on backdrop

      _injectIframe(cached);
    }

    poll();
  }

  function _injectIframe(key) {
    // Hard-remove any existing iframe before creating a new one
    const old = wrap.querySelector('iframe');
    if (old) old.remove();
    clearTimeout(safetyTimer);
    safetyTimer = null;

    const src = 'https://www.youtube.com/embed/' + key
      + '?autoplay=1&mute=1&controls=0&showinfo=0'
      + '&rel=0&modestbranding=1&playsinline=1&loop=1&playlist=' + key;

    const iframe   = document.createElement('iframe');
    iframe.src     = src;
    iframe.allow   = 'autoplay; encrypted-media';

    wrap.appendChild(iframe);
    requestAnimationFrame(() => wrap.classList.add('active'));

    // Safety valve: if the iframe fails silently, clean up after 8s
    safetyTimer = setTimeout(_stopTrailer, 8000);
  }

  // ── Stop ────────────────────────────────────────────────────────────────────

  function _stopTrailer() {
    clearTimeout(pollTimer);
    clearTimeout(safetyTimer);
    pollTimer   = null;
    safetyTimer = null;

    wrap.classList.remove('active');

    // Remove iframe after the opacity transition completes (600ms)
    const iframe = wrap.querySelector('iframe');
    if (iframe) {
      setTimeout(() => { if (wrap.contains(iframe)) iframe.remove(); }, 600);
    }
  }
}());
