import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

/**
 * 'ask': the account is about to be removed from this device. The recovery
 * phrase (null when this device holds no seed) is shown first, selectable and
 * copyable: without it — or a passkey — the account is unreachable afterwards.
 *   - purpose 'sign-out': the user chose to leave the account from the crash
 *     fallback in the toolbar.
 *   - purpose 'continue': a this-device operation (Reset / Load) has to leave
 *     the account first, but sync has crashed and can't log out normally, so
 *     dropping the secret here is the way through.
 *
 * 'blocked': a seed exists but the phrase could not be derived. Deleting the
 * secret then would strand the account with nothing written down, so we
 * refuse and say so.
 */
export type SignOutPrompt =
  | { kind: 'ask'; phrase: string | null; purpose: 'sign-out' | 'continue' }
  | { kind: 'blocked' }

interface Props {
  prompt: SignOutPrompt
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal, focus-trapped, nothing destructive pre-focused (Cancel is), Esc
 * cancels (unlike SyncMergeDialog, where cancelling logs out and so must be
 * deliberate) and the app behind is inert.
 */
export function SyncSignOutDialog({ prompt, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const phraseBox = useRef<HTMLTextAreaElement>(null)
  const copyTimer = useRef<number>()
  const close = useRef(onCancel)
  close.current = onCancel
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const blocked = prompt.kind === 'blocked'
  const forOp = prompt.kind === 'ask' && prompt.purpose === 'continue'

  useEffect(() => {
    const app = document.querySelector('.app')
    app?.setAttribute('inert', '')
    cancel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // cancelling here changes nothing, so Esc is safe as a close
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = [...(box.current?.querySelectorAll<HTMLElement>('button, textarea') ?? [])]
      if (list.length === 0) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i >= list.length - 1 ? 0 : i + 1
      e.preventDefault()
      list[next].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      app?.removeAttribute('inert')
      window.clearTimeout(copyTimer.current)
    }
  }, [])

  /**
   * This is the last copy of the account: never claim success we didn't get.
   * A denied async clipboard (Safari, hardened profiles) and an execCommand
   * that returns false both count as failure — the phrase is left selected
   * and the dialog says to copy it by hand.
   */
  async function copyPhrase() {
    const el = phraseBox.current
    const text = el?.value ?? ''
    if (!text) return
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      el?.focus()
      el?.select()
      try {
        ok = document.execCommand('copy') === true
      } catch {
        ok = false
      }
    }
    if (!ok) {
      el?.focus()
      el?.select()
    }
    setCopyState(ok ? 'copied' : 'failed')
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), ok ? 2500 : 8000)
  }

  return (
    <div
      className="sync-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-signout-title"
    >
      <div className="sync-dialog" ref={box}>
        <h2 id="sync-signout-title">
          {t(blocked ? 'syncSignOutBlockedTitle' : forOp ? 'syncSignOutOpTitle' : 'syncSignOutTitle')}
        </h2>
        <p>{t(blocked ? 'syncSignOutBlockedBody' : forOp ? 'syncSignOutOpBody' : 'syncSignOutBody')}</p>
        {!blocked &&
          (prompt.phrase ? (
            <>
              <textarea
                className="sync-phrase"
                ref={phraseBox}
                readOnly
                value={prompt.phrase}
                rows={4}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={t('syncPhraseLabel')}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="sync-dialog-copy">
                <button type="button" onClick={copyPhrase}>
                  {t(copyState === 'copied' ? 'syncPhraseCopied' : 'syncPhraseCopy')}
                </button>
              </div>
              {copyState === 'failed' && (
                <p className="sync-error" role="alert">
                  {t('syncPhraseCopyFailed')}
                </p>
              )}
            </>
          ) : (
            <p className="sync-error">{t('syncSignOutNoPhrase')}</p>
          ))}
        <div className="sync-dialog-actions">
          {!blocked && (
            <button className="danger" onClick={onConfirm}>
              {t(forOp ? 'syncSignOutOpConfirm' : 'syncSignOutConfirm')}
            </button>
          )}
          <button ref={cancel} onClick={onCancel}>
            {t(blocked ? 'dialogClose' : 'syncSignOutCancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
