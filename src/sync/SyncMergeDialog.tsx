import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { MergeChoice, MergePrompt, MergeSummary } from './useProjectSync'

interface Props {
  prompt: MergePrompt
  onChoose: (choice: MergeChoice) => void
}

/**
 * Shown once per login when this device and the account both hold a book
 * with placed photos. Nothing is synced until the user picks a side.
 * Photos are merged whichever way; only the sequence is chosen.
 */
export function SyncMergeDialog({ prompt, onChoose }: Props) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const line = (s: MergeSummary) => t('syncMergeSummary', { spreads: s.spreads, placed: s.placed })

  // modal behaviour: initial focus, Tab stays inside, Esc cancels, the app
  // behind is inert (no keyboard shortcuts, no clicks)
  useEffect(() => {
    const app = document.querySelector('.app')
    app?.setAttribute('inert', '')
    const buttons = () => [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    buttons()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onChoose('cancel')
        return
      }
      if (e.key !== 'Tab') return
      const list = buttons()
      if (list.length === 0) return
      const i = list.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i >= list.length - 1 ? 0 : i + 1
      e.preventDefault()
      list[next].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      app?.removeAttribute('inert')
    }
  }, [onChoose])

  return (
    <div className="sync-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="sync-merge-title">
      <div className="sync-dialog" ref={box}>
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
