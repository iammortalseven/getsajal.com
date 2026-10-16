# Validation and reference notes

Prepared 16 October 2026 for Sajal's existing GitHub Pages photography site.

## Reference inspected

https://804420.lightfolio.com/gallery/anna-henrique/

The live desktop cover, masonry gallery and full-screen viewer were inspected. The page's public responsive styles were inspected for phone/tablet breakpoints. The reference identifies its cover as Berlin and uses PhotoSwipe 5.4.4, Abril Fatface and Raleway. This package uses that same open-source viewer version and those fonts, self-hosted with their licences, plus independently written site/generation code.

Implemented: inset cover frame, desktop left-aligned and mobile centred text, responsive cover crop/focal point, 4 masonry columns at typical desktop widths, 2 columns at phone/tablet widths, 20px/10px image gaps, sticky white header, collapsed phone menu, white viewer, circular desktop toolbar icons, touch-friendly controls, favourites, sharing, original downloads, and prebuilt gallery ZIPs.

The requested download action appears in the desktop header, the mobile menu and below the gallery. The default is one complete ZIP. The viewer offers individual downloads on both phone and desktop. Optional ZIP splitting is available, but is off by default.

## Automated checks passed

- Python and JavaScript syntax; JSON settings parsed.
- Homepage uses only portfolio images. Client galleries are not listed on it.
- Empty galleries and galleries marked as drafts are omitted.
- Every generated asset/image/download link resolves within the published output, including project-site relative paths.
- Image preview dimensions match their HTML/PhotoSwipe metadata; longest edge is capped at 2560px.
- EXIF-rotated images get the correct display orientation and dimensions.
- Source photographs remain unchanged. Original downloads and files extracted from ZIPs match the uploaded files byte for byte.
- Filenames with spaces and Unicode work; originals retain their names inside ZIPs.
- One-ZIP gallery delivery and optional multi-part ZIP delivery both produce the expected files.
- A fresh build removes a deleted gallery's page, previews, original files and ZIPs.
- Missing cover filenames fail with an actionable error, and unsafe build output paths are rejected.
- Masonry placement arithmetic at phone, tablet and desktop widths keeps images within the grid with the intended gaps.
- DOM simulation: menu expansion/collapse, download dialog links, local favourites and filter/empty state, share-link generation.
- DOM simulation with actual PhotoSwipe 5.4.4: viewer opens, per-photo original download links update on navigation, favourites and info dialog work, shared image hashes open the correct image, filtered favourites open the correct collection, and closing restores URL history.

## Verification limits

The supplied source contained no photographs. Test images were generated only for validation and are not included as portfolio/client content.

The generated site was not visually rendered in a real browser in this environment. DOM simulation does not verify rendered layout, gestures, real Safari downloads or phone safe areas. No claim of a verified pixel-perfect desktop/mobile clone is made. The reference's mobile rules were read, but its phone layout was not directly viewed on a phone viewport.

Before sharing the first client gallery, deploy with a few of your photos and check it on your own phone and desktop: cover crop, both grid columns, swipe/pinch zoom, a single-photo download and the complete ZIP. Lightfolio's proprietary client accounts, shared comments and emailed ZIP delivery are outside this static GitHub Pages implementation.
