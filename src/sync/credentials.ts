import { JAZZ_SECRET_KEY } from './status'

/**
 * Jazz keeps the account secret as plaintext JSON in localStorage under
 * `jazz-logged-in-secret`. Nothing here imports jazz-tools: App needs to
 * know whether this device is signed in *before* the lazy Jazz chunk has
 * mounted, because a this-device operation (Reset / Load) started in that
 * window would otherwise skip the log-out and let the bridge push the new
 * local state over the cloud copy as soon as it arrives.
 */
export interface StoredCredentials {
  accountID: string
  /** from `accountSecret`, or the older `secret` field jazz-tools still migrates */
  accountSecret: string
  /** entropy the recovery phrase is derived from; absent on some accounts */
  secretSeed?: number[]
  /** 'anonymous' | 'passkey' | 'passphrase' | … */
  provider?: string
}

/** the parsed value, plus whether it used the pre-`accountSecret` shape */
function parseCredentials(raw: string): (StoredCredentials & { legacy: boolean }) | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const c = value as Record<string, unknown>
  if (typeof c.accountID !== 'string' || c.accountID.length === 0) return null
  // An older shape stores the secret under `secret`; jazz-tools knows how to
  // repair it (AuthSecretStorage.migrate), so that value is perfectly usable
  // and must never be treated as corrupt here — our check runs first.
  const current = typeof c.accountSecret === 'string' && c.accountSecret.length > 0 ? c.accountSecret : null
  const legacy = current === null && typeof c.secret === 'string' && c.secret.length > 0 ? c.secret : null
  const secret = current ?? legacy
  if (secret === null) return null
  const seed =
    Array.isArray(c.secretSeed) && c.secretSeed.length > 0 && c.secretSeed.every((n) => typeof n === 'number')
      ? (c.secretSeed as number[])
      : undefined
  return {
    accountID: c.accountID,
    accountSecret: secret,
    secretSeed: seed,
    provider: typeof c.provider === 'string' ? c.provider : undefined,
    legacy: legacy !== null,
  }
}

/** The stored Jazz credentials, or null when absent or unreadable. */
export function readStoredCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(JAZZ_SECRET_KEY)
    const parsed = raw ? parseCredentials(raw) : null
    if (!parsed) return null
    const { legacy: _legacy, ...credentials } = parsed
    return credentials
  } catch {
    return null
  }
}

/**
 * Rewrite the pre-`accountSecret` shape (`secret`) to the current one — the
 * same repair jazz-tools makes in `AuthSecretStorage.migrate()`, done here
 * because with `sync.when: 'signedUp'` the library reads the secret *before*
 * it migrates (createJazzBrowserContext calls `authSecretStorage.get()`
 * first, which throws on the old shape) and the provider then never becomes
 * ready. Same account, same secret: nothing is lost, and there is nothing to
 * back up. Returns true when the value was rewritten.
 */
export function repairLegacyCredentials(): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(JAZZ_SECRET_KEY)
  } catch {
    return false
  }
  if (raw === null) return false
  const parsed = parseCredentials(raw)
  if (!parsed || !parsed.legacy) return false
  const { legacy: _legacy, ...credentials } = parsed
  try {
    localStorage.setItem(JAZZ_SECRET_KEY, JSON.stringify(credentials))
  } catch (err) {
    console.warn('sync: could not rewrite the stored account secret to the current shape', err)
    return false
  }
  return true
}

/**
 * True when the stored secret names a real account the user signed in to.
 * The anonymous account Jazz creates on first load does not count: nothing
 * is uploaded before sign-in (`sync.when: 'signedUp'`).
 */
export function hasStoredSignIn(): boolean {
  const c = readStoredCredentials()
  return c !== null && c.provider !== 'anonymous'
}

const CORRUPT_PREFIX = `${JAZZ_SECRET_KEY}.corrupt.`

/** every quarantined secret currently in localStorage, oldest key first */
function corruptKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(CORRUPT_PREFIX)) keys.push(k)
    }
  } catch {
    return []
  }
  return keys.sort()
}

/**
 * A stored secret that can't be parsed (or that lacks the account id or the
 * secret) leaves the Jazz provider forever un-ready: the Sync button stays
 * disabled and there is no way out from inside the app. Move it aside under a
 * sibling key — never delete it, it may still be recoverable by hand — and
 * let startup continue anonymously. Only the most recent quarantined value is
 * kept: these are plaintext secrets and must not pile up forever.
 *
 * Returns true when something was quarantined.
 */
export function quarantineCorruptCredentials(): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(JAZZ_SECRET_KEY)
  } catch {
    return false
  }
  if (raw === null) return false
  if (parseCredentials(raw) !== null) return false
  const older = corruptKeys()
  const backupKey = `${CORRUPT_PREFIX}${Date.now()}`
  try {
    localStorage.setItem(backupKey, raw)
  } catch (err) {
    console.warn(
      `sync: the stored account secret is unreadable but could not be moved to "${backupKey}"; leaving it in place`,
      err,
    )
    return false
  }
  try {
    localStorage.removeItem(JAZZ_SECRET_KEY)
  } catch (err) {
    console.warn('sync: could not remove the unreadable account secret', err)
    try {
      localStorage.removeItem(backupKey)
    } catch {
      /* the copy stays; the original is still in place either way */
    }
    return false
  }
  // plaintext secrets: keep the newest quarantined value only
  for (const k of older) {
    if (k === backupKey) continue
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  console.warn(
    `sync: the stored account secret was unreadable; moved to "${backupKey}" and starting signed out. ` +
      'Log in again with a passkey or your recovery phrase.',
  )
  return true
}

/**
 * The BIP39 recovery phrase for a stored seed. Imported lazily so @scure/bip39
 * stays out of the chunk App paints from.
 */
export async function deriveRecoveryPhrase(seed: number[]): Promise<string> {
  const [{ entropyToMnemonic }, { wordlist }] = await Promise.all([
    import('@scure/bip39'),
    import('@scure/bip39/wordlists/english'),
  ])
  const phrase = entropyToMnemonic(new Uint8Array(seed), wordlist)
  if (!phrase.trim()) throw new Error('empty recovery phrase')
  return phrase
}
