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
  sync: { ko: '동기화', en: 'Sync', ja: '同期' },
  syncOn: { ko: '동기화 켬', en: 'Sync on', ja: '同期オン' },
  syncError: {
    ko: '실패했습니다. 다시 시도하거나 다른 방법으로 로그인하세요.',
    en: 'That didn’t work. Try again or log in another way.',
    ja: '失敗しました。もう一度試すか、別の方法でログインしてください。',
  },
  syncPhraseWarning: {
    ko: '이 문구가 계정을 되찾는 유일한 방법입니다. 안전한 곳에 적어 두세요. 원본 사진은 백업되지 않습니다.',
    en: 'This phrase is the only way back into the account. Write it down somewhere safe. Originals are not backed up.',
    ja: 'このフレーズがアカウントに戻る唯一の方法です。安全な場所に控えてください。原本はバックアップされません。',
  },
  deletePhotoSyncConfirm: {
    ko: '이 사진을 삭제할까요? 동기화된 다른 기기에서도 삭제되며, 그 기기에 있는 원본도 함께 지워집니다.',
    en: 'Delete this photo? It will also be removed from your other synced devices, including the original stored there.',
    ja: 'この写真を削除しますか？同期中の他のデバイスからも削除され、そこにある原本も消えます。',
  },
  resetConfirmSync: {
    ko: '이 기기의 사진과 시퀀스를 모두 지우고 동기화를 끕니다. 클라우드와 다른 기기의 내용은 그대로 남습니다. 계속할까요?',
    en: 'Delete all photos and spreads on this device and turn sync off. The cloud and your other devices keep their copy. Continue?',
    ja: 'このデバイスの写真とシーケンスをすべて削除し、同期をオフにします。クラウドと他のデバイスの内容は残ります。続行しますか？',
  },
  loadConfirmSync: {
    ko: '불러온 프로젝트로 이 기기의 작업을 교체하고 동기화를 끕니다. 다시 동기화하려면 로그인하세요. 계속할까요?',
    en: 'Replace this device’s work with the loaded project and turn sync off. Log in again to resume syncing. Continue?',
    ja: '読み込んだプロジェクトでこのデバイスの作業を置き換え、同期をオフにします。再開するには再度ログインしてください。続行しますか？',
  },
  pdfLowResConfirm: {
    ko: '일부 사진은 이 기기에 썸네일만 있어서 PDF가 저해상도로 나옵니다. 원본이 있는 기기에서 내보내는 것이 좋습니다. 그래도 계속할까요?',
    en: 'Some photos exist on this device only as thumbnails, so the PDF will be low resolution. Export from the device that holds the originals if you can. Continue anyway?',
    ja: '一部の写真はこのデバイスにサムネイルしかないため、PDFは低解像度になります。原本のあるデバイスからの書き出しをお勧めします。続行しますか？',
  },
  syncMergeTitle: { ko: '어느 쪽을 쓸까요?', en: 'Which book do you want?', ja: 'どちらを使いますか？' },
  syncMergeBody: {
    ko: '이 기기와 클라우드 양쪽에 배치된 사진이 있습니다. 사진은 합쳐지지만 시퀀스는 한쪽만 남습니다.',
    en: 'Both this device and the cloud have placed photos. Photos are merged, but only one sequence can be kept.',
    ja: 'このデバイスとクラウドの両方に配置済みの写真があります。写真は統合されますが、シーケンスは片方のみ残ります。',
  },
  syncMergeThisDevice: { ko: '이 기기', en: 'This device', ja: 'このデバイス' },
  syncMergeCloud: { ko: '클라우드', en: 'Cloud', ja: 'クラウド' },
  syncMergeSummary: {
    ko: '스프레드 {spreads}개, 배치된 사진 {placed}장',
    en: '{spreads} spreads, {placed} photos placed',
    ja: '見開き{spreads}、配置済み写真{placed}枚',
  },
  syncMergeTakeRemote: { ko: '클라우드 시퀀스 가져오기', en: 'Use the cloud sequence', ja: 'クラウドのシーケンスを使う' },
  syncMergeKeepLocal: {
    ko: '이 기기 시퀀스로 클라우드 덮어쓰기',
    en: 'Overwrite the cloud with this device',
    ja: 'このデバイスでクラウドを上書き',
  },
  syncMergeCancel: { ko: '취소하고 로그아웃', en: 'Cancel and log out', ja: 'キャンセルしてログアウト' },
  syncTitle: {
    ko: '다른 기기와 시퀀스와 썸네일을 동기화',
    en: 'Sync the sequence and thumbnails with your other devices',
    ja: '他のデバイスとシーケンスとサムネイルを同期',
  },
  syncIntro: {
    ko: '패스키로 시작하면 이 기기의 작업이 클라우드에 올라가고, 같은 패스키로 로그인한 iPad에서 볼 수 있습니다. 원본 사진은 이 기기에만 남습니다.',
    en: 'Start with a passkey and this device’s work goes to the cloud, viewable on an iPad signed in with the same passkey. Originals stay on this device.',
    ja: 'パスキーで開始すると、このデバイスの作業がクラウドに上がり、同じパスキーでログインしたiPadで見られます。原本はこのデバイスにのみ残ります。',
  },
  syncNote: {
    ko: '시퀀스와 썸네일이 동기화되고 있습니다. 원본은 각 기기에만 있습니다.',
    en: 'The sequence and thumbnails are syncing. Originals live only on each device.',
    ja: 'シーケンスとサムネイルを同期しています。原本は各デバイスにのみあります。',
  },
  syncSignUp: { ko: '패스키로 시작', en: 'Start with a passkey', ja: 'パスキーで開始' },
  syncLogIn: { ko: '패스키로 로그인', en: 'Log in with a passkey', ja: 'パスキーでログイン' },
  syncLogOut: { ko: '동기화 끄기 (로그아웃)', en: 'Turn off sync (log out)', ja: '同期をオフ（ログアウト）' },
  syncShowPhrase: { ko: '복구 문구 보기', en: 'Show recovery phrase', ja: '復旧フレーズを表示' },
  syncPhrasePlaceholder: {
    ko: '복구 문구 (12단어 이상)',
    en: 'Recovery phrase (12+ words)',
    ja: '復旧フレーズ（12語以上）',
  },
  syncPhraseLogIn: { ko: '복구 문구로 로그인', en: 'Log in with phrase', ja: 'フレーズでログイン' },
  syncPhraseSignUp: {
    ko: '패스키 없이 시작 (복구 문구)',
    en: 'Start without a passkey (phrase)',
    ja: 'パスキーなしで開始（フレーズ）',
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
