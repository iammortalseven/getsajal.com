# Sajal — portfolio and photoshoot galleries

This replaces your old single HTML page with a complete GitHub Pages project. The design follows the supplied Lightfolio Berlin gallery: full-height framed cover, Abril Fatface/Raleway typography, sticky white navigation, uncropped masonry photographs, two columns on phones, a collapsible mobile menu, and a white full-screen image viewer.

The viewer uses **PhotoSwipe 5.4.4**, the same version observed on your reference. Swipe, pinch zoom, double-tap, keyboard arrows, zoom transitions and swipe-to-close come from that engine. Each shoot uses the same shared CSS and JavaScript. This is an independent recreation, not Lightfolio's proprietary code or a Lightfolio account. Their logo, sample photographs, client accounts, server-side comments and emailed download delivery are not included. Favourites are local to each visitor's browser.

## 1. Prepare your photos

- Put the photos you want on your **homepage** directly inside `portfolio/` in the project root. Nothing in `images/` from your old site is used automatically; copy your chosen pictures into `portfolio/`.
- Use JPEG, PNG or WebP. Export RAW/HEIC/TIFF as JPEG first. Avoid putting both thumbnail and full-size versions in these folders: every supported image becomes one gallery photo.
- For client galleries, put **full-resolution exported JPEGs** in that shoot's `images/` folder. The builder creates smaller browsing images and keeps downloads byte-for-byte identical to those exports. It never modifies your source files.
- Export in sRGB for predictable colour. Preview generation honours orientation and converts supported embedded colour profiles to sRGB. Browsing previews omit EXIF; original downloads retain whatever metadata was in your upload.
- Files appear in natural filename order: `001.jpg`, `002.jpg`, `010.jpg`. An optional `order` array can override this.

## 2. Personalise `site.json`

Your name is already Sajal. Set `email` and `instagram` if you want contact links; empty values hide those links. Instagram should be a complete HTTPS URL.

Under `portfolio`, edit the title/description if desired. Leave `cover` empty to use the first portfolio photograph, or set it to an exact filename such as `001.jpg`. The homepage displays only `portfolio/` photos. Client galleries are never listed on it.

The `coverPosition` value chooses the photo's focal point when cropped to the screen: `"50% 50%"` is centred; `"50% 30%"` favours the upper part. Adjust it for portraits that crop awkwardly on phones. `coverOverlay` is a black tint from `0` to `1`; the default `0.08` is subtle. You can set it to `0` to match an untinted image.

Portfolio downloads are off by default. Client gallery downloads are on.

## 3. Upload to your existing GitHub Pages repository

1. Download and extract this ZIP on your computer. Keep a backup of your old site.
2. Open the extracted `sajal-gallery` folder. Copy **its contents** into your existing repository root. Replace the old `index.html`. Include `assets/`, `scripts/`, `site.json`, `requirements.txt`, and **`.github/workflows/pages.yml`**. Do not put an extra `sajal-gallery/` wrapper folder inside your repository.
3. Add your photos to the relevant folders. Keep your existing `CNAME` file if you use a custom domain; the builder preserves it. Your old `images/` folder can remain temporarily, but it will not be published or used by this template.
4. In the GitHub repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. This step is essential: do not leave it on “Deploy from a branch”.
5. Commit/push the files to `main` or `master`. If your default branch has a different name, change the branch list at the top of `.github/workflows/pages.yml`.
6. Open **Actions → Build and publish photography galleries**. Wait until **both build and deploy** are green. The deploy job shows the final site URL. To retry without changing files, use **Run workflow** on this workflow.

No Node.js, npm, database, API keys or server account are needed for your live site. GitHub installs the Python image builder during deployment. You do not need Python on your own PC unless you want the optional local helpers.

If using GitHub's web interface, use **Add file → Upload files** and drag the extracted files and folders, including `.github`. For larger photo sets, GitHub Desktop is more convenient. Do not upload the ZIP itself as your website: GitHub will not extract it for you. GitHub web uploads have a smaller per-file limit than Git commits; use GitHub Desktop for larger images.

Your normal portfolio address stays the same. This works with both `username.github.io` and `username.github.io/repository-name/`, and with a custom domain. All assets and downloads use relative paths.

## 4. Add a photoshoot gallery

Duplicate `galleries/example-shoot/`, rename the folder to something like `holly-wild-2026-10-16`, put the exported images directly inside its `images/` folder, and edit its `gallery.json`:

```json
{
  "title": "Holly Wild",
  "description": "The Lansdowne · 16 October 2026",
  "cover": "001.jpg",
  "coverPosition": "50% 50%",
  "coverOverlay": 0.08,
  "downloads": true,
  "draft": false
}
```

Use lowercase letters, numbers and hyphens in folder names. Titles can contain spaces and other characters. You may leave `cover` empty to use the first photo. The empty example folder is skipped automatically; it does not create a live gallery.

Commit/push, wait for the successful deployment, then share:

`YOUR-EXISTING-SITE/gallery/holly-wild-2026-10-16/`

Include the trailing slash. For a project site, keep its repository segment, for example `https://USERNAME.github.io/REPOSITORY/gallery/holly-wild-2026-10-16/`.

You can have two, three or more live shoots. **Never duplicate HTML/CSS for a shoot**: they all use this same template. To add more photos to an existing shoot, add them to that gallery's `images/` folder and commit/push.

Optional on Windows: with Python installed, double-click `NEW-GALLERY.cmd`. It asks for a title, link name and exported-photo folder, then copies the images and creates the metadata for you. It does not upload or publish anything.

### Optional ordering and accessible descriptions

Add these extra properties to an individual `gallery.json` (or the `portfolio` object in `site.json`) if useful:

```json
"order": ["003.jpg", "001.jpg"],
"captions": {
  "003.jpg": "Holly singing under blue stage lights",
  "001.jpg": "The audience at The Lansdowne"
}
```

Listed photos appear first, then the remaining photos in filename order. The builder reports missing filenames instead of silently choosing something else. Descriptions are used as image alt text; the viewer displays filenames to make client selections easy.

## 5. How downloads work

**Entire gallery:** the header's download arrow, the phone menu's “Download gallery”, or the button below the grid opens a download panel. Its “Download all photos” link downloads a ZIP containing the full-resolution files with their original filenames. This is a ready-made file, so the visitor's device does not have to fetch every photo and build a ZIP in memory.

By default, **one ZIP contains the whole gallery** (`"zipPartMB": 0` in `site.json`). The file is prepared during deployment and downloads directly, including on phones. If you later prefer smaller downloads, set `zipPartMB` to a positive number such as `85` to split large galleries into independent ZIPs around 85 MB. The panel then clearly lists every part; visitors need every part for the whole gallery. One photo larger than the chosen part size goes into its own ZIP.

**One photo:** open the image, then tap the download arrow in the viewer. On a computer, you can also use the download arrow that appears when hovering over a grid image. These links download the original export, not the reduced WebP preview.

**iPhone/iPad:** Safari normally saves downloads to **Files → Downloads**; the files do not automatically appear in Photos. Open/extract the ZIP in Files, select the extracted JPEGs, then use Share → Save Images where offered. Browser and OS settings can change the exact save prompt. A static website cannot silently write into somebody's Photos library.

## 6. Remove an old gallery

1. Delete that shoot's entire folder under `galleries/`, including its `images/` and `gallery.json`.
2. Commit/push the deletion. If using GitHub Desktop, review the deleted files and push the commit.
3. Wait for the successful **deploy** job. The next clean build omits its page, previews, originals and ZIPs.
4. Its old link then returns a not-found page after hosting caches refresh. Photos already downloaded by visitors remain on their devices.

Setting `"draft": true` also omits the gallery from publication, but leaves its source photos in your repository. Deleting source files does not erase them from Git history. It frees the next published site's space, while repository history can still grow over time. Never upload private client files to a public repository expecting removal to erase the history.

## 7. Optional local preview on your Windows laptop

1. Install Python 3.11 or newer from python.org if it is not already installed.
2. Double-click `BUILD.cmd`. It prepares a local `.venv`, installs Pillow and builds `_site/`.
3. Double-click `PREVIEW.cmd`, leave its window open, and open `http://127.0.0.1:8000/` in your browser.
4. For a shoot, open `http://127.0.0.1:8000/gallery/YOUR-SHOOT/`.
5. Re-run `BUILD.cmd` after changing photos or metadata, then refresh the browser. Press Ctrl+C in the preview window to stop it.

Do not double-click `index.html`: the root file is a source template, and ES modules need HTTP. Do not upload `_site/`, `.venv/` or `__pycache__/`; they are ignored by Git. The action regenerates `_site/` on GitHub.

On another platform: `python -m pip install -r requirements.txt`, then `python scripts/build.py`. Serve `_site/` with your preferred local static server.

## 8. Storage, public links and practical limits

- Client galleries are **unlisted, not password-protected**. They are absent from your homepage and marked `noindex`, but anyone with the link can open/download them. A public repository also exposes the source images. A GitHub Pages site can be public even when its source repository is private. There is no authentication or secure PIN implemented here.
- Only selected portfolio files and active gallery files enter the published site; your old root `images/` folder is not copied into it.
- Published storage includes browsing previews, individual originals and ZIP copies. For example, 300 MB of delivered originals can use over 600 MB once ZIPs and previews are included. Two or three large shoots can still exceed the limit.
- The builder stops above 950 MiB (or your lower `maxSiteMB`) so it does not deploy an oversized site. Remove an old shoot or use smaller exported JPEGs. A failed build leaves the last successful website live, including any old gallery you were trying to remove, until a new deployment succeeds.
- GitHub Pages has published-size and bandwidth limits. This setup is for a modest portfolio and rotating galleries, not an unlimited photo archive. See https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits for current limits and permitted use.
- Downloads may use significant bandwidth; keep a separate backup of your exports. This site does not track whether everyone has downloaded the gallery.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Source template/setup message appears online | Set Pages Source to GitHub Actions, then run the included workflow. Do not deploy the repository root directly. |
| Photos missing from homepage | Put actual JPEG/PNG/WebP files directly in `portfolio/`, commit/push, and wait for both jobs to finish. Old `images/` references are not used. |
| Gallery link is 404 | Check the folder is `galleries/slug/images/`, contains supported files, is not a draft, and the deployment succeeded. Share `/gallery/slug/` (singular `gallery` in the live URL). |
| Cover filename error | Use the exact image filename, including case and extension, or set `cover` to an empty string. |
| Deploy fails for permissions/environment | Ensure Pages Source is GitHub Actions; check repository Actions permissions and any `github-pages` environment branch restrictions. |
| Site too large | Remove a previous gallery; original downloads and ZIPs both take space. Do not raise the cap beyond the host's limit. |
| Old gallery still opens after deleting | Verify the deletion was pushed and the deploy job succeeded, then allow caching to refresh. A failed build does not replace the live site. |
| Photo is cut off on the cover | Adjust `coverPosition`; cover images intentionally fill the screen. The masonry grid and viewer show the whole photo. |
| ZIP downloaded but no photos in camera roll | Extract it in Files/Downloads, then save selected pictures to Photos. This is normal mobile browser behaviour. |
| Favourites missing on another phone | Selections are stored in the first browser/device, not in a client account. Copy their filenames from the favourites panel if you need to send the selection. |

## Included files

| File/folder | Purpose |
| --- | --- |
| `index.html` | Shared page source used for the homepage and every gallery |
| `assets/style.css` | Reference-matched layout and responsive styling |
| `assets/app.js` | Viewer controls, downloads, local favourites, sharing, dialogs and navigation |
| `assets/vendor/` | Self-hosted PhotoSwipe 5.4.4 and its MIT licence |
| `assets/fonts/` | Self-hosted Abril Fatface and Raleway with OFL licences |
| `portfolio/` | Homepage source photographs |
| `galleries/SLUG/images/` | One shoot's full-resolution source exports |
| `galleries/SLUG/gallery.json` | That shoot's title, cover and settings |
| `scripts/build.py` | Automatic scan, responsive image creation, ZIP generation and page build |
| `.github/workflows/pages.yml` | Builds and deploys on GitHub |
| `site.json` | Branding and homepage settings |
| `BUILD.cmd`, `PREVIEW.cmd`, `NEW-GALLERY.cmd` | Optional Windows helpers |

The package contains no client photographs because none were supplied with this request. Add your own images before publishing.
