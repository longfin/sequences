import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

/** What the UI shows: enough to compare two devices. */
export interface DeviceState {
  sync: string | null
  tray: string[]
  placed: string[]
  dialog: boolean
  cards: number
  chips: string[]
}

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
    await page.goto('/')
    await page.locator('.spread-card').first().waitFor()
    return device
  }

  /** a second tab on the same device */
  async newTab(): Promise<Page> {
    const page = await this.context.newPage()
    await this.prepare(page)
    await page.goto('/')
    await page.locator('.spread-card').first().waitFor()
    return page
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

  // ---- photos ----

  /** import synthetic JPEGs named `<name>.jpg` through the tray's file input */
  async importPhotos(names: string[], page: Page = this.page) {
    await this.dispatchImport(names, page)
    try {
      for (const name of names) await page.locator(`.tray-photo img[alt="${name}.jpg"]`).waitFor({ timeout: 10_000 })
    } catch {
      const diag = await page.evaluate(async () => {
        const idb = await new Promise<IDBDatabase>((res, rej) => {
          const r = indexedDB.open('sequences')
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
        const count = await new Promise<number>((res) => {
          const r = idb.transaction('photos').objectStore('photos').count()
          r.onsuccess = () => res(r.result)
        })
        return {
          busy: document.querySelector('.busy')?.textContent ?? null,
          idbPhotos: count,
          tray: document.querySelectorAll('.tray-photo').length,
          inert: document.querySelector('.app')?.hasAttribute('inert'),
          input: !!document.querySelector('.tray input[type=file]'),
        }
      })
      console.log(`[${this.name}] import of ${names.join(',')} did not show up; diagnostics:`, JSON.stringify(diag))
      throw new Error(`import did not show up: ${JSON.stringify(diag)}`)
    }
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

  // ---- sync menu ----

  private syncButton(page: Page = this.page) {
    return page.locator('.toolbar button', { hasText: /^(Sync|동기화|同期)/ }).first()
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

  async logOut(page: Page = this.page) {
    await this.openSync(page)
    await page.locator('.sync-menu button', { hasText: /log out|로그아웃|ログアウト/ }).click()
    await expect(this.syncButton(page)).toHaveText(/^(Sync|동기화|同期)$/)
  }

  async waitSynced(page: Page = this.page) {
    await expect(this.syncButton(page)).toHaveText(/Sync on|동기화 켜짐|同期オン/)
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
      remote: /cloud sequence|클라우드 시퀀스|クラウドのシーケンス/,
      local: /this device’s sequence|이 기기 시퀀스|このデバイスのシーケンス/,
      upload: /^(Upload|올리기|アップロード)$/,
      cancel: /Cancel|취소|キャンセル/,
    }[which]
    await this.dialog(page).locator('button', { hasText: re }).click()
  }

  // ---- state ----

  async state(page: Page = this.page): Promise<DeviceState> {
    return page.evaluate(() => ({
      sync:
        [...document.querySelectorAll('.toolbar button')].find((b) => /^(Sync|동기화|同期)/.test(b.textContent ?? ''))
          ?.textContent ?? null,
      tray: [...document.querySelectorAll<HTMLImageElement>('.tray-photo img')].map((i) => i.alt),
      placed: [...document.querySelectorAll<HTMLImageElement>('.page-slot.filled img')].map((i) => i.alt),
      dialog: !!document.querySelector('.sync-dialog'),
      cards: document.querySelectorAll('.spread-card').length,
      chips: [...document.querySelectorAll('.tray-photo')]
        .filter((p) => p.querySelector('.tray-chip'))
        .map((p) => p.querySelector('img')!.alt),
    }))
  }

  /** poll the UI until `expected` matches (tray/placed compared as sets) */
  async expectState(expected: Partial<{ tray: string[]; placed: string[]; dialog: boolean; chips: string[] }>, page: Page = this.page) {
    const norm = (a: string[]) => [...a].sort().join(',')
    await expect
      .poll(
        async () => {
          const s = await this.state(page)
          return {
            tray: norm(s.tray),
            placed: norm(s.placed),
            dialog: s.dialog,
            chips: norm(s.chips),
          }
        },
        { timeout: 20_000, message: `${this.name} state` },
      )
      .toMatchObject({
        ...(expected.tray ? { tray: norm(expected.tray.map((n) => `${n}.jpg`)) } : {}),
        ...(expected.placed ? { placed: norm(expected.placed.map((n) => `${n}.jpg`)) } : {}),
        ...(expected.dialog !== undefined ? { dialog: expected.dialog } : {}),
        ...(expected.chips ? { chips: norm(expected.chips.map((n) => `${n}.jpg`)) } : {}),
      })
  }
}
