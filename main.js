/* Portfolio behaviour. No dependencies, no layout work: the gallery is
   pre-rendered by tools/build-gallery.mjs, so this file only adds polish. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ---------- Footer year ---------- */
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Photos: fade up on scroll, fade in when loaded ---------- */
  var figures = Array.prototype.slice.call(document.querySelectorAll('.photo'));

  function markLoaded(img) { img.classList.add('is-loaded'); }
  figures.forEach(function (fig) {
    var img = $('img', fig);
    if (!img) return;
    function ready() { (img.decode ? img.decode() : Promise.resolve()).then(function () { markLoaded(img); }, function () { markLoaded(img); }); }
    if (img.complete && img.naturalWidth) ready();
    else {
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', function () { markLoaded(img); }, { once: true });
    }
  });

  if ('IntersectionObserver' in window) {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          reveal.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -60px 0px' });
    figures.forEach(function (fig) { reveal.observe(fig); });
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
