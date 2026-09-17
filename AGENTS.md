# AGENTS.md

Guidance for AI agents (and humans) working on this repo.

## What this is

**Sequences** is a local-first web app for sequencing a photobook: photos go
into a tray, get dragged onto book spreads, and the result can be flipped
through like a printed dummy. React 18 + TypeScript + Vite, **no backend of
our own** — all data lives in the browser (IndexedDB; the sync session,
merge bases and creator marks in localStorage). Optional cross-device
sync goes through Jazz Cloud (see "Sync" below) and is compiled out unless a
key is configured. Live at <https://sequences.kelupus.com/> (GitHub Pages).

The product's frame of reference is bookmaking: spreads (펼침면), verso/recto,
folios, full bleed vs margin layouts, dummy books. Keep that vocabulary.

## Commands

```bash
npm run dev          # dev server
npx tsc --noEmit     # typecheck (run before committing)
npm test             # two-device sync suite (Playwright; starts its own servers
                     # on 5271 / 4271 — E2E_PORT / E2E_SYNC_PORT override them)
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
  tombstone unplaces the photo — whenever it is found placed, not only the
  first time, since a pulled project can put it back; a thumbnail-only copy
  is then removed (in one IndexedDB transaction, so a record another tab just
  wrote is never swept), a held original stays in the tray with a "deleted"
  chip. Placing a photo again revives it, but only a photo the user placed on
  *this* device (`placedHere`), never an id inherited from a pulled project.
  A delete before the entry exists is remembered and applied once when the
  upload lands; a delete while logged out is not remembered (the thumbnail comes
  back on the next login). Jazz has no CoValue delete; cloud storage only
  grows.
- A device decides only while the server peer is open and has reported the
  root's state. Jazz caches CoValues, so a cached root can answer while the
  server is unreachable and "unchanged since last sync" would be a lie that
  overwrites the cloud on reconnect. Otherwise the phase is `blocked` with
  `offline` status, re-checked every 2s, and a short grace follows a
  reconnect so newer server state can arrive.
- **The one exemption from that gate is session-scoped**: the page load in
  which the account's root was *created* (`wasCreatedThisSession`, in memory,
  never persisted). Nothing else can have written that root yet and there is
  no cache to be fooled by. After a reload even the creator waits for the
  server like any other device — the cached root can be arbitrarily stale by
  then. Sign-out ends the in-page exemption. The persisted mark
  `sequences-sync-created:<account>` (written only once actually signed in,
  so Jazz's anonymous accounts leave no keys behind) does one thing only:
  skip the 6s blank-root wait a first contact otherwise sits through — a
  spinner, not a correctness gate, since the server has already reported by
  the time it is consulted. `clearSyncBase()` (Reset / Load / leaving the
  account) removes the bases and the persisted marks.
- Two Jazz-level races are handled explicitly. **The account migration may
  create the root only while the account is being *created*.** On a login it
  waits ~15s (`ROOT_WAIT`) for the server to show the root; if it doesn't
  arrive, it creates nothing, marks the account "root never arrived"
  (`rootNeverArrived`), writes `failed` status and returns — it must **not**
  throw: jazz-tools' provider only does `createContext(props).catch(...)`, so
  a rejected migration leaves `isReady` false forever, i.e. a permanently
  disabled Sync button with no message and no way out. Returning instead
  leaves `root` undefined (every effect inert, the provider keeps the bridge
  out) and puts the toolbar in its recoverable "Sync error" state — Reload
  first, "Sign out of sync" second. Nothing is decided or written for that
  account; a reload retries the wait. And if the running account ever differs
  from the stored credentials the bridge does not sync and reloads once so
  Jazz restarts from the credentials.
- Tabs on one origin share the session and IndexedDB but run their own
  bridge. Reset / Load / sign-out post a `BroadcastChannel` event
  (`src/sync/status.ts`). On `logout` the other tab sets its `leaving` flag
  **immediately** — from then on the bridge writes nothing, to the cloud or
  to IndexedDB (the initiating tab is emptying the store; a bridge still
  running over it would read a deleted photo as gone, push that unplacement,
  and re-save downloaded thumbnails as ghosts) — and reloads ~500ms later,
  once the store has been replaced. It does **not** log out of Jazz: a second
  log-out would create another anonymous account and overwrite the
  credentials the initiating tab now runs on. It comes back anonymous from
  the replaced credentials.
- The cloud document is an envelope `{ v, project }`. A build that meets a
  newer `v` pauses sync on that device (`incompatible` status) and never
  overwrites the document. The toolbar shows that as a paused state ("update
  the app", static hollow dot, the explanation in the tooltip), not as work
  in progress.
- `useProjectSync.ts` resets all bookkeeping at every bootstrap — a different
  account, or a fresh login into the same one. The bootstrap decides
  **imperatively** (it pushes or applies right away so the incremental
  effects can't reverse it), using the last agreed JSON (`sequences-sync-base:<account>` in
  localStorage): equal → nothing; this device unchanged since last sync →
  cloud wins; cloud empty, untouched (no placed photos) or unchanged since
  last sync → this device wins; this device has no placed photos → cloud
  wins; both changed → `SyncMergeDialog`. An empty account plus local
  traces of another account (thumbnail-only photos, another account's
  base) asks before uploading — but only while this device has no base for
  the account: answering "upload" with nothing placed writes nothing (a
  blank onto an empty root is declined), so the answer is recorded as the
  merge base instead and the question is not asked again on every reload.
  The dialog is modal and focus-trapped, nothing destructive is pre-focused,
  Esc returns to Cancel, the app is `inert` behind it. Either merge choice
  keeps all photos; only the sequence is chosen.
- A tombstone for a photo this device keeps (it holds the original) shows as
  a "deleted" chip on the print; the tray header carries the plural note
  ("Some prints were deleted on another device") with a toggle that expands
  the full explanation, and the print's own `title` says it in the singular
  ("deleted on another device"). Placing it again revives it.
- Reset and Load are this-device operations: the cloud is left untouched, so
  the account has to leave this device first. "Signed in" is read from the
  stored Jazz credentials as well as from the bridge status — without that,
  an operation started before the lazy chunk mounted would be pushed over the
  cloud copy the moment the bridge arrived. `prepareThisDeviceOp` then has
  three outcomes: bridge mounted → normal log-out, then forget the merge
  bases and creator marks and run; sync subtree `failed` (stale chunk,
  offline first visit, root never arrived — reloading cannot help) →
  `SyncSignOutDialog`, and on confirm the account secret and the bases are
  dropped, `logout` is posted, the reset/load runs, `reload` is posted and
  the page reloads (Cancel or Esc changes nothing); chunk still loading →
  refused with "Sync is still loading. Try again in a moment." An anonymous
  stored secret never sees the dialog — nothing was ever uploaded. Only the
  app's own IndexedDB is cleared: Jazz's `jazz-storage` database survives a
  Reset, so the account's cached root and thumbnails stay on the device.
  Nothing treats that cache as authoritative (it is why the creator
  exemption is session-scoped), but it is not a clean wipe.
- Status for the toolbar and the busy indicator comes from
  `src/sync/status.ts` (no jazz import), written by the bridge.
- Auth is passkey (WebAuthn; the secret seed lives in the credential's
  `user.id`, so iCloud Keychain carries it to the iPad) or a BIP39 recovery
  phrase. Jazz keeps the account secret as plaintext JSON in localStorage
  (`jazz-logged-in-secret`). Nothing is uploaded before sign-in
  (`sync.when: 'signedUp'`). `src/sync/credentials.ts` reads and derives from
  that secret without importing jazz-tools, and runs two repairs at startup
  (sync builds only, before the Jazz chunk mounts), because either shape of
  bad secret otherwise leaves the provider forever un-ready — disabled Sync
  button, no message, no way out. A secret it cannot parse is moved to
  `jazz-logged-in-secret.corrupt.<timestamp>` (never deleted; only the newest
  backup is kept, they are plaintext secrets) and the app starts signed out.
  A readable secret in the older `{ secret }` shape is rewritten in place to
  `{ accountSecret }` — same account, nothing lost — because jazz-tools
  0.20.19 with `sync.when: 'signedUp'` reads the secret *before* it would
  migrate it. The sync menu derives the shown phrase from the stored seed
  of the account signed in *now* and never falls back to another account's
  phrase: without a seed it shows an error line.
- Known limits: uploads in a background tab crawl (~100KB/s) because Chrome
  throttles the library's per-chunk `setTimeout`; jazz-tools is pinned to
  the 0.20 line while jazz.tools docs describe the 2.0 alpha API.
- A sequence with no placed photos is never pushed onto an empty account:
  another device's first push may still be in flight and last-write-wins
  would let the blank win. `pushNow` refuses it itself, so every caller
  (bootstrap, "keep this device", the upload question, the debounced push) is
  covered, and the refusal clears the dirty flag — an unpushed blank is not
  an edit worth defending, and holding it made the pull ignore every remote
  change. Photos still upload through the photo effect.
- A **user** edit waiting for the push debounce is not overwritten by a
  remote change that arrives meanwhile (the user's action wins). Two
  qualifiers: an unplace caused by a tombstone is sync's own edit
  (`systemDirty`) — it is pushed, but it never blocks pulling the deleter's
  concurrent change; and on a device that has **no merge base** for the
  account yet, a local sequence with nothing placed does not block a remote
  that has photos placed (its blank was declined, not pushed — it has agreed
  on nothing). A device *with* a base that emptied its book did so on
  purpose, and that edit is defended like any other.
- The system/user attribution is exact: `unplace` records the ids it took
  out, and the commit counts as sync's own only if it is *precisely* those
  unplacements applied to the previous project. React can batch a user edit
  into the same commit, and calling that "system" would let a pull overwrite
  what the user just did. The record is consumed either way, so a recorded
  unplacement that produced no commit of its own cannot mislabel a later edit.
- The "Sync error" fallback (error boundary, and the root-never-arrived case)
  offers reload first; leaving the account is a second button that opens
  `SyncSignOutDialog` — an in-page modal, not `window.confirm`; focus-trapped,
  Cancel pre-focused, Esc closes it (cancelling changes nothing here, unlike
  `SyncMergeDialog` where it logs out). The recovery phrase derived from the
  stored seed is shown selectable with a Copy button (clipboard, falling back
  to selecting the text); the button never reports a success it didn't get —
  a failed copy says so and leaves the phrase selected. A device with no seed
  (passkey-only account) gets a note saying no phrase can be produced here and
  to log in with the passkey, and can still confirm. A seed whose phrase
  cannot be derived blocks the dialog (Close only, nothing changes) rather
  than stranding the account with nothing written down.
- Testing: `npm test` runs `e2e/sync.spec.ts` with Playwright against a local
  in-memory `jazz-run sync` server and a **production build** served by
  `vite preview` (see `playwright.config.ts`; the dev server's StrictMode
  double effects make Jazz create two anonymous accounts per page and the
  credentials can name the wrong one). 24 scenarios; each opens separate
  browser contexts as devices and drives the real UI with the recovery-phrase
  path (passkeys can't be automated). `e2e/device.ts` wraps a device:
  `reload()` and `blockSync()` — the latter makes only the sync server
  unreachable (new WebSockets to it are closed), so the page can still be
  reloaded while "offline" — are how the offline and reload cases are driven.
  The two-tab block is configured with `retries: 2` (both tabs race
  over one session; the runs so far have not needed them). Default ports are
  5271 (preview) and 4271 (sync server), overridable with `E2E_PORT` /
  `E2E_SYNC_PORT`; `E2E_CONSOLE=1` echoes browser console lines. For manual
  testing, two dev servers on different ports act as two devices.
  **Not covered:** the
  `incompatible` path — producing a `{ v: 2 }` document would need a
  build-gated hook or a Node-side Jazz client.

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
