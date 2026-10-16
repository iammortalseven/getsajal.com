#!/usr/bin/env python3
"""Build a static, subpath-safe photography site. Runtime: Python 3.11+, Pillow."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import quote, urlparse

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MIB = 1024 * 1024


def esc(value):
    return html.escape(str(value), quote=True)


def natural_key(value):
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r'(\d+)', str(value))]


def read_json(path, default=None):
    if not path.exists():
        return {} if default is None else default
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (ValueError, OSError) as exc:
        raise ValueError(f'Cannot read {path}: {exc}') from exc


def focus(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%', value):
        raise ValueError('coverPosition must contain two percentages, for example "50% 50%".')
    if any(float(x.rstrip('%')) > 100 for x in value.split()):
        raise ValueError('coverPosition percentages must be between 0 and 100.')
    return value


def photo_files(folder, metadata):
    files = sorted((p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS), key=lambda p: natural_key(p.name)) if folder.exists() else []
    # Reject links so a photo folder cannot accidentally include files outside this project.
    if any(p.is_symlink() for p in files):
        raise ValueError(f'Symbolic links are not supported in {folder}. Copy the actual files instead.')
    order = metadata.get('order', [])
    if len(set(order)) != len(order):
        raise ValueError(f'Duplicate filenames in order list for {folder}.')
    by_name = {p.name: p for p in files}
    missing = [name for name in order if name not in by_name]
    if missing:
        raise ValueError(f'Order list names do not exist in {folder}: {missing}')
    return [by_name[n] for n in order] + [p for p in files if p.name not in order]


def srgb_preview(path):
    try:
        with Image.open(path) as opened:
            if getattr(opened, 'is_animated', False):
                raise ValueError(f'Animated images are not supported: {path.name}. Export a still photo.')
            image = ImageOps.exif_transpose(opened)
            image.load()
            icc = opened.info.get('icc_profile')
            if icc:
                try:
                    image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(BytesIO(icc)), ImageCms.createProfile('sRGB'), outputMode='RGB')
                except (OSError, ValueError, ImageCms.PyCMSError):
                    print(f'WARNING: Could not convert ICC profile in {path.name}; export in sRGB for predictable colours.')
            if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
                rgba = image.convert('RGBA')
                rgb = Image.new('RGB', rgba.size, 'white')
                rgb.paste(rgba, mask=rgba.getchannel('A'))
                image = rgb
            return image.convert('RGB')
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError(f'Cannot process photo {path}: {exc}. Re-export this photo as JPEG.') from exc


def process_images(files, output, metadata, allow_downloads):
    result = []
    if not files:
        return result
    media = output / 'media'
    media.mkdir(parents=True, exist_ok=True)
    if allow_downloads:
        (output / 'originals').mkdir(exist_ok=True)
    for index, source in enumerate(files):
        if source.stat().st_size >= 95 * MIB:
            raise ValueError(f'{source.name} is too large for normal GitHub uploads. Export a JPEG below 95 MB.')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
        photo_id = f'{hashlib.sha256(source.name.encode()).hexdigest()[:8]}-{digest}'
        image = srgb_preview(source)
        original_width, original_height = image.size
        variants = []
        # Long-edge cap prevents an extreme portrait from becoming a huge viewer bitmap.
        for width in (480, 960, 1600, 2560):
            preview = image.copy()
            preview.thumbnail((width, 2560), Image.Resampling.LANCZOS)
            w, h = preview.size
            if variants and variants[-1]['width'] == w:
                continue
            name = f'{photo_id}-{w}.webp'
            preview.save(media / name, 'WEBP', quality=86, method=4)
            variants.append({'url': f'media/{name}', 'width': w, 'height': h})
        full = variants[-1]
        thumb = next((v for v in variants if v['width'] >= min(960, full['width'])), full)
        original_url = full['url']
        if allow_downloads:
            original_name = f'{photo_id}{source.suffix.lower()}'
            shutil.copyfile(source, output / 'originals' / original_name)
            original_url = f'originals/{original_name}'
        captions = metadata.get('captions', {})
        result.append({'id': photo_id, 'name': source.name,
                       'alt': str(captions.get(source.name, source.stem.replace('-', ' ').replace('_', ' '))),
                       'width': full['width'], 'height': full['height'],
                       'originalWidth': original_width, 'originalHeight': original_height,
                       'preview': full['url'], 'thumbnail': thumb['url'],
                       'srcset': ', '.join(f"{v['url']} {v['width']}w" for v in variants),
                       'original': original_url, 'bytes': source.stat().st_size,
                       '_source': source})
        print(f'  {index + 1}/{len(files)} {source.name}')
    return result


def make_archives(images, output, slug, part_mb):
    if not images:
        return []
    # Prebuilt ZIPs avoid fetching and zipping originals in a mobile browser.
    if float(part_mb) < 0:
        raise ValueError('zipPartMB must be 0 for one complete ZIP, or a positive part size.')
    limit = max(1, float(part_mb)) * MIB if float(part_mb) else float('inf')
    parts, current, total = [], [], 0
    for image in images:
        if current and total + image['bytes'] > limit:
            parts.append(current)
            current, total = [], 0
        current.append(image)
        total += image['bytes']
    if current:
        parts.append(current)
    folder = output / 'downloads'
    folder.mkdir(exist_ok=True)
    archives = []
    for index, part in enumerate(parts):
        # Content hash changes when photos, order or filenames change.
        digest = hashlib.sha256(''.join(p['id'] for p in part).encode()).hexdigest()[:10]
        suffix = f'-part-{index + 1:02d}' if len(parts) > 1 else ''
        name = f'{slug}{suffix}-{digest}.zip'
        with zipfile.ZipFile(folder / name, 'w', compression=zipfile.ZIP_STORED) as archive:
            for photo in part:
                archive.write(photo['_source'], arcname=photo['name'])
        archives.append({'name': name, 'url': f'downloads/{name}', 'bytes': (folder / name).stat().st_size, 'count':len(part)})
    return archives


def icon(name, prefix):
    return f'<svg class="icon {name}" aria-hidden="true"><use href="{prefix}assets/icons.svg#{name}"></use></svg>'


def render_page(template, output, site, meta, images, archives, prefix, page_id, portfolio=False):
    title = str(meta.get('title') or ('Portfolio' if portfolio else page_id.replace('-', ' ').title()))
    description = str(meta.get('description', 'A curated collection of beautiful photography'))
    downloads = bool(meta.get('downloads', not portfolio)) and bool(images)
    cover_name = str(meta.get('cover', ''))
    if cover_name and not any(p['name'] == cover_name for p in images):
        raise ValueError(f'Cover photo "{cover_name}" is missing in {page_id}. Use a filename from that gallery’s images folder.')
    cover = next((p for p in images if p['name'] == cover_name), images[0] if images else None)
    position = focus(meta.get('coverPosition', '50% 50%'))
    overlay = float(meta.get('coverOverlay', .08))
    if not 0 <= overlay <= 1:
        raise ValueError('coverOverlay must be between 0 and 1.')
    brand = f'<span class="wordmark"><strong>{esc(site["name"])}</strong><small>{esc(site.get("tagline", "Photography"))}</small></span>'
    home = prefix or './'
    portfolio_only = f'<button class="icon-button" data-action="about" aria-label="About {esc(site["name"])}" title="About">{icon("info",prefix)}</button>' if portfolio else ''
    def action(name, label, symbol=None):
        badge = '<span class="badge" data-favourite-count hidden></span>' if name == 'favourites' else ''
        return f'<button class="icon-button" data-action="{name}" aria-label="{label}" title="{label}">{icon(symbol or name,prefix)}{badge}<span class="action-label">{label}</span></button>'
    controls = f'<a class="icon-button" href="{home}" aria-label="Portfolio home" title="Portfolio home">{icon("home",prefix)}</a>'
    controls += action('favourites','Your favourites','heart') + action('share','Share gallery')
    if downloads:
        controls += action('download','Download gallery')
    controls += action('help','Gallery help') + portfolio_only
    mobile = f'<a href="{home}">{icon("home",prefix)} Home</a><button data-action="favourites">{icon("heart",prefix)} Your favourites</button><button data-action="share">{icon("share",prefix)} Share gallery</button>'
    if downloads:
        mobile += f'<button class="mobile-download" data-action="download">{icon("download",prefix)} Download gallery</button>'
    mobile += f'<button data-action="help">{icon("help",prefix)} Help</button>'
    if portfolio:
        mobile += f'<button data-action="about">{icon("info",prefix)} About</button>'
    if site.get('email'):
        mobile += f'<a href="mailto:{esc(site["email"])}">{icon("mail",prefix)} Contact</a>'
    if site.get('instagram'):
        mobile += f'<a href="{esc(site["instagram"])}" target="_blank" rel="noopener">{icon("instagram",prefix)} Instagram</a>'
    hero_img = f'<img class="cover-image" src="{esc(cover["preview"])}" srcset="{esc(cover["srcset"])}" sizes="100vw" alt="" fetchpriority="high" width="{cover["width"]}" height="{cover["height"]}">' if cover else ''
    hero = f'''<section class="cover" aria-labelledby="gallery-title" style="--cover-position:{position};--cover-overlay:{overlay}">
      {hero_img}<div class="cover-frame"><div class="cover-content"><a class="cover-brand" href="{home}" aria-label="{esc(site['name'])} portfolio">{brand}</a>
      <h1 id="gallery-title">{esc(title)}</h1><p>{esc(description)}</p><a class="view-images" href="#images" aria-label="View images"><span>View Images</span>{icon('down',prefix)}</a></div></div></section>'''
    header = f'''<header id="images" class="gallery-header"><div class="header-row">
      <a class="header-brand" href="{home}" aria-label="{esc(site['name'])} portfolio">{brand}</a>
      <nav class="tabs" aria-label="Image collections"><button class="tab" data-filter="all" aria-pressed="true">Images</button><button class="tab" data-filter="favourites" aria-pressed="false">Favourites</button></nav>
      <nav class="header-actions" aria-label="Gallery actions">{controls}</nav>
      <button id="menu-toggle" class="menu-toggle icon-button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Gallery menu">{icon('menu',prefix)}</button>
      </div><nav id="mobile-menu" class="mobile-menu" aria-label="Mobile gallery actions" hidden>{mobile}</nav></header>'''
    cards = []
    for i, p in enumerate(images):
        file_download = f'<a href="{esc(p["original"])}" download="{esc(p["name"])}" aria-label="Download {esc(p["name"])}" title="Download">{icon("download",prefix)}</a>' if downloads else ''
        loading = 'eager' if i < 4 else 'lazy'
        ratio = p['width']/p['height']
        cards.append(f'''<article class="photo" data-id="{p['id']}" data-ratio="{ratio}" style="--ratio:{p['width']}/{p['height']}">
          <a class="photo-link" href="{esc(p['preview'])}" data-id="{p['id']}" data-pswp-width="{p['width']}" data-pswp-height="{p['height']}" data-pswp-srcset="{esc(p['srcset'])}" aria-label="Open {esc(p['name'])}">
          <img src="{esc(p['thumbnail'])}" srcset="{esc(p['srcset'])}" sizes="(max-width:900px) calc(50vw - 10px), (max-width:1700px) 25vw, 20vw" alt="{esc(p['alt'])}" width="{p['width']}" height="{p['height']}" loading="{loading}" decoding="async"></a>
          <div class="photo-controls"><button data-favourite="{p['id']}" aria-pressed="false" aria-label="Favourite {esc(p['name'])}" title="Favourite">{icon('heart',prefix)}</button>{file_download}<button data-share-photo="{p['id']}" aria-label="Share {esc(p['name'])}" title="Share">{icon('share',prefix)}</button></div></article>''')
    empty = '' if images else '<div class="empty-state">No photographs have been added yet.</div>'
    download_strip = f'<div class="download-strip"><button class="text-download" data-action="download">{icon("download",prefix)} Download gallery</button></div>' if downloads else ''
    # Native ZIP links also work without JavaScript.
    no_script_downloads = '<noscript><div class="download-strip">' + ''.join(f'<a class="text-download" download href="{esc(a["url"])}">Download ZIP {i+1}</a>' for i,a in enumerate(archives)) + '</div></noscript>' if archives else ''
    contact = f'<span class="footer-separator">•</span><a class="contact-footer" href="mailto:{esc(site["email"])}">{esc(site["email"])}</a>' if site.get('email') else ''
    footer = f'<footer class="gallery-footer">©{datetime.now(timezone.utc).year} <a href="{home}">{esc(site["name"])}</a>{contact}</footer>'
    body = hero + header + '<main aria-label="Photographs"><div id="photo-grid" class="photo-grid">' + ''.join(cards) + '</div>' + empty + '<p id="no-favourites" class="empty-state" hidden>No favourites yet. Open a photo and tap the heart.</p>' + download_strip + no_script_downloads + '</main>' + footer
    page_data = {'id':page_id, 'title':title, 'description':description, 'downloads':downloads,
                 'site':{key:site.get(key,'') for key in ('name','email','instagram','about')},
                 'images':[{k:v for k,v in p.items() if not k.startswith('_')} for p in images], 'archives':archives}
    encoded = json.dumps(page_data, ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    page = template.replace('href="assets/', f'href="{prefix}assets/').replace('src="assets/', f'src="{prefix}assets/')
    page = page.replace('<title>Sajal · Photography</title>', f'<title>{esc(title)} | {esc(site["name"])} Photography</title>')
    page = page.replace('content="Photography by Sajal."', f'content="{esc(description)}"')
    robots = '<meta name="robots" content="noindex,nofollow">' if not portfolio else ''
    page = page.replace('<!--HEAD-->', robots).replace('<!--PAGE-->',body).replace('{"setup":true}',encoded)
    (output / 'index.html').write_text(page,encoding='utf-8')
    return page_data


def build(root=ROOT, out=None):
    root = Path(root).resolve()
    output = Path(out).resolve() if out else root / '_site'
    # Only recreate the one generated output tree; never remove source directories.
    if output == root or output in root.parents or (output.exists() and output.is_symlink()):
        raise ValueError('Unsafe build output path.')
    if output.name != '_site':
        raise ValueError('Build output directory must be named _site.')
    if any(p.is_symlink() for p in (root/'assets',root/'portfolio',root/'galleries') if p.exists()):
        raise ValueError('Source directories cannot be symbolic links.')
    site = read_json(root/'site.json')
    if not isinstance(site,dict) or not site.get('name'):
        raise ValueError('site.json needs your name.')
    if site.get('instagram') and urlparse(site['instagram']).scheme != 'https':
        raise ValueError('Instagram must be a full https:// URL or an empty string.')
    if any(c in site.get('email','') for c in '\r\n<>'):
        raise ValueError('Invalid email in site.json.')
    template = (root/'index.html').read_text(encoding='utf-8')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    shutil.copytree(root/'assets',output/'assets')
    (output/'.nojekyll').touch()
    if (root/'CNAME').exists():
        shutil.copyfile(root/'CNAME',output/'CNAME')
    total_photos = 0
    portfolio_meta = site.get('portfolio',{})
    print('Portfolio')
    portfolio_images = process_images(photo_files(root/'portfolio',portfolio_meta),output,portfolio_meta,bool(portfolio_meta.get('downloads',False)))
    archives = make_archives(portfolio_images,output,'portfolio',site.get('zipPartMB',0)) if portfolio_meta.get('downloads') else []
    render_page(template,output,site,portfolio_meta,portfolio_images,archives,'','portfolio',portfolio=True)
    total_photos += len(portfolio_images)
    galleries = []
    for folder in sorted((root/'galleries').iterdir()) if (root/'galleries').exists() else []:
        if folder.name.startswith('.') or not folder.is_dir():
            continue
        if folder.is_symlink() or not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*',folder.name):
            raise ValueError(f'Gallery folder "{folder.name}" must use lowercase letters, numbers and hyphens, without spaces.')
        meta = read_json(folder/'gallery.json')
        if meta.get('draft',False):
            continue
        files = photo_files(folder/'images',meta)
        if not files:
            print(f'Skipping empty gallery: {folder.name}')
            continue
        print(f'Gallery: {folder.name}')
        target = output/'gallery'/folder.name
        target.mkdir(parents=True)
        images = process_images(files,target,meta,bool(meta.get('downloads',True)))
        archives = make_archives(images,target,folder.name,site.get('zipPartMB',0)) if meta.get('downloads',True) else []
        render_page(template,target,site,meta,images,archives,'../../',folder.name)
        total_photos += len(images)
        galleries.append({'slug':folder.name,'title':meta.get('title',folder.name),'url':f'gallery/{quote(folder.name)}/','images':len(images)})
    # Gallery inventory is printed for the owner, never published as a directory.
    total = sum(p.stat().st_size for p in output.rglob('*') if p.is_file())
    max_size = min(float(site.get('maxSiteMB',950)),950)*MIB
    if total > max_size:
        raise ValueError(f'Published site is {total/MIB:.1f} MB; configured limit is {max_size/MIB:.0f} MB. Remove an old gallery or export smaller JPEGs.')
    print(f'Built {len(galleries)} client galleries and {total_photos} images; published size {total/MIB:.1f} MB.')
    for gallery in galleries:
        print(f'  Share: <your-site>/{gallery["url"]}')
    return {'galleries':galleries,'photos':total_photos,'bytes':total,'output':str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--out',type=Path)
    args = parser.parse_args()
    try:
        build(args.root,args.out)
    except Exception as exc:
        print(f'\nBUILD FAILED: {exc}',file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
