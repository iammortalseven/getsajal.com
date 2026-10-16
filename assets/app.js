import PhotoSwipeLightbox from './vendor/photoswipe-lightbox.esm.min.js';
import { masonryPositions } from './layout.mjs';

const data = JSON.parse(document.querySelector('#page-data').textContent);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const assets = new URL('./', import.meta.url);
const icon = name => `<svg class="icon ${name}" aria-hidden="true"><use href="${new URL('icons.svg', assets).href}#${name}"></use></svg>`;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3300);
}

if (data.setup) {
  $('#site').innerHTML = '<div class="empty-state"><h1>Sajal · Photography</h1><p>This is the source template. Follow START-HERE.md to add your photos and publish with GitHub Actions, or run BUILD.cmd to prepare a local preview.</p></div>';
} else {
  startGallery();
}

function startGallery() {
  const grid = $('#photo-grid');
  const panel = $('#panel');
  const photos = new Map(data.images.map(p => [p.id, p]));
  const storageKey = `sajal:favourites:v1:${new URL('.', location.href).pathname}`;
  let favourites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) favourites = new Set(saved.filter(id => photos.has(id)));
  } catch { /* Browsing and downloads continue if local storage is unavailable. */ }
  let filter = 'all', returnFocus, viewer, openedHistoryEntry = false, fromHistory = false;
  let layoutFrame, lightbox;

  function layout() {
    if (!grid) return;
    const nodes = [...grid.querySelectorAll('.photo:not([hidden])')];
    const style = getComputedStyle(grid);
    const columns = Number(style.getPropertyValue('--columns')) || 2;
    const gap = parseFloat(style.getPropertyValue('--gap')) || 10;
    const result = masonryPositions(nodes.map(n => Number(n.dataset.ratio)), grid.clientWidth, columns, gap);
    grid.classList.add('masonry');
    nodes.forEach((node, i) => { node.style.transform = `translate(${result.positions[i].x}px,${result.positions[i].y}px)`; });
    grid.style.height = `${result.height}px`;
  }
  function scheduleLayout() { cancelAnimationFrame(layoutFrame); layoutFrame = requestAnimationFrame(layout); }
  if (grid) new ResizeObserver(scheduleLayout).observe(grid);
  if (document.fonts) document.fonts.ready.then(scheduleLayout);
  layout();

  function updateFavourites() {
    $$('.photo').forEach(node => {
      const yes = favourites.has(node.dataset.id);
      node.classList.toggle('is-favourite', yes);
      node.querySelector('[data-favourite]')?.setAttribute('aria-pressed', String(yes));
      node.hidden = filter === 'favourites' && !yes;
    });
    $$('[data-favourite-count]').forEach(el => { el.textContent = String(favourites.size); el.hidden = !favourites.size; });
    $('#no-favourites').hidden = filter !== 'favourites' || favourites.size > 0;
    const button = viewer?.element?.querySelector('[data-viewer-favourite]');
    button?.setAttribute('aria-pressed', String(favourites.has(currentPhoto()?.id)));
    scheduleLayout();
  }
  function toggleFavourite(id) {
    if (!id) return;
    if (favourites.has(id)) favourites.delete(id); else favourites.add(id);
    try { localStorage.setItem(storageKey, JSON.stringify([...favourites])); }
    catch { toast('Favourites will last for this visit only; browser storage is unavailable.'); }
    updateFavourites();
  }
  function selectFilter(next) {
    filter = next;
    $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    updateFavourites();
    closeMenu();
    $('#images').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  function currentPhoto() { return photos.get(viewer?.currSlide?.data?.photoId); }
  function closeMenu() {
    $('#mobile-menu').hidden = true;
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
  }
  $('#menu-toggle').addEventListener('click', () => {
    const expanded = $('#menu-toggle').getAttribute('aria-expanded') === 'true';
    $('#mobile-menu').hidden = expanded;
    $('#menu-toggle').setAttribute('aria-expanded', String(!expanded));
  });
  matchMedia('(min-width:901px)').addEventListener('change', closeMenu);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  $$('[data-filter]').forEach(b => b.addEventListener('click', () => selectFilter(b.dataset.filter)));
  $$('[data-favourite]').forEach(b => b.addEventListener('click', () => toggleFavourite(b.dataset.favourite)));
  $$('[data-action]').forEach(b => b.addEventListener('click', () => {
    closeMenu();
    const action = b.dataset.action;
    if (action === 'download') downloadPanel();
    if (action === 'share') share();
    if (action === 'favourites') favouritesPanel();
    if (action === 'help') helpPanel();
    if (action === 'about') showPanel(`About ${data.site.name}`, `<p>${escape(data.site.about)}</p>${contactLinks()}`);
  }));
  $$('[data-share-photo]').forEach(b => b.addEventListener('click', () => share(photos.get(b.dataset.sharePhoto))));

  function showPanel(title, html) {
    returnFocus = document.activeElement;
    $('#panel-title').textContent = title;
    $('#panel-content').innerHTML = html;
    // Keep the native dialog inside PhotoSwipe's focus boundary while its viewer is open.
    (viewer?.element || document.body).append(panel);
    panel.showModal();
    panel.querySelector('button,a,input')?.focus();
  }
  panel.addEventListener('close', () => {
    document.body.append(panel);
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  });
  panel.addEventListener('click', e => {
    if (e.target !== panel) return;
    const r = panel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) panel.close();
  });
  function contactLinks() {
    const links = [];
    if (data.site.email) links.push(`<a class="inline-link" href="mailto:${escape(data.site.email)}">${escape(data.site.email)}</a>`);
    if (data.site.instagram) links.push(`<a class="inline-link" href="${escape(data.site.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
    return links.length ? `<p>${links.join(' · ')}</p>` : '';
  }
  function downloadPanel() {
    if (!data.downloads) return;
    const links = data.archives.map((file,i) => `<a class="download-file" href="${escape(file.url)}" download="${escape(file.name)}"><span>${icon('download')} ${data.archives.length === 1 ? 'Download all photos' : `Download part ${i + 1} of ${data.archives.length}`}</span><small>${size(file.bytes)}</small></a>`).join('');
    showPanel('Download photos', `<p>${escape(data.title)} · ${data.images.length} images<br>Full-resolution files, exactly as uploaded.</p>${links}<p>ZIP files save to your device’s Downloads folder. Open the ZIP to extract the photos. On iPhone or iPad, open it in Files, then save the photos you want to Photos.</p>${data.archives.length > 1 ? '<p>This gallery is split into smaller ZIPs. Download every part to get the whole gallery; each part opens separately.</p>' : ''}`);
  }
  function favouritesPanel() {
    const selected = data.images.filter(p => favourites.has(p.id));
    if (!selected.length) {
      showPanel('Your favourites', '<p>Open a photo and tap the heart to save it here. Your selections are saved in this browser on this device.</p>');
      return;
    }
    showPanel('Your favourites', `<p>${selected.length} selected. Favourites are saved in this browser on this device.</p><div class="favourite-list">${selected.map(p => escape(p.name)).join('\n')}</div><button class="copy-button" id="copy-favourites">Copy filenames</button><button class="copy-button" id="view-favourites">View favourites</button>`);
    $('#copy-favourites').onclick = () => copyText(selected.map(p => p.name).join('\n'), 'Filenames copied');
    $('#view-favourites').onclick = () => { panel.close(); selectFilter('favourites'); };
  }
  function helpPanel() {
    showPanel('Enjoy your gallery', `<p><strong>Browse</strong><br>Tap any image to open it. Swipe left or right, or use the arrow keys on a computer. Pinch or double-tap to zoom. Swipe down, tap × or press Escape to close.</p><p><strong>Favourites</strong><br>Tap the heart on an open photo. Use the Favourites tab to review your selections. They stay in this browser on this device.</p>${data.downloads ? '<p><strong>Downloads</strong><br>Use Download gallery for all photos as ZIP files, or the download arrow in the viewer for an individual full-resolution image. On iPhone, downloads usually appear in Files → Downloads; they are not automatically added to Photos.</p>' : ''}<p><strong>Share</strong><br>Share the gallery, or an individual photo from its viewer.</p>${contactLinks()}`);
  }
  async function copyText(value, success) {
    try { await navigator.clipboard.writeText(value); toast(success); }
    catch {
      showPanel('Copy this text', '<label for="copy-value">Select and copy</label><input id="copy-value" readonly>');
      $('#copy-value').value = value;
      $('#copy-value').select();
    }
  }
  async function share(photo) {
    const url = new URL('.', location.href);
    if (photo) url.hash = `photo=${encodeURIComponent(photo.id)}`;
    const title = photo ? `${data.title} · ${photo.name}` : data.title;
    if (navigator.share) {
      try { await navigator.share({title, url:url.href}); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    showPanel(photo ? 'Share this photo' : 'Share this gallery', '<label for="share-url">Link</label><input id="share-url" readonly><button class="copy-button" id="copy-link">Copy link</button>');
    $('#share-url').value = url.href;
    $('#copy-link').onclick = () => copyText(url.href, 'Link copied');
  }
  function infoPanel(photo) {
    if (!photo) return;
    showPanel('Image details', `<dl class="meta-list"><dt>Gallery</dt><dd>${escape(data.title)}</dd><dt>Filename</dt><dd>${escape(photo.name)}</dd><dt>Dimensions</dt><dd>${photo.originalWidth} × ${photo.originalHeight}</dd><dt>File size</dt><dd>${size(photo.bytes)}</dd></dl>`);
  }

  if (data.images.length) {
    lightbox = new PhotoSwipeLightbox({
      gallery:'#photo-grid', children:'.photo:not([hidden]) .photo-link',
      pswpModule:() => import('./vendor/photoswipe.esm.min.js'),
      bgOpacity:1, padding:{top:0,bottom:0,left:0,right:0},
      showHideAnimationType:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'zoom',
      wheelToZoom:true, arrowPrevSVG:'<svg viewBox="0 0 32 32" class="pswp__icn" aria-hidden="true"><path d="m20 3-12 13 12 13" fill="none" stroke="white" stroke-width="3"/></svg>',
      arrowNextSVG:'<svg viewBox="0 0 32 32" class="pswp__icn" aria-hidden="true"><path d="m12 3 12 13-12 13" fill="none" stroke="white" stroke-width="3"/></svg>',
      closeSVG:icon('close'), zoomSVG:icon('zoom'),
      closeTitle:'Close photo', zoomTitle:'Zoom photo', arrowPrevTitle:'Previous photo', arrowNextTitle:'Next photo',
      errorMsg:'This photo could not be loaded. Close the viewer and try again.'
    });
    lightbox.addFilter('itemData', item => {
      item.photoId = item.element?.dataset.id;
      return item;
    });
    lightbox.on('uiRegister', () => {
      const pswp = lightbox.pswp;
      const register = (name,order,title,html,onClick,extra={}) => pswp.ui.registerElement({name,order,title,ariaLabel:title,isButton:true,className:`pswp__button pswp__button--custom pswp__button--${name}`,html,onClick,...extra});
      register('info',6,'Image details',icon('info'),() => infoPanel(currentPhoto()));
      if (data.downloads) register('download',7,'Download this photo',icon('download'),undefined,{
        tagName:'a',onInit:(el,p) => {
          const update = () => {
            const photo = photos.get(p.currSlide?.data.photoId);
            if (!photo) return;
            el.href = photo.original;
            el.setAttribute('download',photo.name);
          };
          p.on('change',update);
        }
      });
      register('favourite',8,'Favourite this photo',icon('heart'),() => toggleFavourite(currentPhoto()?.id),{
        onInit:el => {el.dataset.viewerFavourite='';el.setAttribute('aria-pressed','false');}
      });
      register('share',12,'Share this photo',icon('share'),() => share(currentPhoto()));
      pswp.ui.registerElement({name:'custom-caption',order:9,appendTo:'wrapper',onInit:(el,p) => {
        const caption = document.createElement('span'); el.append(caption);
        p.on('change',() => {caption.textContent = photos.get(p.currSlide?.data.photoId)?.name || '';});
      }});
    });
    lightbox.on('beforeOpen', () => {
      viewer = lightbox.pswp;
      if (!new URLSearchParams(location.hash.slice(1)).has('photo')) {
        history.pushState({galleryViewer:true},'',location.href);
        openedHistoryEntry = true;
      }
    });
    lightbox.on('change', () => {
      viewer = lightbox.pswp;
      const photo = currentPhoto();
      if (photo) history.replaceState(history.state,'',`#photo=${encodeURIComponent(photo.id)}`);
      updateFavourites();
    });
    lightbox.on('close', () => { if (panel.open) panel.close(); });
    lightbox.on('keydown', event => { if (panel.open) event.preventDefault(); });
    lightbox.on('destroy', () => {
      viewer = undefined;
      if (!fromHistory) {
        if (openedHistoryEntry) history.back();
        else if (location.hash.startsWith('#photo=')) history.replaceState(null,'','#images');
      }
      fromHistory = false;
      openedHistoryEntry = false;
    });
    lightbox.init();
    function syncHash() {
      const id = new URLSearchParams(location.hash.slice(1)).get('photo');
      if (viewer) {
        if (!id) { fromHistory = true; viewer.close(); }
        else {
          const index = [...grid.querySelectorAll('.photo:not([hidden]) .photo-link')].findIndex(a => a.dataset.id === id);
          if (index >= 0 && index !== viewer.currIndex) viewer.goTo(index);
        }
      } else if (id && photos.has(id)) {
        if (filter !== 'all') selectFilter('all');
        const links = [...grid.querySelectorAll('.photo-link')];
        lightbox.loadAndOpen(links.findIndex(a => a.dataset.id === id));
      }
    }
    window.addEventListener('popstate',syncHash);
    window.addEventListener('hashchange',syncHash);
    syncHash();
  }
  updateFavourites();
}
