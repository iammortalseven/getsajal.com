#!/usr/bin/env node
/**
 * build-gallery.mjs
 *
 *   source/*.jpg|png|webp   -->  images/<name>-480.webp, -800, -1200, -1800
 *                           -->  data/photos.json   (order + alt text, hand-editable)
 *                           -->  gallery HTML injected into index.html
 *
 * Run with:  npm run build
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source');
const OUT = path.join(ROOT, 'images');
const DATA = path.join(ROOT, 'data', 'photos.json');
const CACHE = path.join(ROOT, 'data', 'build-cache.json'); // remembers which source files were already processed
const INDEX = path.join(ROOT, 'index.html');

const WIDTHS = [480, 800, 1200, 1800]; // generated sizes; the browser picks the best one per screen
const QUALITY = 80;
const EAGER_COUNT = 2;                  // first N photos load immediately, the rest lazily
const ASSET_VERSION = 2;                // must match "build-compat" in css/styles.css and js/main.js
const COLUMNS = 2;                      // desktop columns (phones always show one column)
const COLUMN_GAP_ESTIMATE = 0.03;       // gap between photos, as a fraction of column width
const IMG_EXT = /\.(jpe?g|png|webp|avif|tiff?)$/i;
const SIZES_ATTR = '(max-width: 767px) 100vw, 50vw';

const slug = (name) =>
  name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'photo';
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

async function exists(p) {
  try { return await stat(p); } catch { return null; }
}

async function loadManifest() {
  try {
    const parsed = JSON.parse(await readFile(DATA, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadCache() {
  try { return JSON.parse(await readFile(CACHE, 'utf8')); } catch { return {}; }
}

async function processPhoto(file, cache) {
  const srcPath = path.join(SRC, file);
  const bytes = await readFile(srcPath);
  // A content hash (not file dates) decides whether to redo a photo, so this behaves the
  // same on your computer and on GitHub's servers, where every file gets a fresh date.
  const hash = createHash('sha1').update(bytes).digest('hex');
  const unchanged = cache[file] === hash;
  const meta = await sharp(bytes).metadata();

  // EXIF orientations 5-8 are rotated 90deg: width and height swap
  const swap = meta.orientation && meta.orientation >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  if (!width || !height) throw new Error(`Could not read dimensions of ${file}`);

  const stem = slug(file);
  const largest = Math.min(width, WIDTHS[WIDTHS.length - 1]);
  const targets = [...new Set([...WIDTHS.filter((w) => w < largest), largest])].sort((a, b) => a - b);

  let generated = 0;
  for (const w of targets) {
    const outPath = path.join(OUT, `${stem}-${w}.webp`);
    if (unchanged && (await exists(outPath))) continue; // already built from this exact file
    await sharp(bytes).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(outPath);
    generated++;
  }

  // Average colour -> used as the placeholder while the real image loads
  const { data } = await sharp(bytes).rotate().resize(1, 1, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const color = `rgb(${data[0]} ${data[1]} ${data[2]})`;

  return { stem, width, height, targets, color, generated, hash };
}

function renderFigure(p, index) {
  const largest = p.targets[p.targets.length - 1];
  const mid = p.targets.find((w) => w >= 800) ?? largest;
  const srcset = p.targets.map((w) => `images/${p.stem}-${w}.webp ${w}w`).join(', ');
  const eager = index < EAGER_COUNT;
  const alt = p.alt && p.alt.trim() ? p.alt : `Portfolio photograph ${index + 1}`;
  const ar = (p.width / p.height).toFixed(4);

  // --i is the photo's position in your order: phones (one column) use it to keep that order
  return `        <figure class="photo" style="--i:${index};--ar:${ar};--c:${p.color}">
          <img src="images/${p.stem}-${mid}.webp" srcset="${srcset}" sizes="${SIZES_ATTR}" width="${p.width}" height="${p.height}" alt="${escapeHtml(alt)}" decoding="async"${eager ? (index === 0 ? ' fetchpriority="high"' : '') : ' loading="lazy"'}>
        </figure>`;
}

// Masonry, worked out ahead of time: each photo goes into the currently shortest column
// (the first column wins ties), exactly like a masonry grid but with no layout code in the browser.
function renderColumns(photos) {
  const heights = Array(COLUMNS).fill(0);
  const cols = Array.from({ length: COLUMNS }, () => []);
  photos.forEach((p, i) => {
    const c = heights.indexOf(Math.min(...heights));
    cols[c].push(renderFigure(p, i));
    heights[c] += p.height / p.width + COLUMN_GAP_ESTIMATE;
  });
  return cols.map((c) => `      <div class="col">\n${c.join('\n')}\n      </div>`).join('\n');
}

async function main() {
  await mkdir(SRC, { recursive: true });
  await mkdir(OUT, { recursive: true });
  await mkdir(path.dirname(DATA), { recursive: true });

  const files = (await readdir(SRC))
    .filter((f) => IMG_EXT.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (!files.length) {
    console.error(`No images found in ${rel(SRC)}/ - drop your photos there and run again.`);
    process.exit(1);
  }

  // Existing manifest decides the order and keeps your alt text.
  // Newest first: photos that aren't in the manifest yet go to the TOP, highest number first
  // (so photos-13 comes before photos-12). Photos already in the manifest keep their place.
  const manifest = await loadManifest();
  const byFile = new Map(manifest.map((m) => [m.file, m]));
  const present = new Set(files);
  const ordered = [
    ...files.filter((f) => !byFile.has(f)).reverse(),                  // new photos go on top
    ...manifest.filter((m) => present.has(m.file)).map((m) => m.file), // keep your order
  ];

  const cache = await loadCache();
  const photos = [];
  let newCount = 0;
  for (const file of ordered) {
    process.stdout.write(`  ${file} ... `);
    const info = await processPhoto(file, cache);
    const prev = byFile.get(file);
    if (!prev) newCount++;
    photos.push({ file, alt: prev?.alt ?? '', ...info });
    console.log(info.generated ? `${info.generated} size(s) written` : 'up to date');
  }

  // photos.json: just the parts that are meant to be edited by hand
  await writeFile(DATA, JSON.stringify(photos.map(({ file, alt }) => ({ file, alt })), null, 2) + '\n');
  await writeFile(CACHE, JSON.stringify(Object.fromEntries(photos.map((p) => [p.file, p.hash])), null, 2) + '\n');

  // Safety check: the gallery markup only looks right with matching css/js. If one of them is an old
  // copy (easy to do when uploading files by hand) stop here with a clear message instead of
  // publishing a site that looks broken.
  const assets = {};
  for (const [label, file] of [['css/styles.css', 'styles.css'], ['js/main.js', 'main.js']]) {
    const text = await readFile(path.join(ROOT, label), 'utf8').catch(() => '');
    if (!text.includes(`build-compat: ${ASSET_VERSION}`)) {
      console.error(`\n${label} is an old or missing copy. Upload the latest ${file} (version ${ASSET_VERSION}) and run the build again.`);
      process.exit(1);
    }
    assets[label] = createHash('sha1').update(text).digest('hex').slice(0, 8);
  }

  // Inject gallery HTML into index.html
  let html = await readFile(INDEX, 'utf8');
  // Cache-busting: add ?v=<hash> to the css/js links, so visitors (and your own browser) always
  // fetch the new files after a change instead of reusing a stale copy.
  html = html
    .replace(/(css\/styles\.css)(\?v=[a-z0-9]+)?/, `$1?v=${assets['css/styles.css']}`)
    .replace(/(js\/main\.js)(\?v=[a-z0-9]+)?/, `$1?v=${assets['js/main.js']}`);
  const start = '<!-- GALLERY:START -->';
  const end = '<!-- GALLERY:END -->';
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e === -1 || e < s) {
    console.error(`index.html is missing the ${start} / ${end} markers.`);
    process.exit(1);
  }
  const gallery = renderColumns(photos);
  await writeFile(INDEX, `${html.slice(0, s + start.length)}\n${gallery}\n${html.slice(e)}`);

  const noAlt = photos.filter((p) => !p.alt.trim()).length;
  console.log(`\nDone: ${photos.length} photos (${newCount} new) -> index.html`);
  if (noAlt) console.log(`Tip: ${noAlt} photo(s) have no alt text yet. Add it in ${rel(DATA)} and run the build again.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
