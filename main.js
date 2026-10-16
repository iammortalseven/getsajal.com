/* Portfolio behaviour. No dependencies, no layout work: the gallery is
   pre-rendered by tools/build-gallery.mjs, so this file only adds polish.
   build-compat: 2   <- the build script checks this; don't remove */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ---------- Footer year ---------- */
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Photos: ghost until 10% is on screen, then fade in ----------
     Until then a photo sits at 10% opacity (see .js .photo in the CSS). Once 10% of its
     height has scrolled into view AND its image has loaded, it fades up to full strength. */
  var REVEAL_AT = 0.1;   // fraction of the photo's height that must be on screen
  var figures = Array.prototype.slice.call(document.querySelectorAll('.photo'));

  function reveal(fig) {
    var img = $('img', fig);
    function show() { fig.classList.add('is-visible'); }
    if (!img) return show();
    function afterLoad() { (img.decode ? img.decode() : Promise.resolve()).then(show, show); }
    if (img.complete && img.naturalWidth) afterLoad();
    else {
      img.addEventListener('load', afterLoad, { once: true });
      img.addEventListener('error', show, { once: true });   // never leave a photo stuck faint
    }
  }

  if ('IntersectionObserver' in window) {
    // The hidden photo sits 20px lower (its slide-up start). The 20px bottom margin cancels that
    // out, so "10% visible" is measured against where the photo will actually end up.
    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          watcher.unobserve(entry.target);
          reveal(entry.target);
        }
      });
    }, { threshold: REVEAL_AT, rootMargin: '0px 0px 20px 0px' });
    figures.forEach(function (fig) { watcher.observe(fig); });
  } else {
    figures.forEach(function (fig) { fig.classList.add('is-visible'); });
  }

  /* ---------- Menu ---------- */
  var menuBtn = $('#menu-btn');
  var menu = $('#menu');
  var menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    menu.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', function () { setMenu(!menuOpen); });
  menu.addEventListener('click', function (e) {
    // Click on the empty area or on a link closes the menu
    if (e.target === menu || e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });

  /* ---------- About box ---------- */
  var about = $('#about');

  function openAbout() {
    if (about.open) return;
    about.showModal();
    requestAnimationFrame(function () { requestAnimationFrame(function () { about.classList.add('is-open'); }); });
  }
  function closeAbout() {
    if (!about.open) return;
    about.classList.remove('is-open');
    var done = false;
    function finish() { if (done) return; done = true; about.close(); }
    about.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400); // safety net
  }
  $('#about-open').addEventListener('click', function () { setMenu(false); openAbout(); });
  $('#about-close').addEventListener('click', closeAbout);
  about.addEventListener('click', function (e) { if (e.target === about) closeAbout(); });  // click outside the box
  about.addEventListener('cancel', function (e) { e.preventDefault(); closeAbout(); });     // Esc key

  /* ---------- Back to top ---------- */
  var toTop = $('#to-top');
  var sentinel = $('.top-sentinel');
  if (sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      toTop.classList.toggle('is-visible', !entries[0].isIntersecting);
    }).observe(sentinel);
  }
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0 }); });
})();
