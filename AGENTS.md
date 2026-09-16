# AGENTS.md

Guidance for AI agents (and humans) working on this repo.

## What this is

**Sequences** is a local-first web app for sequencing a photobook: photos go
into a tray, get dragged onto book spreads, and the result can be flipped
through like a printed dummy. React 18 + TypeScript + Vite, **no backend of
our own** — all data lives in the browser (IndexedDB; the sync session and
merge bases in localStorage). Optional cross-device
sync goes through Jazz Cloud (see "Sync" below) and is compiled out unless a
key is configured. Live at <https://sequences.kelupus.com/> (GitHub Pages).

The product's frame of reference is bookmaking: spreads (펼침면), verso/recto,
folios, full bleed vs margin layouts, dummy books. Keep that vocabulary.

## Commands

```bash
npm run dev          # dev server
npx tsc --noEmit     # typecheck (run before committing)
npm test             # two-device sync suite (Playwright; starts its own servers)
npx vite build       # production build (run before pushing)
```

There are no unit tests; `npm test` is an end-to-end suite for sync only.
Everything else is verified in a browser — see below.

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
  `{ format: 'sequences-project', version: 2, project, photos[] }` with
  photos as base64 data URLs (original + thumb + `hasOriginal`). If you
  change the shape, bump `version` and keep older versions loadable.

## Sync (optional, `src/sync/`)

Enabled only when `VITE_JAZZ_API_KEY` (Jazz Cloud) or `VITE_JAZZ_SYNC_PEER`
(a `ws://` sync server, used by the tests) is set at build time. `src/sync/index.ts`
is the only module App imports; it exposes `SYNC_ENABLED`, `React.lazy`
wrappers, an error boundary and the status store, so jazz-tools (~1.2MB) is
a separate chunk that never loads for builds without a key, and App paints
before it. Everything that imports jazz-tools sits behind `src/sync/jazz.tsx`;
the Sync toolbar menu is portalled into a slot App renders.

**The contract: sync moves thumbnails and never destroys an original.**

- What syncs: the project document (one JSON string, last-write-wins) and
  the ≤600px thumbnails, inline as base64 in each record entry (one CoValue
  per photo, so an entry that has loaded is complete; the earlier
  `FileStream` form is still read). `PhotoRecord.hasOriginal` is false
  for photos that arrived this way; PDF export warns, and loading a save
  file never replaces a held original with a thumbnail-only record. Save
  files are `version: 2` (adds `hasOriginal`; v1 files whose blob equals
  the thumb are treated as thumbnail-only).
- Deletes are tombstones (`deleted: true` on the record entry), never key
  removal, so an offline device can't resurrect a photo. On another device a
  tombstone unplaces the photo; a thumbnail-only copy is then removed (in
  one IndexedDB transaction, so a record another tab just wrote is never
  swept), a held original stays in the tray with a "deleted" chip. Placing a
  photo again revives it, but only a photo the user placed on *this* device
  (`placedHere`), never an id inherited from a pulled project. A delete
  before the entry exists is remembered and applied once when the upload
  lands; a delete while logged out is not remembered (the thumbnail comes
  back on the next login). Jazz has no CoValue delete; cloud storage only
  grows.
- A device that synced the account before (it has a merge base) decides
  only while the server peer is open and has reported the root's state;
  otherwise the phase is `blocked` with `offline` status, re-checked every
  2s, and a short grace follows a reconnect so newer server state can
  arrive. A first contact whose root looks blank waits up to 6s for content
  before believing it (the creator of the account is exempt).
- Two Jazz-level races are handled explicitly: the account migration waits
  for the server before concluding "no root" on a login (it would otherwise
  create a second, empty root that wins by LWW), and if the running account
  ever differs from the stored credentials the bridge does not sync and
  reloads once so Jazz restarts from the credentials.
- Tabs on one origin share the session and IndexedDB but run their own
  bridge. Reset / Load / sign-out post a `BroadcastChannel` event
  (`src/sync/status.ts`): other tabs log out too and reload after the store
  was replaced.
- The cloud document is an envelope `{ v, project }`. A build that meets a
  newer `v` pauses sync on that device (`incompatible` status) and never
  overwrites the document.
- `useProjectSync.ts` resets all bookkeeping when the account id changes.
  On first load per account the bootstrap decides **imperatively** (it
  pushes or applies right away so the incremental effects can't reverse
  it), using the last agreed JSON (`sequences-sync-base:<account>` in
  localStorage): equal → nothing; this device unchanged since last sync →
  cloud wins; cloud empty, untouched (no placed photos) or unchanged since
  last sync → this device wins; this device has no placed photos → cloud
  wins; both changed → `SyncMergeDialog`. An empty account plus local
  traces of another account (thumbnail-only photos, another account's
  base) asks before uploading. The dialog is modal and focus-trapped,
  nothing destructive is pre-focused, Esc returns to Cancel, the app is
  `inert` behind it. Either merge choice keeps all photos; only the
  sequence is chosen.
- A tombstone for a photo this device keeps (it holds the original) is
  shown as a tray chip ("deleted elsewhere"); placing it again revives it.
- Reset and Load are this-device operations: when signed in they log out
  first (abort if that fails), forget the merge bases, and leave the cloud
  untouched.
- Status for the toolbar and the busy indicator comes from
  `src/sync/status.ts` (no jazz import), written by the bridge.
- Auth is passkey (WebAuthn; the secret seed lives in the credential's
  `user.id`, so iCloud Keychain carries it to the iPad) or a BIP39 recovery
  phrase. Jazz keeps the account secret as plaintext JSON in localStorage
  (`jazz-logged-in-secret`). Nothing is uploaded before sign-in
  (`sync.when: 'signedUp'`).
- Known limits: uploads in a background tab crawl (~100KB/s) because Chrome
  throttles the library's per-chunk `setTimeout`; jazz-tools is pinned to
  the 0.20 line while jazz.tools docs describe the 2.0 alpha API.
- A sequence with no placed photos is never pushed onto an empty account,
  at bootstrap or by the push effect (photos still upload through the photo
  effect): another device's first push may still be in flight and
  last-write-wins would let the blank win. A local edit that is waiting for
  the push debounce is not overwritten by a remote change that arrives
  meanwhile (the user's action wins).
- The "Sync error" fallback (error boundary) offers reload first; leaving
  the account is a second button behind a confirm that shows the recovery
  phrase derived from the stored seed.
- Testing: `npm test` runs `e2e/sync.spec.ts` with Playwright against a local
  in-memory `jazz-run sync` server and a **production build** served by
  `vite preview` (see `playwright.config.ts`; the dev server's StrictMode
  double effects make Jazz create two anonymous accounts per page and the
  credentials can name the wrong one). Each test opens separate browser
  contexts as devices and drives the real UI with the recovery-phrase path
  (passkeys can't be automated). `E2E_CONSOLE=1` echoes browser console
  lines. For manual testing, two dev servers on different ports act as two
  devices.

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
