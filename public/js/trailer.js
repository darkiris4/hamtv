// trailer.js — hero trailer autoplay for focused service tiles
// Exposes globals: onTileFocus(tmdbContentId, mediaType), onTileBlur()

(function () {
  const wrap    = document.getElementById('hero-trailer-wrap');
  const muteBtn = document.getElementById('mute-btn');

  const videoCache = new Map(); // `${mediaType}/${id}` → YouTube key | null | 'pending'

  let dwellTimer    = null;
  let safetyTimer   = null;
  let maxPlayTimer  = null;   // ultimate cleanup if postMessage never fires
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
  //   State 1 = playing, 3 = buffering → clear startup safety timer
  //   State 0 = ended → stop trailer so auto-scroll can resume
  window.addEventListener('message', e => {
    if (!currentIframe || e.source !== currentIframe.contentWindow) return;
    try {
      const data  = JSON.parse(e.data);
      const state = typeof data.info === 'number' ? data.info : (data.info?.playerState ?? -99);
      if (data.event === 'onStateChange') {
        if (state === 1 || state === 3) {
          clearTimeout(safetyTimer);
          safetyTimer = null;
        } else if (state === 0) {
          _stopTrailer();
        }
      }
    } catch {}
  });

  // ── Public API ──────────────────────────────────────────────────────────────

  window.onTileFocus = function (tmdbContentId, mediaType) {
    clearTimeout(dwellTimer);
    reqSeq++;
    _prefetch(tmdbContentId, mediaType);
    const seq = reqSeq;
    dwellTimer = setTimeout(() => _playTrailer(tmdbContentId, mediaType, seq), 5000);
  };

  window.onTileBlur = function () {
    clearTimeout(dwellTimer);
    dwellTimer = null;
    reqSeq++;
    _stopTrailer();
  };

  // Called by auto-scroll when the backdrop advances to a new item.
  // If a dwell timer is pending (trailer hasn't started yet), reset it so
  // the new title image always shows for the full dwell period first.
  window.onHeroItemChange = function (tmdbContentId, mediaType) {
    if (!dwellTimer) return;   // no pending dwell — nothing to reset
    clearTimeout(dwellTimer);
    reqSeq++;
    _prefetch(tmdbContentId, mediaType);
    const seq = reqSeq;
    dwellTimer = setTimeout(() => _playTrailer(tmdbContentId, mediaType, seq), 5000);
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

    // Startup safety: if playback never begins (silent failure), clean up after 30s.
    // Cleared once YouTube confirms buffering/playing via postMessage.
    safetyTimer  = setTimeout(_stopTrailer, 30000);
    // Ultimate fallback: ensure cleanup after 5 min even if postMessage never fires
    // (keeps auto-scroll from being paused indefinitely).
    maxPlayTimer = setTimeout(_stopTrailer, 5 * 60 * 1000);
  }

  // ── Stop ────────────────────────────────────────────────────────────────────

  function _stopTrailer() {
    clearTimeout(pollTimer);
    clearTimeout(safetyTimer);
    clearTimeout(maxPlayTimer);
    pollTimer     = null;
    safetyTimer   = null;
    maxPlayTimer  = null;
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
