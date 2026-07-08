import { createContext, useContext } from 'react'

export type Locale = 'ko' | 'en' | 'ja'

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

const messages = {
  appTitle: {
    ko: 'Sequences — 사진집 시퀀싱',
    en: 'Sequences — photobook sequencing',
    ja: 'Sequences — 写真集シーケンス',
  },
  loading: { ko: '불러오는 중…', en: 'Loading…', ja: '読み込み中…' },
  edit: { ko: '편집', en: 'Edit', ja: '編集' },
  overview: { ko: '오버뷰', en: 'Overview', ja: '一覧' },
  viewSwitch: { ko: '보기 전환', en: 'Switch view', ja: '表示切替' },
  grayscale: { ko: '흑백', en: 'B&W', ja: 'モノクロ' },
  grayscaleTitle: {
    ko: '톤의 흐름 확인용 흑백 보기',
    en: 'View in black & white to check tonal flow',
    ja: 'トーンの流れを確認するモノクロ表示',
  },
  flipThrough: { ko: '넘겨보기', en: 'Flip through', ja: 'めくる' },
  pageRatioTitle: { ko: '페이지 비율', en: 'Page ratio', ja: 'ページ比率' },
  languageTitle: { ko: '언어', en: 'Language', ja: '言語' },
  ratioPortrait45: { ko: '세로 4:5', en: 'Portrait 4:5', ja: '縦 4:5' },
  ratioPortrait34: { ko: '세로 3:4', en: 'Portrait 3:4', ja: '縦 3:4' },
  ratioPortrait23: { ko: '세로 2:3', en: 'Portrait 2:3', ja: '縦 2:3' },
  ratioSquare: { ko: '정사각 1:1', en: 'Square 1:1', ja: '正方形 1:1' },
  ratioLandscape54: { ko: '가로 5:4', en: 'Landscape 5:4', ja: '横 5:4' },
  ratioLandscape43: { ko: '가로 4:3', en: 'Landscape 4:3', ja: '横 4:3' },
  importing: {
    ko: '가져오는 중… {done}/{total}',
    en: 'Importing… {done}/{total}',
    ja: '取り込み中… {done}/{total}',
  },
  exportingPdf: {
    ko: 'PDF 생성 중… {done}/{total}',
    en: 'Exporting PDF… {done}/{total}',
    ja: 'PDF作成中… {done}/{total}',
  },
  exportingPdfStart: { ko: 'PDF 생성 중…', en: 'Exporting PDF…', ja: 'PDF作成中…' },
  pdfFailed: {
    ko: 'PDF 내보내기에 실패했습니다. 콘솔을 확인하세요.',
    en: 'PDF export failed. Check the console for details.',
    ja: 'PDFの書き出しに失敗しました。コンソールを確認してください。',
  },
  trayLabel: { ko: '미배치 프린트', en: 'Unplaced prints', ja: '未配置プリント' },
  addPhotos: { ko: '사진 추가', en: 'Add photos', ja: '写真を追加' },
  trayEmpty: {
    ko: '여기로 이미지를 드래그하거나 ‘사진 추가’를 누르세요',
    en: 'Drag images here, or press “Add photos”',
    ja: 'ここに画像をドラッグするか「写真を追加」を押してください',
  },
  deletePhoto: { ko: '삭제', en: 'Delete', ja: '削除' },
  verso: { ko: 'verso · 왼쪽', en: 'verso · left', ja: 'verso · 左' },
  recto: { ko: 'recto · 오른쪽', en: 'recto · right', ja: 'recto · 右' },
  toMargin: { ko: '여백 레이아웃으로', en: 'Switch to margin layout', ja: '余白レイアウトへ' },
  toFull: { ko: '전면 재단으로', en: 'Switch to full bleed', ja: '全面裁ち落としへ' },
  backToTray: { ko: '트레이로 되돌리기', en: 'Return to tray', ja: 'トレイに戻す' },
  reorderSpread: { ko: '드래그해서 순서 변경', en: 'Drag to reorder', ja: 'ドラッグで並べ替え' },
  removeSpread: { ko: '스프레드 삭제', en: 'Remove spread', ja: '見開きを削除' },
  removeSpreadFull: {
    ko: '스프레드 삭제 (사진은 트레이로)',
    en: 'Remove spread (photos return to the tray)',
    ja: '見開きを削除（写真はトレイへ）',
  },
  addSpread: { ko: '스프레드 추가', en: 'Add spread', ja: '見開きを追加' },
  close: { ko: '닫기 (Esc)', en: 'Close (Esc)', ja: '閉じる (Esc)' },
  file: { ko: '파일', en: 'File', ja: 'ファイル' },
  zoomIn: { ko: '확대', en: 'Zoom in', ja: '拡大' },
  zoomOut: { ko: '축소', en: 'Zoom out', ja: '縮小' },
  zoomReset: { ko: '100%로 되돌리기', en: 'Reset to 100%', ja: '100%に戻す' },
  saveProject: { ko: '프로젝트 저장', en: 'Save project', ja: 'プロジェクトを保存' },
  loadProject: { ko: '프로젝트 불러오기', en: 'Load project', ja: 'プロジェクトを読み込む' },
  reset: { ko: '리셋', en: 'Reset', ja: 'リセット' },
  resetConfirm: {
    ko: '모든 사진과 시퀀스를 삭제하고 처음부터 시작할까요?',
    en: 'Delete all photos and spreads and start over?',
    ja: 'すべての写真とシーケンスを削除して最初からやり直しますか？',
  },
  loadConfirm: {
    ko: '현재 작업을 불러온 프로젝트로 교체할까요?',
    en: 'Replace the current work with the loaded project?',
    ja: '現在の作業を読み込んだプロジェクトで置き換えますか？',
  },
  savingFile: {
    ko: '저장 파일 생성 중… {done}/{total}',
    en: 'Preparing save file… {done}/{total}',
    ja: '保存ファイル作成中… {done}/{total}',
  },
  loadingFile: {
    ko: '프로젝트 불러오는 중… {done}/{total}',
    en: 'Loading project… {done}/{total}',
    ja: 'プロジェクト読み込み中… {done}/{total}',
  },
  invalidFile: {
    ko: 'Sequences 프로젝트 파일이 아닙니다.',
    en: 'Not a valid Sequences project file.',
    ja: 'Sequencesのプロジェクトファイルではありません。',
  },
  prev: { ko: '← 이전', en: '← Prev', ja: '← 前へ' },
  next: { ko: '다음 →', en: 'Next →', ja: '次へ →' },
} satisfies Record<string, Record<Locale, string>>

export type MsgKey = keyof typeof messages

export function translate(
  locale: Locale,
  key: MsgKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = messages[key][locale]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}

const STORAGE_KEY = 'sequences-locale'

export function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'ko' || saved === 'en' || saved === 'ja') return saved
  const nav = navigator.language
  if (nav.startsWith('ko')) return 'ko'
  if (nav.startsWith('ja')) return 'ja'
  return 'en'
}

export function persistLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale)
}

interface I18n {
  locale: Locale
  t: (key: MsgKey, vars?: Record<string, string | number>) => string
  setLocale: (locale: Locale) => void
}

export const I18nContext = createContext<I18n>({
  locale: 'en',
  t: (key, vars) => translate('en', key, vars),
  setLocale: () => {},
})

export const useI18n = () => useContext(I18nContext)
