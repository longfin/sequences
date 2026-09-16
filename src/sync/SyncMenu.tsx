import { entropyToMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { useLogOut, usePasskeyAuth, usePassphraseAuth } from 'jazz-tools/react'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { JAZZ_SECRET_KEY, useSyncStatus } from './status'

/**
 * The phrase of the account signed in *right now*, from the stored seed.
 * `usePassphraseAuth().passphrase` is read once when the hook subscribes and
 * goes stale after log out + new sign-up: it would show the previous
 * account's phrase, which is the one thing a user must never write down.
 */
function currentPhrase(): string {
  try {
    const raw = localStorage.getItem(JAZZ_SECRET_KEY)
    const seed: number[] | undefined = raw ? JSON.parse(raw).secretSeed : undefined
    return seed ? entropyToMnemonic(new Uint8Array(seed), wordlist) : ''
  } catch {
    return ''
  }
}

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
  const status = useSyncStatus()
  const label = !signedIn
    ? t('sync')
    : status.active
      ? t('syncOn')
      : status.offline
        ? t('syncOffline')
        : t('syncConnecting')

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  // never show the phrase again after the popover closes or the account changes
  useEffect(() => {
    if (!open || !signedIn) setShowPhrase(false)
  }, [open, signedIn])

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      // Library errors are English and sometimes technical; keep them in the
      // console and show a translated line.
      console.error('sync auth failed', err)
      setError(t('syncError'))
    } finally {
      setBusy(false)
    }
  }

  const phraseWords = phraseInput.trim().split(/\s+/).filter(Boolean).length

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
        {label}
      </button>
      {open && (
        <div className="menu sync-menu" onClick={(e) => e.stopPropagation()}>
          {signedIn ? (
            <>
              <p className="sync-note">{t('syncNote')}</p>
              <button onClick={() => setShowPhrase((s) => !s)}>{t('syncShowPhrase')}</button>
              {showPhrase && (
                <>
                  <p className="sync-note">{t('syncPhraseWarning')}</p>
                  <textarea
                    className="sync-phrase"
                    readOnly
                    value={currentPhrase() || phrase.passphrase}
                    rows={4}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </>
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
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button
                disabled={busy || phraseWords < 12}
                onClick={() =>
                  run(async () => {
                    await phrase.logIn(phraseInput.trim())
                    setPhraseInput('')
                  })
                }
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
