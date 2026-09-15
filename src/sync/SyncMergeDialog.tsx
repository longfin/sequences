import { useI18n } from '../i18n'
import type { MergeChoice, MergePrompt, MergeSummary } from './useProjectSync'

interface Props {
  prompt: MergePrompt
  onChoose: (choice: MergeChoice) => void
}

/**
 * Shown once per login when this device and the account both hold a book
 * with placed photos. Nothing is synced until the user picks a side.
 */
export function SyncMergeDialog({ prompt, onChoose }: Props) {
  const { t } = useI18n()
  const line = (s: MergeSummary) => t('syncMergeSummary', { spreads: s.spreads, placed: s.placed })
  return (
    <div className="sync-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="sync-merge-title">
      <div className="sync-dialog">
        <h2 id="sync-merge-title">{t('syncMergeTitle')}</h2>
        <p>{t('syncMergeBody')}</p>
        <dl className="sync-merge-sides">
          <dt>{t('syncMergeThisDevice')}</dt>
          <dd>{line(prompt.local)}</dd>
          <dt>{t('syncMergeCloud')}</dt>
          <dd>{line(prompt.remote)}</dd>
        </dl>
        <div className="sync-dialog-actions">
          <button className="primary" onClick={() => onChoose('remote')}>
            {t('syncMergeTakeRemote')}
          </button>
          <button onClick={() => onChoose('local')}>{t('syncMergeKeepLocal')}</button>
          <button onClick={() => onChoose('cancel')}>{t('syncMergeCancel')}</button>
        </div>
      </div>
    </div>
  )
}
