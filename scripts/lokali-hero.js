

/* Lokali hero
 * Recreates the hellobecca.com hero/scroll feel for the Webflow site:
 *   1. Background <video> autoplays muted + loops (with a mobile-autoplay fallback)
 *   2. The video parallaxes gently as you scroll past the hero
 *   3. Elements marked [data-lokali-reveal] fade/slide in when they enter view
 *
 * No dependencies and scrolling stays native (matching how hellobecca actually
 * works - it bundles AOS, it does NOT use a momentum/smooth-scroll library).
 * Pair this with lokali-hero.css. See lokali-hero-embed.html for the markup.
 */

(function () {
  'use strict';

  var PARALLAX_STRENGTH = 0.18; // 0 = none, ~0.25 = strong. Keep subtle.

  var prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Background video ------------------------------------------------ */

  function setupVideo() {
    var videos = document.querySelectorAll('[data-lokali-hero-video]');
    for (var i = 0; i < videos.length; i++) {
      (function (video) {
        // Required for autoplay on iOS/Android and to avoid layout jumps.
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.loop = true;
        video.autoplay = true;

        var attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') {
          // Some browsers reject autoplay until first interaction - retry then.
          attempt.catch(function () {
            var resume = function () {
              video.play();
              document.removeEventListener('touchstart', resume);
              document.removeEventListener('click', resume);
            };
            document.addEventListener('touchstart', resume, { once: true });
            document.addEventListener('click', resume, { once: true });
          });
        }
      })(videos[i]);
    }
  }

  /* ---- Parallax -------------------------------------------------------- */

  function setupParallax() {
    if (prefersReducedMotion) return;

    var heroes = document.querySelectorAll('[data-lokali-hero]');
    if (!heroes.length) return;

    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight || document.documentElement.clientHeight;

      for (var i = 0; i < heroes.length; i++) {
        var hero = heroes[i];
        var media = hero.querySelector('[data-lokali-hero-video], .lokali-hero-media img');
        if (!media) continue;

        var rect = hero.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) continue; // off-screen, skip work

        // How far the hero's top has scrolled above the viewport top.
        var offset = -rect.top * PARALLAX_STRENGTH;
        media.style.transform =
          'translate3d(-50%, calc(-50% + ' + offset + 'px), 0) scale(1.12)';
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ---- Scroll reveals -------------------------------------------------- */

  function setupReveals() {
    var els = document.querySelectorAll('[data-lokali-reveal]');
    if (!els.length) return;

    // No IntersectionObserver (or reduced motion) -> just show everything.
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var delay = parseInt(el.getAttribute('data-lokali-reveal-delay'), 10) || 0;
          if (delay) {
            setTimeout(function () { el.classList.add('is-visible'); }, delay);
          } else {
            el.classList.add('is-visible');
          }
          observer.unobserve(el); // reveal once, like the source site
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );

    for (var j = 0; j < els.length; j++) observer.observe(els[j]);
  }

  /* ---- Boot ------------------------------------------------------------ */

  function init() {
    setupVideo();
    setupParallax();
    setupReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
