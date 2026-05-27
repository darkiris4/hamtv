// trailer.js — hero trailer autoplay for focused service tiles
// Exposes globals: onTileFocus(tmdbContentId, mediaType), onTileBlur(),
//                  onTrailerAdvance(tmdbContentId, mediaType)

(function () {
  const wrap    = document.getElementById('hero-trailer-wrap');
  const muteBtn = document.getElementById('mute-btn');

  const videoCache = new Map(); // `${mediaType}/${id}` → YouTube key | null | 'pending'

  let dwellTimer    = null;
  let safetyTimer   = null;
  let pollTimer     = null;
  let reqSeq        = 0;
  let currentIframe = null;
  let muted         = true;

  // ── Mute button ─────────────────────────────────────────────────────────────

  function _applyMuteIcon() {
    if (!muteBtn) return;
    muteBtn.querySelector('.icon-muted').style.display   = muted ? '' : 'none';
    muteBtn.querySelector('.icon-unmuted').style.display = muted ? 'none' : '';
    muteBtn.setAttribute('aria-label', muted ? 'Unmute trailer' : 'Mute trailer');
  }

  muteBtn?.addEventListener('click', () => {
    muted = !muted;
    currentIframe?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), '*'
    );
    _applyMuteIcon();
  });

  // YouTube sends onStateChange via postMessage when enablejsapi=1.
  // State 1 = playing, 3 = buffering. Either means the iframe is working —
  // clear the safety timer so a healthy trailer isn't killed mid-play.
  window.addEventListener('message', e => {
    if (!currentIframe || e.source !== currentIframe.contentWindow) return;
    try {
      const data  = JSON.parse(e.data);
      const state = typeof data.info === 'number' ? data.info : (data.info?.playerState ?? -99);
      if (data.event === 'onStateChange' && (state === 1 || state === 3)) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
    } catch {}
  });

  // ── Public API ──────────────────────────────────────────────────────────────

  window.onTileFocus = function (tmdbContentId, mediaType) {
    clearTimeout(dwellTimer);
    reqSeq++;
    _prefetch(tmdbContentId, mediaType);
    const seq = reqSeq;
    dwellTimer = setTimeout(() => _playTrailer(tmdbContentId, mediaType, seq), 2000);
  };

  window.onTileBlur = function () {
    clearTimeout(dwellTimer);
    dwellTimer = null;
    reqSeq++;
    _stopTrailer();
  };

  // Called by auto-scroll when the backdrop advances to a new item while a
  // trailer is already playing. Transitions immediately (no 2s dwell).
  window.onTrailerAdvance = function (tmdbContentId, mediaType) {
    if (!wrap.classList.contains('active')) return; // no trailer playing — ignore
    reqSeq++;
    _prefetch(tmdbContentId, mediaType);
    const seq = reqSeq;
    clearTimeout(dwellTimer);
    dwellTimer = setTimeout(() => _playTrailer(tmdbContentId, mediaType, seq), 500);
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
      if (seq !== reqSeq) return;

      const cached = videoCache.get(cacheKey);

      if (cached === undefined || cached === 'pending') {
        elapsed += 100;
        if (elapsed >= 3000) return;
        pollTimer = setTimeout(poll, 100);
        return;
      }

      if (!cached) return;

      _injectIframe(cached);
    }

    poll();
  }

  function _injectIframe(key) {
    const old = wrap.querySelector('iframe');
    if (old) old.remove();
    clearTimeout(safetyTimer);
    safetyTimer = null;

    // Reset to muted for each new trailer
    muted = true;
    _applyMuteIcon();

    const src = 'https://www.youtube.com/embed/' + key
      + '?autoplay=1&mute=1&controls=0&showinfo=0'
      + '&rel=0&modestbranding=1&playsinline=1&enablejsapi=1';

    const iframe   = document.createElement('iframe');
    iframe.src     = src;
    iframe.allow   = 'autoplay; encrypted-media';
    currentIframe  = iframe;

    wrap.appendChild(iframe);
    requestAnimationFrame(() => wrap.classList.add('active'));

    if (muteBtn) muteBtn.hidden = false;

    // Safety valve: if the iframe fails silently (no onStateChange within 20s), clean up.
    // Cleared early once YouTube confirms playback via postMessage.
    safetyTimer = setTimeout(_stopTrailer, 20000);
  }

  // ── Stop ────────────────────────────────────────────────────────────────────

  function _stopTrailer() {
    clearTimeout(pollTimer);
    clearTimeout(safetyTimer);
    pollTimer     = null;
    safetyTimer   = null;
    currentIframe = null;

    if (muteBtn) muteBtn.hidden = true;
    muted = true;

    wrap.classList.remove('active');

    const iframe = wrap.querySelector('iframe');
    if (iframe) {
      setTimeout(() => { if (wrap.contains(iframe)) iframe.remove(); }, 600);
    }
  }
}());
