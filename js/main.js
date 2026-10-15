/* Portfolio behaviour. No dependencies, no layout work: the gallery is
   pre-rendered by tools/build-gallery.mjs, so this file only adds polish. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var root = document.documentElement;

  /* ---------- Footer year ---------- */
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Fade photos in as they finish loading ---------- */
  var gallery = $('.gallery');
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.photo img'));

  function markLoaded(img) { img.classList.add('is-loaded'); }
  thumbs.forEach(function (img) {
    if (img.complete && img.naturalWidth) {
      // Cached: decode first so the fade never starts on a half-painted image
      (img.decode ? img.decode() : Promise.resolve()).then(function () { markLoaded(img); }, function () { markLoaded(img); });
    } else {
      img.addEventListener('load', function () {
        (img.decode ? img.decode() : Promise.resolve()).then(function () { markLoaded(img); }, function () { markLoaded(img); });
      }, { once: true });
      img.addEventListener('error', function () { markLoaded(img); }, { once: true });
    }
  });

  /* ---------- Helpers for dialogs that animate out ---------- */
  function openDialog(dlg) {
    if (dlg.open) return;
    dlg.showModal();
    root.classList.add('is-locked');
    requestAnimationFrame(function () { requestAnimationFrame(function () { dlg.classList.add('is-open'); }); });
  }
  function closeDialog(dlg) {
    if (!dlg.open) return;
    dlg.classList.remove('is-open');
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      dlg.close();
      if (!document.querySelector('dialog[open]')) root.classList.remove('is-locked');
    }
    dlg.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400); // safety net (reduced motion, interrupted transitions)
  }
  function wireDialog(dlg, onClose) {
    // Esc key: play the exit animation instead of snapping shut
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(dlg); });
    dlg.addEventListener('close', function () { if (onClose) onClose(); });
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

  /* ---------- About dialog ---------- */
  var about = $('#about');
  wireDialog(about);
  $('#about-open').addEventListener('click', function () { setMenu(false); openDialog(about); });
  $('#about-close').addEventListener('click', function () { closeDialog(about); });
  about.addEventListener('click', function (e) { if (e.target === about) closeDialog(about); });

  /* ---------- Lightbox ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.photo a'));
  var lb = $('#lightbox');
  var lbImg = $('.lb-img', lb);
  var lbCount = $('.lb-count', lb);
  var current = -1;
  var lastTrigger = null;
  var token = 0;

  function fullSrc(i) { return links[(i + links.length) % links.length].href; }

  function show(i, dir) {
    if (!links.length) return;
    current = (i + links.length) % links.length;
    var a = links[current];
    var thumb = $('img', a);
    var my = ++token;

    lbCount.textContent = (current + 1) + ' / ' + links.length;
    lbImg.alt = thumb ? thumb.alt : '';

    function swap() {
      if (my !== token) return;
      // 1) show the already-cached thumbnail immediately (no blank flash)
      lbImg.src = (thumb && (thumb.currentSrc || thumb.src)) || a.href;
      lbImg.classList.remove('is-swapping', 'from-next', 'from-prev');
      // 2) upgrade to full resolution once it has decoded
      var big = new Image();
      big.src = a.href;
      (big.decode ? big.decode() : Promise.resolve()).then(function () {
        if (my === token) lbImg.src = a.href;
      }, function () {});
    }

    if (dir && lb.open) {
      lbImg.classList.add('is-swapping', dir > 0 ? 'from-next' : 'from-prev');
      setTimeout(swap, 160);
    } else {
      swap();
    }

    // Warm the cache for neighbours so next/prev feels instant
    [current + 1, current - 1].forEach(function (n) { var p = new Image(); p.src = fullSrc(n); });
  }

  function openLightbox(i, trigger) {
    lastTrigger = trigger || null;
    show(i, 0);
    openDialog(lb);
  }
  function closeLightbox() { closeDialog(lb); }

  wireDialog(lb, function () {
    token++;
    lbImg.removeAttribute('src');
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  });

  if (gallery) {
    gallery.addEventListener('click', function (e) {
      var a = e.target.closest('.photo a');
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
      e.preventDefault();
      openLightbox(links.indexOf(a), a);
    });
  }

  $('.lb-close', lb).addEventListener('click', closeLightbox);
  $('.lb-prev', lb).addEventListener('click', function () { show(current - 1, -1); });
  $('.lb-next', lb).addEventListener('click', function () { show(current + 1, 1); });
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target.classList.contains('lb-stage')) closeLightbox();
  });
  lb.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1, -1); }
  });

  // Swipe: left/right = prev/next, down = close
  var stage = $('.lb-stage', lb);
  var sx = 0, sy = 0, tracking = false;
  stage.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    tracking = true; sx = e.clientX; sy = e.clientY;
  });
  stage.addEventListener('pointerup', function (e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLightbox();
  });
  stage.addEventListener('pointercancel', function () { tracking = false; });

  /* ---------- Back to top (observer, not a scroll listener) ---------- */
  var toTop = $('#to-top');
  var sentinel = $('.top-sentinel');
  if (sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      toTop.classList.toggle('is-visible', !entries[0].isIntersecting);
    }).observe(sentinel);
  }
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0 }); });
})();
