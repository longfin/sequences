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
  syncOn: { ko: '동기화 켜짐', en: 'Sync on', ja: '同期オン' },
  syncConnecting: { ko: '동기화 연결 중', en: 'Sync connecting', ja: '同期に接続中' },
  syncBusy: {
    ko: '보낼 사진 {up}장 · 받을 사진 {down}장',
    en: '{up} to send · {down} to receive',
    ja: '送信 {up}枚 · 受信 {down}枚',
  },
  syncIncompatible: {
    ko: '동기화 멈춤 · 앱 업데이트 필요',
    en: 'Sync paused · update the app',
    ja: '同期停止 · アプリを更新',
  },
  syncIncompatibleTitle: {
    ko: '클라우드의 책이 이 앱보다 새로운 형식으로 저장되어 있습니다. 덮어쓰지 않도록 이 기기의 동기화를 멈췄습니다. 최신 버전으로 업데이트(새로고침)한 뒤 다시 시도하세요.',
    en: 'The cloud book was written by a newer version of the app. Sync is paused on this device so it can’t be overwritten. Update to the latest version (reload) and try again.',
    ja: 'クラウドの本はこのアプリより新しいバージョンで保存されています。上書きしないよう、このデバイスの同期を停止しました。最新版に更新（再読み込み）してからお試しください。',
  },
  syncOffline: { ko: '동기화 연결 대기', en: 'Sync waiting for connection', ja: '同期の接続待ち' },
  syncFailedReload: { ko: '동기화 오류 · 새로고침', en: 'Sync error · reload', ja: '同期エラー · 再読み込み' },
  syncFailedReloadTitle: {
    ko: '동기화를 불러오지 못했습니다. 대개 배포 직후의 오래된 파일이 원인이라 새로고침하면 해결됩니다.',
    en: 'Sync failed to load. A stale file right after a deploy is the usual cause, so reloading normally fixes it.',
    ja: '同期の読み込みに失敗しました。デプロイ直後の古いファイルが原因のことが多く、再読み込みで解消します。',
  },
  syncFailedSignOut: { ko: '동기화 로그아웃', en: 'Sign out of sync', ja: '同期をログアウト' },
  syncFailedSignOutTitle: {
    ko: '이 기기에서 동기화 계정을 로그아웃합니다. 사진과 시퀀스는 이 기기에 그대로 남습니다.',
    en: 'Sign out of sync on this device. Your photos and sequence stay here.',
    ja: 'このデバイスで同期アカウントからログアウトします。写真とシーケンスはこの端末に残ります。',
  },
  syncNotReady: {
    ko: '동기화를 아직 불러오는 중입니다. 잠시 후 다시 시도하세요.',
    en: 'Sync is still loading. Try again in a moment.',
    ja: '同期をまだ読み込み中です。少し待ってからもう一度お試しください。',
  },
  syncSignOutTitle: {
    ko: '이 기기에서 동기화 로그아웃',
    en: 'Sign out of sync on this device',
    ja: 'このデバイスで同期からログアウト',
  },
  syncSignOutBody: {
    ko: '이 기기에서 동기화 계정을 지웁니다. 사진과 시퀀스는 이 기기에 그대로 남습니다. 패스키나 아래 복구 문구가 없으면 이 계정으로 다시 돌아올 수 없으니, 계속하기 전에 복사해 두세요.',
    en: 'This removes the sync account from this device. Your photos and sequence stay here. Without a passkey or the recovery phrase below there is no way back into the account — copy it before you continue.',
    ja: 'このデバイスから同期アカウントを削除します。写真とシーケンスはこの端末に残ります。パスキーか下のリカバリーフレーズがないとこのアカウントには戻れません。続行する前に控えてください。',
  },
  syncSignOutNoPhrase: {
    ko: '이 기기에서는 복구 문구를 만들 수 없습니다. 패스키로 만든 계정이라면 그 패스키로 다시 로그인할 수 있습니다.',
    en: 'No recovery phrase can be produced on this device. If the account was created with a passkey, you can log in with that passkey again.',
    ja: 'このデバイスではリカバリーフレーズを作成できません。パスキーで作成したアカウントなら、そのパスキーで再度ログインできます。',
  },
  syncSignOutConfirm: {
    ko: '로그아웃하고 계정 지우기',
    en: 'Sign out and remove the account',
    ja: 'ログアウトしてアカウントを削除',
  },
  syncSignOutCancel: { ko: '취소', en: 'Cancel', ja: 'キャンセル' },
  syncSignOutOpTitle: {
    ko: '계속하려면 동기화에서 로그아웃',
    en: 'Sign out of sync to continue',
    ja: '続けるには同期からログアウト',
  },
  syncSignOutOpBody: {
    ko: '이 기기의 동기화가 오류 상태라 정상적으로 로그아웃할 수 없습니다. 계속하면 이 기기에서 동기화 계정을 지운 뒤 작업을 이어서 진행하고 페이지를 새로 엽니다. 클라우드와 다른 기기의 내용은 그대로 남습니다. 패스키나 아래 복구 문구가 없으면 이 계정으로 다시 돌아올 수 없으니, 계속하기 전에 복사해 두세요.',
    en: 'Sync is in an error state on this device and can’t log out normally. Continuing removes the sync account from this device, then carries on with what you asked for and reloads the page. The cloud and your other devices keep their copy. Without a passkey or the recovery phrase below there is no way back into the account — copy it before you continue.',
    ja: 'このデバイスの同期がエラー状態のため、通常のログアウトができません。続行するとこのデバイスから同期アカウントを削除し、そのうえで操作を実行してページを再読み込みします。クラウドと他のデバイスの内容は残ります。パスキーか下のリカバリーフレーズがないとこのアカウントには戻れません。続行する前に控えてください。',
  },
  syncSignOutOpConfirm: {
    ko: '로그아웃하고 계속',
    en: 'Sign out and continue',
    ja: 'ログアウトして続行',
  },
  syncSignOutBlockedTitle: {
    ko: '복구 문구를 읽을 수 없습니다',
    en: 'The recovery phrase can’t be read',
    ja: 'リカバリーフレーズを読み取れません',
  },
  syncSignOutBlockedBody: {
    ko: '이 기기에 저장된 계정 정보에서 복구 문구를 만들지 못했습니다. 지금 로그아웃하면 적어 둘 문구도 없이 계정으로 돌아갈 방법이 사라지므로 아무것도 바꾸지 않았습니다. 새로고침한 뒤 다시 시도하거나, 패스키로 로그인할 수 있는지 확인하세요.',
    en: 'The recovery phrase could not be derived from the account secret stored here. Signing out now would leave the account unreachable with nothing written down, so nothing was changed. Reload and try again, or check that you can log in with a passkey.',
    ja: 'この端末に保存されたアカウント情報からリカバリーフレーズを生成できませんでした。今ログアウトすると、控えのないままアカウントに戻れなくなるため、何も変更していません。再読み込みして再試行するか、パスキーでログインできるか確認してください。',
  },
  syncPhraseLabel: { ko: '복구 문구', en: 'Recovery phrase', ja: 'リカバリーフレーズ' },
  syncPhraseCopy: { ko: '복사', en: 'Copy', ja: 'コピー' },
  syncPhraseCopied: { ko: '복사됨', en: 'Copied', ja: 'コピーしました' },
  syncPhraseCopyFailed: {
    ko: '복사에 실패했습니다. 문구를 선택해 두었으니 직접 복사하세요.',
    en: 'Copy failed — the phrase is selected, copy it manually.',
    ja: 'コピーに失敗しました。フレーズを選択したので手動でコピーしてください。',
  },
  syncPhraseUnavailable: {
    ko: '이 기기에서는 복구 문구를 읽을 수 없습니다.',
    en: 'The recovery phrase can’t be read on this device.',
    ja: 'このデバイスではリカバリーフレーズを読み取れません。',
  },
  dialogClose: { ko: '닫기', en: 'Close', ja: '閉じる' },
  remoteDeleted: { ko: '삭제됨', en: 'deleted', ja: '削除済' },
  /** one print, for the print's own tooltip */
  remoteDeletedOne: {
    ko: '다른 기기에서 삭제됨',
    en: 'deleted on another device',
    ja: '他のデバイスで削除済み',
  },
  remoteDeletedNote: {
    ko: '다른 기기에서 삭제된 프린트가 있습니다',
    en: 'Some prints were deleted on another device',
    ja: '他のデバイスで削除されたプリントがあります',
  },
  remoteDeletedTitle: {
    ko: '‘삭제됨’ 표시가 붙은 프린트는 다른 기기에서 지운 프린트입니다. 원본은 이 기기에만 있어서 트레이에 남겨 두었습니다. 다시 배치하면 다른 기기에도 돌아가고, 여기서 삭제하면 원본도 사라집니다.',
    en: 'Prints marked “deleted” were deleted on another device. Their originals exist only here, so they stay in the tray. Placing one again brings it back everywhere; deleting it here removes the original too.',
    ja: '「削除済」の付いたプリントは他のデバイスで削除されたプリントです。オリジナルはここにしかないためトレイに残しています。再配置すると他のデバイスにも戻り、ここで削除するとオリジナルも消えます。',
  },
  syncUploadTitle: { ko: '이 기기의 책을 올릴까요?', en: 'Upload this device’s book?', ja: 'このデバイスの本をアップロードしますか？' },
  syncUploadBody: {
    ko: '이 계정은 비어 있습니다. 이 기기에는 이전 로그인에서 받은 사진과 시퀀스가 남아 있는데, 올리면 그대로 이 계정의 책이 됩니다.',
    en: 'This account is empty. This device still holds photos and a sequence from a previous login; uploading makes them this account’s book.',
    ja: 'このアカウントは空です。このデバイスには以前のログインで受け取った写真とシーケンスが残っており、アップロードするとそのままこのアカウントの本になります。',
  },
  syncUploadHint: {
    ko: '취소하면 이 기기에서 방금 로그인한 계정에서 로그아웃합니다. 그 계정의 패스키나 복구 문구가 다시 들어오는 유일한 방법입니다. 빈 책으로 시작하려면 취소한 뒤 파일 → 리셋을 하고 다시 로그인하세요.',
    en: 'Cancel signs this device out of the account you just signed into; that account’s passkey — or its recovery phrase — is the only way back into it. To start the account with an empty book instead, cancel, then File → Reset and log in again.',
    ja: 'キャンセルすると、このデバイスは今サインインしたアカウントからログアウトします。そのアカウントのパスキー、またはリカバリーフレーズだけが戻る手段です。空の本から始めるには、キャンセルしてからファイル → リセットし、再度ログインしてください。',
  },
  syncUploadConfirm: { ko: '올리기', en: 'Upload', ja: 'アップロード' },
  syncError: {
    ko: '실패했습니다. 다시 시도하거나 다른 방법으로 로그인하세요.',
    en: 'That didn’t work. Try again or log in another way.',
    ja: '失敗しました。もう一度試すか、別の方法でログインしてください。',
  },
  syncPhraseWarning: {
    ko: '이 문구가 계정을 되찾는 유일한 방법입니다. 안전한 곳에 적어 두세요. 원본 사진은 백업되지 않습니다.',
    en: 'This phrase is the only way back into the account. Write it down somewhere safe. Originals are not backed up.',
    ja: 'このフレーズがアカウントに戻る唯一の方法です。安全な場所に控えてください。オリジナルはバックアップされません。',
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
    ja: '一部の写真はこのデバイスにサムネイルしかないため、PDFは低解像度になります。オリジナルのあるデバイスからの書き出しをお勧めします。続行しますか？',
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
    ja: '見開き{spreads}組、配置済み写真{placed}枚',
  },
  syncMergeTakeRemote: {
    ko: '클라우드 시퀀스 유지 (이 기기 쪽은 교체)',
    en: 'Keep the cloud sequence (this device’s sequence is replaced)',
    ja: 'クラウドのシーケンスを残す（このデバイスの方は置き換え）',
  },
  syncMergeKeepLocal: {
    ko: '이 기기 시퀀스 유지 (클라우드 쪽은 교체)',
    en: 'Keep this device’s sequence (the cloud sequence is replaced)',
    ja: 'このデバイスのシーケンスを残す（クラウドの方は置き換え）',
  },
  syncMergeCancel: { ko: '취소하고 로그아웃', en: 'Cancel and log out', ja: 'キャンセルしてログアウト' },
  syncTitle: {
    ko: '시퀀스와 썸네일을 다른 기기와 동기화',
    en: 'Sync the sequence and thumbnails with your other devices',
    ja: '他のデバイスとシーケンスとサムネイルを同期',
  },
  syncIntro: {
    ko: '패스키로 시작하면 이 기기의 작업이 클라우드에 올라가고, 같은 패스키로 로그인한 iPad에서 볼 수 있습니다. 원본 사진은 이 기기에만 남습니다.',
    en: 'Start with a passkey and this device’s work goes to the cloud, viewable on an iPad signed in with the same passkey. Originals stay on this device.',
    ja: 'パスキーで開始すると、このデバイスの作業がクラウドに上がり、同じパスキーでログインしたiPadで見られます。オリジナルはこのデバイスにのみ残ります。',
  },
  syncNote: {
    ko: '시퀀스와 썸네일이 동기화됩니다. 원본은 각 기기에만 있습니다. 다른 기기에서 사진을 지우면 원본이 있는 기기에서는 트레이로 돌아갑니다.',
    en: 'The sequence and thumbnails sync. Originals live only on each device. Deleting a photo elsewhere returns it to the tray on the device that holds the original.',
    ja: 'シーケンスとサムネイルを同期します。オリジナルは各デバイスにのみあります。他のデバイスで写真を削除すると、オリジナルのあるデバイスではトレイに戻ります。',
  },
  syncSignUp: { ko: '패스키로 시작', en: 'Start with a passkey', ja: 'パスキーで開始' },
  syncLogIn: { ko: '패스키로 로그인', en: 'Log in with a passkey', ja: 'パスキーでログイン' },
  syncLogOut: { ko: '동기화 끄기 (로그아웃)', en: 'Turn off sync (log out)', ja: '同期をオフ（ログアウト）' },
  syncShowPhrase: { ko: '복구 문구 보기', en: 'Show recovery phrase', ja: 'リカバリーフレーズを表示' },
  syncPhrasePlaceholder: {
    ko: '복구 문구 (12단어 이상)',
    en: 'Recovery phrase (12+ words)',
    ja: 'リカバリーフレーズ（12語以上）',
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
