# Sequences

**English** · [한국어](README.ko.md) · [日本語](README.ja.md)

A local-first web app for **sequencing a photobook** — the editorial work of
deciding which photographs go where, long before layout software. Upload
photos into a tray, drag them onto book spreads, study the pairings, and flip
through the result like a printed dummy.

Everything stays in your browser (IndexedDB). No server, no uploads.

**Try it now → [sequences.kelupus.com](https://sequences.kelupus.com/)**

![Flipping through spreads in the dummy-book preview](docs/demo.gif)

## Why

Layout suites like InDesign show you spreads too — along with documents,
master pages, styles, and everything else you don't need yet. At the
sequencing stage all you want is to put pictures on pages and look at them.
Sequences is exactly that much: open a tab, drag photos on, shuffle until the
flow reads right. Nothing to install, nothing to set up.

## Features

- **Spread editor** — spreads flow vertically like a book laid out on a table.
  Drag photos from the tray onto pages, swap between pages, drag spreads to
  reorder. Pages are labeled verso/recto with real page numbers.
- **Page presets** — full bleed or margin layout per page; leave a page empty
  for pacing. Page ratio is configurable (4:5, 3:4, 2:3, 1:1, landscape).
- **B&W toggle** — desaturate everything to check tonal flow.
- **Overview** — every spread on one screen, contact-sheet style.
- **Flip preview** — a 3D page-turn dummy-book mode; opens at the spread you
  were editing. Arrow keys / space to turn pages.
- **PDF export** — one landscape page per spread, with fold line and folios,
  for printing a physical dummy.
- **Local persistence** — photos and sequence live in IndexedDB and survive
  reloads. Original files are kept at full resolution for export; the UI uses
  generated thumbnails.
- **Save / load / reset** — export the whole project (sequence + photos) as a
  single file, load it back on any machine, or wipe everything and start over.
- **i18n** — Korean, English, Japanese (auto-detected, switchable).

| Spread editor | Flip preview |
| --- | --- |
| ![Edit view](docs/edit.png) | ![Flip preview](docs/preview.png) |

![Overview](docs/overview.png)

## Run

```bash
npm install
npm run dev
```

Built with React + TypeScript + Vite. Photos never leave the browser.

## License

[MIT](LICENSE)
