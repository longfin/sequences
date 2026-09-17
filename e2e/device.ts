import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

/** What the UI shows: enough to compare two devices. */
export interface DeviceState {
  sync: string | null
  tray: string[]
  placed: string[]
  /** "<spread>/<side>" → photo name, for every filled slot */
  slots: Record<string, string>
  dialog: boolean
  cards: number
  chips: string[]
}

type Expected = Partial<{
  tray: string[]
  placed: string[]
  slots: Record<string, string>
  dialog: boolean
  chips: string[]
  sync: RegExp
}>

const sync = /^(Sync|동기화|同期)/

/**
 * One "device": its own browser context (isolated IndexedDB + localStorage)
 * on the shared app origin. All interaction goes through the real UI; drag
 * and drop is driven with synthetic DragEvents because CDP mouse drags
 * don't trigger HTML5 DnD (see AGENTS.md).
 */
export class Device {
  private constructor(
    readonly name: string,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  static async open(browser: Browser, name: string): Promise<Device> {
    const context = await browser.newContext()
    const page = await context.newPage()
    const device = new Device(name, context, page)
    await device.prepare(page)
    await device.load(page)
    return device
  }

  /** a second tab on the same device */
  async newTab(): Promise<Page> {
    const page = await this.context.newPage()
    await this.prepare(page)
    await this.load(page)
    return page
  }

  private async load(page: Page) {
    await page.goto('/')
    await this.ready(page)
  }

  /** reload the page in place (the device keeps its stores and its credentials) */
  async reload(page: Page = this.page) {
    // App writes the project to IndexedDB 300ms after the last edit; a reload
    // inside that window comes back with the previously saved book
    await page.waitForTimeout(500)
    await page.reload()
    await this.ready(page)
  }

  private async ready(page: Page) {
    await page.locator('.spread-card').first().waitFor()
    // the Sync button is a disabled placeholder until the lazy Jazz chunk has
    // mounted; on a cold dev server that compile can take seconds, and it must
    // not eat into the timing-sensitive steps of a test
    await expect(this.syncButton(page)).toBeEnabled({ timeout: 60_000 })
  }

  private async prepare(page: Page) {
    page.on('dialog', (d) => d.accept())
    page.on('pageerror', (err) => console.error(`[${this.name}] page error:`, err.message))
    if (process.env.E2E_CONSOLE) {
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning' || /sync/i.test(m.text())) {
          console.log(`[${this.name}] ${m.type()}: ${m.text()}`)
        }
      })
    }
  }

  async close() {
    await this.context.close()
  }

  /** cut / restore the network (the app origin keeps working through Playwright's own channel) */
  async offline(on: boolean) {
    await this.context.setOffline(on)
  }

  private syncBlocked = false
  private syncRouted = false

  /**
   * Make only the sync server unreachable: every new WebSocket to it is
   * closed before it opens (the client then reconnects with backoff), while
   * the app origin stays reachable — so the page can be reloaded "offline".
   * Sockets already open are not touched; cut them with `offline` first.
   */
  async blockSync(on: boolean) {
    this.syncBlocked = on
    if (this.syncRouted) return
    this.syncRouted = true
    const app = new URL(this.page.url()).origin
    await this.context.routeWebSocket(
      (url) => url.origin !== app,
      (ws) => {
        if (this.syncBlocked) ws.close({ code: 1001, reason: 'e2e: sync server unreachable' })
        else ws.connectToServer()
      },
    )
  }

  // ---- photos ----

  /** import synthetic JPEGs named `<name>.jpg` through the tray's file input */
  async importPhotos(names: string[], page: Page = this.page) {
    await this.dispatchImport(names, page)
    for (const name of names) await page.locator(`.tray-photo img[alt="${name}.jpg"]`).waitFor({ timeout: 15_000 })
  }

  /** JPEGs are drawn in the page (no encoder in Node) and handed to the input by Playwright */
  private async dispatchImport(names: string[], page: Page) {
    const dataUrls = await page.evaluate(async (names) => {
      const out: string[] = []
      for (const [i, name] of names.entries()) {
        const c = document.createElement('canvas')
        c.width = 900 + (i % 2) * 300
        c.height = 1200 - (i % 2) * 300
        const ctx = c.getContext('2d')!
        ctx.fillStyle = `hsl(${(i * 67) % 360} 45% 35%)`
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 120px sans-serif'
        ctx.fillText(name, 40, 160)
        out.push(c.toDataURL('image/jpeg', 0.9))
      }
      return out
    }, names)
    await page.locator('.tray input[type=file]').setInputFiles(
      dataUrls.map((url, i) => ({
        name: `${names[i]}.jpg`,
        mimeType: 'image/jpeg',
        buffer: Buffer.from(url.split(',')[1], 'base64'),
      })),
    )
  }

  /** drag a tray print onto a page slot */
  async place(name: string, spread: number, side: 'left' | 'right', page: Page = this.page) {
    await page.evaluate(
      ({ alt, spread, side }) => {
        const fire = (el: Element, type: string, dt: DataTransfer) => {
          const ev = new DragEvent(type, { bubbles: true, cancelable: true })
          Object.defineProperty(ev, 'dataTransfer', { value: dt })
          el.dispatchEvent(ev)
        }
        const img = document.querySelector(`.tray-photo img[alt="${alt}"]`)!
        const slot = document.querySelectorAll('.spread-card')[spread].querySelector(`.page-slot.${side}`)!
        const dt = new DataTransfer()
        fire(img, 'dragstart', dt)
        fire(slot, 'dragover', dt)
        fire(slot, 'drop', dt)
        fire(img, 'dragend', dt)
      },
      { alt: `${name}.jpg`, spread, side },
    )
    await expect(page.locator(`.page-slot.filled img[alt="${name}.jpg"]`)).toBeVisible()
  }

  /** the slot's × control: back to the tray */
  async unplace(spread: number, side: 'left' | 'right', page: Page = this.page) {
    const slot = page.locator('.spread-card').nth(spread).locator(`.page-slot.${side}`)
    await slot.hover()
    await slot.locator('.slot-controls button').nth(1).click()
  }

  async deleteFromTray(name: string, page: Page = this.page) {
    const print = page.locator('.tray-photo', { has: page.locator(`img[alt="${name}.jpg"]`) })
    await print.hover()
    await print.locator('.tray-delete').click()
  }

  /**
   * Every photo record in this device's IndexedDB. `hasOriginal === false`
   * marks a copy that arrived through sync: originals never leave the device
   * that imported them.
   */
  async photoRecords(page: Page = this.page): Promise<{ name: string; hasOriginal: boolean | undefined }[]> {
    return page.evaluate(
      () =>
        new Promise<{ name: string; hasOriginal: boolean | undefined }[]>((resolve, reject) => {
          const open = indexedDB.open('sequences')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            // `transaction()` throws synchronously (no such store, database
            // closing); without the catch the promise would never settle
            try {
              const req = open.result.transaction('photos').objectStore('photos').getAll()
              req.onerror = () => reject(req.error)
              req.onsuccess = () =>
                resolve(req.result.map((r: { name: string; hasOriginal?: boolean }) => ({ name: r.name, hasOriginal: r.hasOriginal })))
            } catch (err) {
              reject(err)
            }
          }
        }),
    )
  }

  /** the B&W toggle: a harmless project edit */
  async toggleGrayscale(page: Page = this.page) {
    await page.locator('.toolbar button', { hasText: /^(B&W|흑백|モノクロ)$/ }).click()
  }

  // ---- sync menu ----

  syncButton(page: Page = this.page) {
    return page.locator('.toolbar button', { hasText: sync }).first()
  }

  private async openSync(page: Page = this.page) {
    if (await page.locator('.sync-menu').count()) return
    await this.syncButton(page).click()
    await page.locator('.sync-menu').waitFor()
  }

  private async closeMenu(page: Page = this.page) {
    await page.locator('body').click({ position: { x: 5, y: 400 } })
  }

  /** "Start without a passkey": creates an account, returns its recovery phrase */
  async signUp(page: Page = this.page): Promise<string> {
    await this.openSync(page)
    await page.locator('.sync-menu button', { hasText: /Start without|패스키 없이|パスキーなし/ }).click()
    const phrase = await page.locator('.sync-menu textarea.sync-phrase').inputValue()
    expect(phrase.split(/\s+/).length).toBeGreaterThanOrEqual(12)
    await this.closeMenu(page)
    await expect(this.syncButton(page)).not.toHaveText(/^(Sync|동기화|同期)$/)
    return phrase
  }

  async logIn(phrase: string, page: Page = this.page) {
    await this.openSync(page)
    await page.locator('.sync-menu textarea.sync-phrase').fill(phrase)
    await page.locator('.sync-menu button', { hasText: /Log in with phrase|복구 문구로 로그인|フレーズでログイン/ }).click()
    await this.closeMenu(page)
  }

  /** the signed-in account's recovery phrase, read from the menu */
  async currentPhrase(page: Page = this.page): Promise<string> {
    await this.openSync(page)
    await page.locator('.sync-menu button', { hasText: /recovery|복구|リカバリー/ }).click()
    const phrase = await page.locator('.sync-menu textarea.sync-phrase').inputValue()
    await this.closeMenu(page)
    return phrase
  }

  async logOut(page: Page = this.page) {
    await this.openSync(page)
    await page.locator('.sync-menu button', { hasText: /log out|로그아웃|ログアウト/ }).click()
    await expect(this.syncButton(page)).toHaveText(/^(Sync|동기화|同期)$/)
  }

  async waitSynced(page: Page = this.page) {
    await expect(this.syncButton(page)).toHaveText(/Sync on|동기화 켜짐|同期オン/)
  }

  async waitAnonymous(page: Page = this.page) {
    await expect(this.syncButton(page)).toHaveText(/^(Sync|동기화|同期)$/)
  }

  /** File → Reset, then wait until the local store is really empty (logout happens first and takes a moment) */
  async reset(page: Page = this.page) {
    await page.locator('.toolbar .menu-wrap > button', { hasText: /File|파일|ファイル/ }).click()
    await page.locator('.menu button.danger').click()
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const idb = await new Promise<IDBDatabase>((res, rej) => {
              const r = indexedDB.open('sequences')
              r.onsuccess = () => res(r.result)
              r.onerror = () => rej(r.error)
            })
            const photos = await new Promise<number>((res) => {
              const r = idb.transaction('photos').objectStore('photos').count()
              r.onsuccess = () => res(r.result)
            })
            const anonymous = /^(Sync|동기화|同期)$/.test(
              [...document.querySelectorAll('.toolbar button')].find((b) => /^(Sync|동기화|同期)/.test(b.textContent ?? ''))
                ?.textContent ?? '',
            )
            return { photos, anonymous, filled: document.querySelectorAll('.page-slot.filled').length }
          }),
        { timeout: 20_000, message: `${this.name} reset` },
      )
      .toEqual({ photos: 0, anonymous: true, filled: 0 })
    await page.waitForTimeout(300)
  }

  // ---- merge dialog ----

  dialog(page: Page = this.page) {
    return page.locator('.sync-dialog')
  }

  async choose(which: 'remote' | 'local' | 'cancel' | 'upload', page: Page = this.page) {
    const re = {
      remote: /^(Keep the cloud|클라우드 시퀀스 유지|クラウドのシーケンスを残す)/,
      local: /^(Keep this device|이 기기 시퀀스 유지|このデバイスのシーケンスを残す)/,
      upload: /^(Upload|올리기|アップロード)$/,
      cancel: /^(Cancel|취소|キャンセル)/,
    }[which]
    await this.dialog(page).locator('button', { hasText: re }).click()
  }

  // ---- state ----

  async state(page: Page = this.page): Promise<DeviceState> {
    return page.evaluate(() => {
      const slots: Record<string, string> = {}
      document.querySelectorAll('.spread-card').forEach((card, i) => {
        for (const side of ['left', 'right']) {
          const img = card.querySelector<HTMLImageElement>(`.page-slot.${side}.filled img`)
          if (img) slots[`${i}/${side}`] = img.alt
        }
      })
      return {
        sync:
          [...document.querySelectorAll('.toolbar button')].find((b) => /^(Sync|동기화|同期)/.test(b.textContent ?? ''))
            ?.textContent ?? null,
        tray: [...document.querySelectorAll<HTMLImageElement>('.tray-photo img')].map((i) => i.alt),
        placed: Object.values(slots),
        slots,
        dialog: !!document.querySelector('.sync-dialog'),
        cards: document.querySelectorAll('.spread-card').length,
        chips: [...document.querySelectorAll('.tray-photo')]
          .filter((p) => p.querySelector('.tray-chip'))
          .map((p) => p.querySelector('img')!.alt),
      }
    })
  }

  /** poll the UI until `expected` matches (lists compared as sets, slots exactly) */
  async expectState(expected: Expected, page: Page = this.page, timeout = 20_000) {
    try {
      await this.pollState(expected, page, timeout)
    } catch (err) {
      const last = await this.state(page).catch(() => null)
      throw new Error(`${this.name}: ${(err as Error).message}\nlast seen: ${JSON.stringify(last)}`)
    }
  }

  private async pollState(expected: Expected, page: Page, timeout: number) {
    const norm = (a: string[]) => [...a].sort().join(',')
    const jpg = (a: string[]) => norm(a.map((n) => `${n}.jpg`))
    await expect
      .poll(
        async () => {
          const s = await this.state(page)
          return {
            tray: norm(s.tray),
            placed: norm(s.placed),
            slots: JSON.stringify(s.slots, Object.keys(s.slots).sort()),
            dialog: s.dialog,
            chips: norm(s.chips),
            syncOk: expected.sync ? expected.sync.test(s.sync ?? '') : true,
            // diagnostics, never asserted on
            sync: s.sync,
            cards: s.cards,
          }
        },
        { timeout, message: `${this.name} state` },
      )
      .toMatchObject({
        ...(expected.tray ? { tray: jpg(expected.tray) } : {}),
        ...(expected.placed ? { placed: jpg(expected.placed) } : {}),
        ...(expected.slots
          ? {
              slots: JSON.stringify(
                Object.fromEntries(Object.entries(expected.slots).map(([k, v]) => [k, `${v}.jpg`])),
                Object.keys(expected.slots).sort(),
              ),
            }
          : {}),
        ...(expected.dialog !== undefined ? { dialog: expected.dialog } : {}),
        ...(expected.chips ? { chips: jpg(expected.chips) } : {}),
        ...(expected.sync ? { syncOk: true } : {}),
      })
  }
}
