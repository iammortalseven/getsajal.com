# Portfolio

A static photo portfolio for GitHub Pages. The gallery is turned into plain HTML ahead of time, and a
small script adds the lightbox and menu. You never need to install anything on your computer: GitHub
runs the build for you when you upload photos.

```
index.html                 page shell (contact links live here)
css/styles.css             all styles
js/main.js                 menu, About dialog, lightbox, back-to-top
source/                    YOUR PHOTOS GO HERE
images/                    created automatically: resized .webp files (don't edit)
data/photos.json           created automatically: photo order + alt text (you can edit)
tools/build-gallery.mjs    the build script
github-workflow/           the automation file (set up once, see below)
```

## First-time setup (all in the GitHub website)

1. **Upload the files.** In your repo choose Add file > Upload files and drag in everything from this
   folder *except* the `github-workflow` folder: `index.html`, `css`, `js`, `tools`, `source`,
   `package.json` and `README.md`. Commit.
   (Folders that are empty don't upload, which is why `source` contains a small text file.)
2. **Add the automation.** Choose Add file > Create new file. In the name box type
   `.github/workflows/build-gallery.yml` (typing the slashes creates the folders). Paste in the contents
   of `github-workflow/build-gallery.yml` and commit.
   (This has to be typed into GitHub because folders starting with a dot are hidden on your computer
   and can't be dragged in.)
3. **Upload your photos.** Open the `source` folder in the repo, choose Add file > Upload files, and drag
   your photos in. Commit.
4. **Wait a minute or two.** Open the repo's **Actions** tab: a run called "Build gallery" starts by
   itself. When it shows a green tick, it has created `images/` and `data/` and filled in the gallery.
   GitHub Pages then updates your site a few minutes later.

If the Actions tab shows nothing after step 3 (for example because you uploaded the photos before adding
the automation), open Actions > Build gallery > Run workflow.

## Adding photos later

Upload them to the `source` folder on GitHub. That's it: the build runs by itself.

- New photos are added at the **end** of the gallery.
- To change the order, open `data/photos.json` on GitHub, click the pencil icon, move the entries around
  and commit. The build runs again.
- To remove a photo, delete it from `source`. (Its files in `images/` stay behind but aren't used.)

GitHub's website accepts up to 100 files and 25 MB per file in one upload.

## Alt text

Open `data/photos.json` on GitHub, click the pencil and fill in each `"alt"` with a short description,
for example `"alt": "Bride laughing during the first dance"`. It helps screen-reader users and search
engines. Your text is kept every time the gallery is rebuilt.

## Things to edit in `index.html`

- `you@example.com` (Contact link) -> your email address
- `https://instagram.com/yourusername` -> your Instagram URL
- The About text, and the `description` / `og:` meta tags near the top

You can edit it directly on GitHub (pencil icon). Edits outside the gallery section are never overwritten.

## Photo formats

Visitors only ever download the small `.webp` files in `images/`. Files in `source/` are just the input,
so use your best-quality JPEG/PNG exports if you have them: resizing an already-compressed `.webp`
compresses it a second time. If `.webp` is all you have, that works fine too.

## Running it on your own computer (optional)

Install Node.js (v20+), run `npm install` once, then `npm run build` in this folder. It does exactly what
the automation does.

## Notes on GitHub Pages

- Plain JavaScript runs fine on Pages; only server-side code isn't supported.
- Pages caches files for about 10 minutes, so changes can take a few minutes to show up.
- `source/` is published too. If you don't want full-size originals public, use a smaller export for
  the `source` folder.
