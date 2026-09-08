import { wordlist } from '@scure/bip39/wordlists/english'
import { useLogOut, usePasskeyAuth, usePassphraseAuth } from 'jazz-tools/react'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

/**
 * Toolbar popover for turning sync on/off.
 *
 * Passkey is the primary path: on Apple devices the passkey lands in iCloud
 * Keychain, so the iPad can log in with Face ID and no typing. The recovery
 * phrase is the fallback (and the way to reach a passkey-less browser).
 */
export function SyncMenu() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPhrase, setShowPhrase] = useState(false)
  const [phraseInput, setPhraseInput] = useState('')

  const passkey = usePasskeyAuth({ appName: 'Sequences' })
  const phrase = usePassphraseAuth({ wordlist })
  const logOut = useLogOut()
  const signedIn = passkey.state === 'signedIn'

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      const e = err as Error & { cause?: unknown }
      const cause = e.cause as { message?: string } | undefined
      setError(cause?.message ?? e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="menu-wrap">
      <button
        className={signedIn ? 'active' : ''}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        title={t('syncTitle')}
      >
        {signedIn ? t('syncOn') : t('sync')}
      </button>
      {open && (
        <div className="menu sync-menu" onClick={(e) => e.stopPropagation()}>
          {signedIn ? (
            <>
              <p className="sync-note">{t('syncNote')}</p>
              <button onClick={() => setShowPhrase((s) => !s)}>{t('syncShowPhrase')}</button>
              {showPhrase && (
                <textarea className="sync-phrase" readOnly value={phrase.passphrase} rows={4} />
              )}
              <div className="menu-sep" />
              <button className="danger" onClick={() => run(async () => logOut())}>
                {t('syncLogOut')}
              </button>
            </>
          ) : (
            <>
              <p className="sync-note">{t('syncIntro')}</p>
              <button disabled={busy} onClick={() => run(() => passkey.signUp('Sequences'))}>
                {t('syncSignUp')}
              </button>
              <button disabled={busy} onClick={() => run(() => passkey.logIn())}>
                {t('syncLogIn')}
              </button>
              <div className="menu-sep" />
              <textarea
                className="sync-phrase"
                rows={3}
                placeholder={t('syncPhrasePlaceholder')}
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
              />
              <button
                disabled={busy || phraseInput.trim().split(/\s+/).length < 12}
                onClick={() => run(() => phrase.logIn(phraseInput.trim()))}
              >
                {t('syncPhraseLogIn')}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await phrase.signUp()
                    setShowPhrase(true)
                  })
                }
              >
                {t('syncPhraseSignUp')}
              </button>
            </>
          )}
          {error && <p className="sync-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
