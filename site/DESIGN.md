# Public site

The site serves developers who want to try Srcly on their own code, and readers who want to know how it works.
Its look comes from Srcly itself: the page is drawn like a scan.

## The scope motif

- Each landing section is a treemap scope: a 1px frame with a mono header strip (`views/`).
- The strip's right side names the part of Srcly's source that implements the section, with its real LOC and maximum complexity from `src/data/tree.json`, and links to it on GitHub. These numbers are never typed by hand.
- Blocks inside a section share 1px rules like treemap tiles (`.steps`, `.views`, `.workflows`). Do not use floating cards with gaps or shadows.
- The hero is a real treemap of Srcly's own source at the captured revision, with the headline in a label block cut into it.

## Tokens

- Light follows the app's DESIGN.md (Precision Light Console): canvas `#f4f6f9`, paper `#fff`, ink `#0f172a`, rules `#e2e8f0` and `#cbd5e1`, links `#2563eb`.
- Dark is ink: canvas `#0b1220`, paper `#0f172a`, links `#8ab4ff`. The heat ramp stays the same, so tiles read the same in both themes.
- Heat ramp: Srcly's `TREEMAP_RAMP` (`#bfdbfe` → `#e9eef3` → `#fcd34d` → `#fb923c` → `#f87171`), sampled with the app's Lab interpolation in `src/treemap.tsx`. Use it only for data marks: tiles, swatches, the legend, the logo.
- N/A is gray diagonal hatching, never a ramp color.
- Type: Inter for prose; IBM Plex Mono for paths, numbers, scope names and commands.

## Content rules

- Every claim matches the code. Metric definitions come from the catalog; command output comes from a real run.
- Screenshots come from `scripts/capture.mjs`. Captions name the subject and revision.
- The site must not imply that it scans visitor files, or that a missing measurement is 0.
- "How I built it" is Byron's voice. Keep its first-person claims to what the project page and its posts support.

## Docs pages

- Navigation groups: Discover, Use Srcly, and Automate & configure.
- Keep the page title, summary, and edit link in one heading area.
- Search results show matching text and link to the matching section.
- Screenshot figures open at full size; the image link still works without JavaScript.
