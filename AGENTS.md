# AGENTS.md

Guidance for AI agents (and humans) working on this repo.

## What this is

**Sequences** is a local-first web app for sequencing a photobook: photos go
into a tray, get dragged onto book spreads, and the result can be flipped
through like a printed dummy. React 18 + TypeScript + Vite, **no backend** —
all data lives in the browser's IndexedDB. Live at
<https://sequences.kelupus.com/> (GitHub Pages).

The product's frame of reference is bookmaking: spreads (펼침면), verso/recto,
folios, full bleed vs margin layouts, dummy books. Keep that vocabulary.

## Commands

```bash
npm run dev          # dev server
npx tsc --noEmit     # typecheck (run before committing)
npx vite build       # production build (run before pushing)
```

There are no unit tests. Verification is browser-driven — see below.

## Architecture

State lives in `App.tsx`; everything else is presentational or a thin module.

- `src/types.ts` — data model. `Project` → `Spread[]` → left/right `PageState`
  (`photoId` + `layout: 'full' | 'margin'`). Page ratio is width/height.
- `src/db.ts` — IndexedDB (`sequences` DB, `photos` + `project` stores).
  Project saves are debounced 300ms in App.
- `src/images.ts` — import pipeline. Originals are stored as-is; a ≤600px JPEG
  thumbnail is generated per photo. **The UI renders thumbnails only**;
  originals are used by `pdf.ts` (export) and `projectFile.ts` (save file).
- `src/photoStore.ts` — in-memory photo view (`Map<id, {…, thumbUrl}>`).
  `thumbUrl` is an object URL — revoke on delete/replace to avoid leaks.
- `src/dnd.ts` — module-level drag payload. Needed because
  `dataTransfer.getData()` is unavailable during `dragover`.
- `src/components/FlipPreview.tsx` — dummy-book mode. Page turns are a 3D
  "leaf": front face = outgoing page, back face = incoming page, rotating
  around the spine; the landing side shows the target spread underneath.
  Commit happens on `animationend` (filtered to the leaf element itself)
  with a 900ms `setTimeout` safety net. Input is ignored mid-turn.
- `src/i18n.ts` — dictionary-based i18n (ko/en/ja). **Every user-visible
  string must go through `t()` and have all three languages.** Locale is
  auto-detected, persisted in localStorage.
- `src/projectFile.ts` — save/load format:
  `{ format: 'sequences-project', version: 1, project, photos[] }` with
  photos as base64 data URLs (original + thumb). If you change the shape,
  bump `version` and keep older versions loadable.

## Design system

The aesthetic is a **dimmed print-viewing room**: near-black warm chrome that
recedes, paper and photographs as the subject. Tokens are in `styles.css`
`:root`. Rules that keep it coherent:

- One accent only (safelight amber `--accent`) — for drag targets, active
  states, progress. Don't introduce new accent colors.
- Anything numeric or archival (page labels, folios, counts, tray label) is
  IBM Plex Mono. Brand wordmark is Instrument Serif italic. UI text is
  Space Grotesk.
- Paper physicality: grain overlay, fold/crease shadows, prints that lift
  slightly on hover. Resting prints sit flat (no shadow) — shadow appears
  only on hover as the pick-up affordance.

## Hard-won gotchas

- **Never size page images with percentage max-height.** The page's height
  comes from `aspect-ratio`, and percentage sizing creates a feedback loop
  that overflowed portrait images at square ratios. Page images are
  absolutely positioned (`inset: 0` cover / `inset: 8%` contain). Keep it
  that way.
- **Crease shadows differ by view on purpose.** Edit strip and overview use a
  single container-level `::after`; the flip preview gives each page its own
  spine-side shadow (`.preview-page.left/right::after`) so the shadow travels
  with the turning leaf instead of popping back in on landing. If you touch
  one, check the other still matches visually.
- `pdf.ts` renders each page to a canvas (cover-crop for full bleed) because
  jsPDF can't crop. Grayscale is a viewing aid only — never applies to PDF.
- React 18 StrictMode double-mounts effects in dev; effects here are written
  to be idempotent. Keep new effects cleanup-safe.

## Verifying changes in a browser

- Real CDP mouse drags do **not** trigger HTML5 drag-and-drop. Test DnD with
  synthetic events: create a `DataTransfer`, `Object.defineProperty` it onto
  `DragEvent`s, and dispatch `dragstart → dragover → drop → dragend`.
  Waits (~150ms) are needed between drops — React re-renders the tray.
- `window.confirm` / `alert` are native modals that freeze browser
  automation. Override them (`window.confirm = () => true`) before driving
  reset/load flows.
- **Don't test destructive flows against the user's data.** IndexedDB is
  per-origin: start a second dev server on another port
  (`vite --port 5198`) and test there.
- To inspect a page-turn mid-animation: slow the animation via injected
  style, pause with negative `animation-delay` + `animation-play-state:
  paused`, and defer the 900ms safety timeout — otherwise it commits under
  you.

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) typechecks,
builds at root base, writes `dist/CNAME`, deploys to GitHub Pages. Custom
domain `sequences.kelupus.com` is a DNS-only CNAME to `longfin.github.io` in
Cloudflare. Don't reintroduce `--base=/sequences/` — the custom domain serves
from the root.
