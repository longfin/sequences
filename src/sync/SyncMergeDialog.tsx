import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { MergeChoice, MergePrompt, MergeSummary } from './useProjectSync'

interface Props {
  prompt: MergePrompt
  onChoose: (choice: MergeChoice) => void
}

/**
 * The login-time question. 'merge': this device and the account both
 * changed since they last agreed; only the sequence is chosen, photos are
 * merged either way. 'upload': the account is empty but this device holds
 * photos that came through a previous login.
 *
 * For 'merge' neither answer is a safe default, so focus starts on Cancel;
 * for 'upload' the non-destructive answer is Upload, so it gets focus.
 * Tab stays inside, Esc returns to Cancel, the app behind is inert.
 */
export function SyncMergeDialog({ prompt, onChoose }: Props) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const safe = useRef<HTMLButtonElement>(null)
  const choose = useRef(onChoose)
  choose.current = onChoose
  const line = (s: MergeSummary) => t('syncMergeSummary', { spreads: s.spreads, placed: s.placed })
  const upload = prompt.kind === 'upload'

  useEffect(() => {
    const app = document.querySelector('.app')
    app?.setAttribute('inert', '')
    ;(upload ? safe.current : cancel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel.current?.focus()
        return
      }
      if (e.key !== 'Tab') return
      const list = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
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
  }, [upload])

  return (
    <div className="sync-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="sync-merge-title">
      <div className="sync-dialog" ref={box}>
        <h2 id="sync-merge-title">{t(upload ? 'syncUploadTitle' : 'syncMergeTitle')}</h2>
        <p>{t(upload ? 'syncUploadBody' : 'syncMergeBody')}</p>
        {upload ? (
          <p>{t('syncUploadHint')}</p>
        ) : (
          <dl className="sync-merge-sides">
            <dt>{t('syncMergeThisDevice')}</dt>
            <dd>{line(prompt.local)}</dd>
            <dt>{t('syncMergeCloud')}</dt>
            <dd>{line(prompt.remote)}</dd>
          </dl>
        )}
        <div className="sync-dialog-actions">
          {upload ? (
            <button ref={safe} onClick={() => choose.current('local')}>
              {t('syncUploadConfirm')}
            </button>
          ) : (
            <>
              <button onClick={() => choose.current('remote')}>{t('syncMergeTakeRemote')}</button>
              <button onClick={() => choose.current('local')}>{t('syncMergeKeepLocal')}</button>
            </>
          )}
          <button ref={cancel} onClick={() => choose.current('cancel')}>
            {t('syncMergeCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
