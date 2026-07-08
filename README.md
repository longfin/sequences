# Sequences

A local-first web app for **sequencing a photobook** — the editorial work of
deciding which photographs go where, long before layout software. Upload
photos into a tray, drag them onto book spreads, study the pairings, and flip
through the result like a printed dummy.

Everything stays in your browser (IndexedDB). No server, no uploads.

**Try it now → [longfin.github.io/sequences](https://longfin.github.io/sequences/)**

*[한국어 안내는 아래에 있습니다.](#한국어)*

![Flipping through spreads in the dummy-book preview](docs/demo.gif)

## Why

Sequencing is usually done by taping work prints to a wall. Existing tools are
either full layout suites (InDesign, Lightroom Book) or generic whiteboards —
neither shows the one thing that matters: **the two pages facing each other**.
Sequences keeps you in spreads the whole time.

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

---

## 한국어

사진집 **시퀀싱**을 위한 로컬 우선 웹앱입니다. 레이아웃 소프트웨어를 열기
전에, 어떤 사진을 어디에 둘지 정하는 편집 작업을 브라우저에서 합니다. 사진을
트레이에 올리고, 스프레드(펼침면) 위로 드래그해 배치하고, 마주보는 쌍을
살피고, 더미북처럼 넘겨봅니다.

모든 데이터는 브라우저(IndexedDB)에만 저장됩니다. 서버도, 업로드도 없습니다.

### 기능

- **스프레드 편집** — 책을 펼쳐놓은 것처럼 스프레드가 세로로 흐릅니다.
  트레이→페이지 드래그 배치, 페이지 간 교체, 스프레드 순서 변경.
- **페이지 프리셋** — 전면 재단 / 여백 레이아웃 / 빈 페이지. 페이지 비율
  선택 가능.
- **흑백 토글** — 톤의 흐름 확인용.
- **오버뷰** — 전체 스프레드를 콘택트시트처럼 한 화면에.
- **넘겨보기** — 3D 책장 넘김 프리뷰. 편집 중이던 위치에서 시작합니다.
- **PDF 내보내기** — 스프레드 단위 PDF로 프린트 더미북 제작.
- **로컬 저장** — 새로고침해도 유지. 내보내기는 원본 해상도 사용.
- **다국어** — 한국어 / English / 日本語.

### 실행

```bash
npm install
npm run dev
```
