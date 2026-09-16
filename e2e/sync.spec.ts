import { test, type Browser } from '@playwright/test'
import { Device } from './device'

/**
 * Two-device sync scenarios against a local Jazz sync server.
 * "A" usually holds originals (the Mac), "B" is the second device (the iPad).
 * Photos are named by a single letter; the UI shows `<letter>.jpg`.
 */

async function twoDevices(browser: Browser) {
  const a = await Device.open(browser, 'A')
  const b = await Device.open(browser, 'B')
  return { a, b, close: async () => Promise.all([a.close(), b.close()]) }
}

/** A imports A and B, places A on 0/left and signs up; B logs in and is synced */
async function sharedBook(browser: Browser) {
  const d = await twoDevices(browser)
  await d.a.importPhotos(['A', 'B'])
  await d.a.place('A', 0, 'left')
  const phrase = await d.a.signUp()
  await d.b.logIn(phrase)
  await d.b.waitSynced()
  await d.b.expectState({ slots: { '0/left': 'A' }, tray: ['B'] })
  return { ...d, phrase }
}

test('B logs in and receives A’s book', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  await a.importPhotos(['A', 'B'])
  await a.place('A', 0, 'left')
  const phrase = await a.signUp()

  await b.logIn(phrase)
  await b.waitSynced()
  await b.expectState({ slots: { '0/left': 'A' }, tray: ['B'], dialog: false })
  await close()
})

test('both changed: dialog; keeping this device merges photos without deleting anything', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  await a.importPhotos(['A', 'B'])
  await a.place('A', 0, 'left')
  const phrase = await a.signUp()

  await b.importPhotos(['C'])
  await b.place('C', 0, 'right')
  await b.logIn(phrase)
  await b.expectState({ dialog: true })
  await b.choose('local')
  await b.waitSynced()
  // B keeps its sequence; A's photos download into B's tray
  await b.expectState({ slots: { '0/right': 'C' }, tray: ['A', 'B'], dialog: false })
  // A gets B's sequence and keeps its originals in the tray
  await a.expectState({ slots: { '0/right': 'C' }, tray: ['A', 'B'] })
  await close()
})

test('both changed: keeping the cloud sequence still uploads this device’s photos', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  await a.importPhotos(['A'])
  await a.place('A', 0, 'left')
  const phrase = await a.signUp()

  await b.importPhotos(['C'])
  await b.place('C', 0, 'right')
  await b.logIn(phrase)
  await b.expectState({ dialog: true })
  await b.choose('remote')
  await b.waitSynced()
  await b.expectState({ slots: { '0/left': 'A' }, tray: ['C'] })
  await a.expectState({ slots: { '0/left': 'A' }, tray: ['C'] })
  await close()
})

test('both changed: cancelling logs out, keeps local work and leaves the cloud untouched', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  await a.importPhotos(['A'])
  await a.place('A', 0, 'left')
  const phrase = await a.signUp()

  await b.importPhotos(['C'])
  await b.place('C', 0, 'right')
  await b.logIn(phrase)
  await b.expectState({ dialog: true })
  await b.choose('cancel')
  await b.waitAnonymous()
  await b.expectState({ slots: { '0/right': 'C' }, tray: [], dialog: false })
  await b.page.waitForTimeout(1500)
  await a.expectState({ slots: { '0/left': 'A' }, tray: [] })
  await close()
})

test('deletes: thumbnail copies go, held originals stay in the tray with a chip, placing revives', async ({ browser }) => {
  const { a, b, close } = await sharedBook(browser)

  // delete on the device that holds the original: the thumbnail copy disappears elsewhere
  await a.deleteFromTray('B')
  await a.expectState({ slots: { '0/left': 'A' }, tray: [] })
  await b.expectState({ slots: { '0/left': 'A' }, tray: [] })

  // delete a thumbnail-only copy: the original is unplaced and kept, marked
  await b.unplace(0, 'left')
  await b.deleteFromTray('A')
  await b.expectState({ placed: [], tray: [] })
  await a.expectState({ placed: [], tray: ['A'], chips: ['A'] })

  // placing it again revives it everywhere
  await a.place('A', 1, 'left')
  await a.expectState({ slots: { '1/left': 'A' }, tray: [], chips: [] })
  await b.expectState({ slots: { '1/left': 'A' }, tray: [] })
  await close()
})

test('a tombstone for a photo that is placed here unplaces it and keeps the original', async ({ browser }) => {
  const { a, b, close } = await sharedBook(browser)
  // B deletes A while A still has it on a page
  await b.unplace(0, 'left')
  await b.deleteFromTray('A')
  await a.expectState({ placed: [], tray: ['A', 'B'], chips: ['A'] })
  await b.expectState({ placed: [], tray: ['B'] })
  await close()
})

test('a stale placement inherited from a pulled project cannot revive a photo deleted elsewhere', async ({ browser }) => {
  const { a, b, close } = await sharedBook(browser)
  // A keeps editing (grayscale toggles) so its pending pushes carry a project
  // that still places B.jpg after B has deleted its copy
  await b.place('B', 1, 'right')
  await a.expectState({ slots: { '0/left': 'A', '1/right': 'B' } })
  const editing = (async () => {
    for (let i = 0; i < 12; i++) {
      await a.toggleGrayscale()
      await a.page.waitForTimeout(120)
    }
  })()
  await b.unplace(1, 'right')
  await b.deleteFromTray('B')
  await editing
  // A's later pushes carry a project that still referenced B.jpg; that must
  // not flip the tombstone back. A holds B's original, so it stays in the tray.
  await a.expectState({ slots: { '0/left': 'A' }, tray: ['B'], chips: ['B'] })
  await b.expectState({ slots: { '0/left': 'A' }, tray: [] })
  await b.page.waitForTimeout(1500)
  await b.expectState({ slots: { '0/left': 'A' }, tray: [] })
  await close()
})

test('reverting an edit to the last received state is still pushed', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  await a.importPhotos(['A'])
  await a.place('A', 0, 'left')
  const phrase = await a.signUp()
  await b.logIn(phrase)
  await b.waitSynced()
  await b.expectState({ slots: { '0/left': 'A' } })

  await b.unplace(0, 'left')
  await a.expectState({ placed: [], tray: ['A'] })
  await b.place('A', 0, 'left')
  await a.expectState({ slots: { '0/left': 'A' }, tray: [] })
  await close()
})

test('simultaneous edits on both devices converge to one state', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  await a.importPhotos(['A', 'B'])
  const phrase = await a.signUp()
  await b.logIn(phrase)
  await b.waitSynced()
  await b.expectState({ tray: ['A', 'B'] })

  // both inside one debounce window, but not in the same millisecond: cojson
  // orders concurrent writes by their timestamp, and an exact tie between two
  // sessions is not resolved the same way on both nodes
  await Promise.all([a.place('A', 0, 'left'), b.page.waitForTimeout(60).then(() => b.place('B', 0, 'right'))])
  // whole-document LWW: one edit may be lost, but both devices must agree
  await a.page.waitForTimeout(2500)
  const sa = await a.state()
  const sb = await b.state()
  test.expect(sa.slots).toEqual(sb.slots)
  test.expect(Object.keys(sa.slots).length).toBeGreaterThanOrEqual(1)
  await close()
})

test('reset is a this-device operation: logs out, the other device and the cloud keep the book', async ({ browser }) => {
  const { a, b, phrase, close } = await sharedBook(browser)

  await a.reset()
  await a.expectState({ placed: [], tray: [] })
  await a.page.waitForTimeout(1500)
  await b.expectState({ slots: { '0/left': 'A' }, tray: ['B'] })

  // logging in again on the emptied device takes the cloud copy, no question asked
  await a.logIn(phrase)
  await a.waitSynced()
  await a.expectState({ slots: { '0/left': 'A' }, tray: ['B'], dialog: false })
  await close()
})

test('cloud first, empty: a device that logs in with a book keeps it and the cloud takes it', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  const phrase = await b.signUp() // B creates the account with an empty book

  await a.importPhotos(['A', 'B'])
  await a.place('A', 0, 'left')
  await a.place('B', 0, 'right')
  await a.logIn(phrase)
  await a.waitSynced()
  await a.expectState({ slots: { '0/left': 'A', '0/right': 'B' }, dialog: false })
  await b.expectState({ slots: { '0/left': 'A', '0/right': 'B' } })
  await close()
})

test('a photos-only device logging in while another’s first push is in flight does not blank it', async ({ browser }) => {
  const { a, b, close } = await twoDevices(browser)
  const phrase = await a.signUp() // empty book
  await a.offline(true)
  await a.importPhotos(['A'])
  await a.place('A', 0, 'left') // queued until A is back online

  await b.importPhotos(['C']) // photos, nothing placed
  await b.logIn(phrase)
  await b.waitSynced()

  await a.offline(false)
  await a.expectState({ slots: { '0/left': 'A' }, tray: ['C'] }, a.page, 60_000)
  await b.expectState({ slots: { '0/left': 'A' }, tray: ['C'] })
  await close()
})

test('logging in while the server is unreachable waits instead of deciding from the cache', async ({ browser }) => {
  const { a, b, phrase, close } = await sharedBook(browser)
  await a.logOut()
  await a.place('B', 1, 'left') // local work while logged out
  await b.unplace(0, 'left')
  await b.place('A', 1, 'right') // the cloud moves on

  await a.offline(true)
  await a.logIn(phrase)
  await a.expectState({ sync: /waiting|대기|待ち/, dialog: false })
  await a.page.waitForTimeout(1500)
  await a.offline(false)
  // both changed since A last synced: the question must appear, nothing is
  // overwritten (the socket reconnects with backoff, so allow a while)
  await a.expectState({ dialog: true }, a.page, 60_000)
  await a.choose('remote')
  await a.waitSynced()
  await a.expectState({ slots: { '1/right': 'A' }, tray: ['B'] })
  await b.expectState({ slots: { '1/right': 'A' }, tray: ['B'] })
  await close()
})

test('after reset, new local work plus a changed cloud asks instead of overwriting', async ({ browser }) => {
  const { a, b, phrase, close } = await sharedBook(browser)

  await a.reset() // logs out and forgets the merge base
  await a.importPhotos(['C'])
  await a.place('C', 0, 'left')
  await b.unplace(0, 'left') // the cloud moves on meanwhile
  await b.place('A', 1, 'right')
  await a.logIn(phrase)
  await a.expectState({ dialog: true })
  await a.choose('remote')
  await a.waitSynced()
  await a.expectState({ slots: { '1/right': 'A' }, tray: ['B', 'C'] })
  await b.expectState({ slots: { '1/right': 'A' }, tray: ['B', 'C'] })
  await close()
})

test.describe('same device, two tabs', () => {
  // Two tabs share Jazz's local storage and multiplex one session; delivery
  // of a change from one tab to the other is occasionally late. Retried
  // rather than tolerated, so a real regression still fails.
  test.describe.configure({ retries: 2 })

  test('a second tab drops a photo the first tab deleted', async ({ browser }) => {
    const { a, b, close } = await twoDevices(browser)
    await a.importPhotos(['A', 'B'])
    const phrase = await a.signUp()
    await b.logIn(phrase)
    await b.waitSynced()
    await b.expectState({ tray: ['A', 'B'] })

    const tab2 = await a.newTab()
    await a.expectState({ tray: ['A', 'B'] }, tab2)
    await a.deleteFromTray('B')
    await b.expectState({ tray: ['A'] })
    await a.expectState({ tray: ['A'] }, tab2)
    await close()
  })

  test('a reset in one tab logs the other tab out and reloads it', async ({ browser }) => {
    const { a, b, close } = await sharedBook(browser)
    const tab2 = await a.newTab()
    await a.expectState({ slots: { '0/left': 'A' } }, tab2)
    await a.reset()
    await a.waitAnonymous(tab2)
    await a.expectState({ placed: [], tray: [] }, tab2)
    await b.expectState({ slots: { '0/left': 'A' }, tray: ['B'] })
    await close()
  })
})

test('logging out and starting a new account asks before uploading, then the new account has the book', async ({ browser }) => {
  const { a, b, phrase, close } = await sharedBook(browser)
  await b.logOut()
  await b.signUp() // fresh account: B carries thumbnail-only photos from the old one
  await b.expectState({ dialog: true })
  await b.choose('upload')
  await b.waitSynced()
  await b.expectState({ slots: { '0/left': 'A' }, tray: ['B'] })

  // a third device logging into the NEW account sees the uploaded book
  const phrase2 = await b.currentPhrase()
  test.expect(phrase2).not.toEqual(phrase)
  const c = await Device.open(browser, 'C')
  await c.logIn(phrase2)
  await c.waitSynced()
  await c.expectState({ slots: { '0/left': 'A' }, tray: ['B'] })
  // the old account is untouched
  await a.expectState({ slots: { '0/left': 'A' }, tray: ['B'] })
  await c.close()
  await close()
})
