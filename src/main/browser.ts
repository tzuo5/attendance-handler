import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { CourseConfig, PageSnapshot, QuestionSnapshot } from '../shared/types';
import { IClickerAdapter } from './iclicker';
import type { ClassroomDriver } from './watchdog';
import { activateChrome, launchChrome } from './platform';

export interface Cipher { isEncryptionAvailable(): boolean; encryptString(text: string): Buffer; decryptString(data: Buffer): string; }
export class SessionVault {
  private previous = '';
  constructor(private path: string, private cipher: Cipher, private origin: string) {}
  async load(): Promise<Record<string, string>> {
    try {
      const value = JSON.parse(this.cipher.decryptString(await readFile(this.path)));
      if (value.origin !== this.origin) return {};
      return value.storage;
    } catch { return {}; }
  }
  async capture(page: Page) {
    if (new URL(page.url()).origin !== this.origin) return;
    const storage = await page.evaluate(() => {
      const result: Record<string, string> = {};
      for (const key of ['access_token', 'refresh_token']) {
        const value = sessionStorage.getItem(key);
        if (value && value !== 'null' && value !== 'undefined') result[key] = value;
      }
      return result;
    });
    const json = JSON.stringify({ origin: this.origin, storage });
    if (json === this.previous) return;
    if (!this.cipher.isEncryptionAvailable()) throw new Error('系统安全存储加密不可用，无法保存登录状态。');
    await writeFile(this.path + '.tmp', this.cipher.encryptString(json), { mode: 0o600 });
    await rename(this.path + '.tmp', this.path); this.previous = json;
  }
}

export class ChromeClassroom implements ClassroomDriver {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  adapter?: IClickerAdapter;
  private deadline = 0;
  private startup?: Promise<void>;
  private shutdown?: Promise<void>;
  private checkpoint?: ReturnType<typeof setInterval>;
  private capturing = false;
  private activeCourse?: CourseConfig;
  private cachedCipherError = false;
  readonly profile: string;
  readonly vault: SessionVault;
  constructor(readonly directory: string, readonly origin: string, cipher: Cipher, private changed: () => void, private report: (message: string) => void, private nativeHelper: string) {
    this.profile = join(directory, 'chrome-profile');
    this.vault = new SessionVault(join(directory, 'session.enc'), cipher, origin);
  }
  isOpen() { return !!this.browser?.isConnected() && !!this.page && !this.page.isClosed(); }
  private async endpoint(): Promise<string | undefined> {
    try {
      const [port, path] = (await readFile(join(this.profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      if (!/^\d+$/.test(port) || !path?.startsWith('/devtools/browser/')) return;
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(700) });
      const data = await response.json() as { webSocketDebuggerUrl?: string };
      if (!data.webSocketDebuggerUrl?.endsWith(path)) return;
      return `ws://127.0.0.1:${port}${path}`;
    } catch { return; }
  }
  private async ensureConnected(signal?: AbortSignal) {
    if (this.shutdown) await this.shutdown;
    if (this.browser?.isConnected()) return;
    if (this.startup) return this.startup;
    this.startup = (async () => {
      signal?.throwIfAborted();
      await mkdir(this.profile, { recursive: true, mode: 0o700 });
      let endpoint = await this.endpoint();
      if (!endpoint) {
        await launchChrome(this.profile);
        for (let i = 0; i < 60 && !endpoint; i++) {
          signal?.throwIfAborted(); await delay(300); endpoint = await this.endpoint();
          // CDP can disconnect before Chrome releases the profile's process lock.
          // A launch during shutdown gets forwarded to the exiting process and is
          // lost. Retry only while this dedicated profile has no live endpoint.
          if (!endpoint && (i === 19 || i === 39)) {
            signal?.throwIfAborted(); await launchChrome(this.profile);
          }
        }
      }
      if (!endpoint) throw new Error('专用 Chrome 连接超时，请关闭 App 的专用浏览器后重试。');
      signal?.throwIfAborted();
      this.browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
      this.context = this.browser.contexts()[0];
      if (!this.context) throw new Error('无法连接 Chrome 默认会话。');
      this.context.setDefaultTimeout(5000);
      const context = this.context;
      const connectedBrowser = this.browser;
      const onPage = (page: Page) => page.on('close', () => {
        if (page === this.page) this.changed();
        // The final window may belong to a tab the user opened manually.
        if (!context.pages().some(open => !open.isClosed())) void this.closeBrowser(connectedBrowser).catch(error => this.report(String(error)));
      });
      for (const page of context.pages()) onPage(page);
      context.on('page', onPage);
      this.browser.on('disconnected', () => { this.changed(); });
      clearInterval(this.checkpoint);
      this.checkpoint = setInterval(() => { void this.capture(); }, 5000);
      this.changed();
    })().finally(() => { this.startup = undefined; });
    return this.startup;
  }
  private async attach(page: Page) {
    this.page = page; this.adapter = new IClickerAdapter(page, this.origin);
    // Restore only a new tab, never an already-loaded page where the user may
    // have deliberately signed out. Remove the script after its first load so
    // a later logout + reload cannot resurrect an old session.
    if (new URL(page.url()).origin !== this.origin) {
      const storage = await this.vault.load();
      if (Object.keys(storage).length) {
        const restoration = await page.addInitScript(({ origin, storage }) => {
          if (location.origin !== origin || window !== window.top) return;
          for (const [key, value] of Object.entries(storage)) if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
        }, { origin: this.origin, storage });
        const disposeRestoration = () => {
          if (new URL(page.url()).origin !== this.origin) return;
          page.off('domcontentloaded', disposeRestoration);
          void restoration.dispose().catch(() => {});
        };
        page.on('domcontentloaded', disposeRestoration);
      }
    }
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); this.report('iClicker 出现网页提示，请检查课堂状态。'); });
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && this.deadline > Date.now() && new URL(frame.url()).origin === this.origin) void this.armPage().catch(() => {});
    });
  }
  private async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    const existing = this.context!.pages().find(p => p.url().startsWith(this.origin)) || this.context!.pages().find(p => p.url() === 'about:blank');
    if (existing) { await this.attach(existing); return existing; }
    const cdp = await this.browser!.newBrowserCDPSession();
    const pagePromise = this.context!.waitForEvent('page', { timeout: 10000 });
    try {
      await cdp.send('Target.createTarget', { url: 'about:blank', background: true });
      await this.attach(await pagePromise); return this.page!;
    } finally { await cdp.detach(); }
  }
  private async armPage() {
    if (!this.isOpen()) return;
    await this.page!.evaluate(deadline => { (window as unknown as { __attendanceDeadline: number }).__attendanceDeadline = deadline; }, this.deadline);
  }
  async prepare(course: CourseConfig, deadline: number, signal: AbortSignal) {
    this.activeCourse = course; this.deadline = deadline;
    await this.ensureConnected(signal); signal.throwIfAborted();
    const page = await this.ensurePage(); signal.throwIfAborted();
    await this.context!.grantPermissions(['geolocation'], { origin: this.origin });
    await this.context!.setGeolocation({ latitude: course.latitude, longitude: course.longitude, accuracy: course.accuracy });
    signal.throwIfAborted();
    await page.goto(course.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    signal.throwIfAborted(); await this.armPage(); await this.capture(); this.changed();
  }
  async login() {
    await this.ensureConnected();
    const page = await this.ensurePage();
    if (!page.url().startsWith(this.origin)) await page.goto(`${this.origin}/#/courses`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await this.show();
  }
  async importCourses() {
    if (this.deadline > Date.now()) throw new Error('上课期间不能刷新课程列表，请先结束当前监控。');
    await this.ensureConnected();
    const page = await this.ensurePage();
    await page.goto(`${this.origin}/#/courses`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    for (let i = 0; i < 20; i++) {
      const snapshot = await this.adapter!.read();
      if (snapshot.state === 'login') throw new Error('请先点击“登录 iClicker”，在 Chrome 中完成登录。');
      const courses = await this.adapter!.courses();
      if (courses.length) { await this.capture(); return courses; }
      await delay(500);
    }
    throw new Error('未读取到课程。请确认已登录且课程列表已加载；也可以手动粘贴课程链接。');
  }
  async read(): Promise<PageSnapshot> {
    if (!this.isOpen()) throw new Error('课堂窗口已关闭');
    await this.armPage();
    await this.capture();
    return this.adapter!.read();
  }
  async join(signal: AbortSignal) { await this.adapter!.clickJoin(this.deadline, signal); }
  async answerA(q: QuestionSnapshot, signal: AbortSignal) { await this.adapter!.selectA(q, this.deadline, signal); }
  async show() {
    await this.ensureConnected();
    const page = await this.ensurePage();
    if (this.activeCourse && this.deadline > Date.now()) {
      const courseId = `${new URL(page.url()).pathname}${new URL(page.url()).hash}`.match(/\/(?:class|course)\/([^/?#]+)/)?.[1];
      // Explicit user action permits restoring a closed/navigated classroom.
      if (courseId !== this.activeCourse.remoteId) await page.goto(this.activeCourse.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await this.context!.grantPermissions(['geolocation'], { origin: this.origin });
      await this.context!.setGeolocation({ latitude: this.activeCourse.latitude, longitude: this.activeCourse.longitude, accuracy: this.activeCourse.accuracy });
      await this.armPage();
    }
    const cdp = await this.context!.newCDPSession(page);
    try {
      const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
      if (bounds.windowState === 'minimized') await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await page.bringToFront();
      // Activating Chrome is reserved exclusively for this user-triggered method.
      const browserCDP = await this.browser!.newBrowserCDPSession();
      try {
        const { processInfo } = await browserCDP.send('SystemInfo.getProcessInfo');
        const process = processInfo.find(p => p.type === 'browser');
        if (process) await activateChrome(this.nativeHelper, process.id);
      } finally { await browserCDP.detach(); }
    } finally { await cdp.detach(); }
    this.changed();
  }
  async minimize() {
    if (!this.isOpen()) return;
    const cdp = await this.context!.newCDPSession(this.page!);
    try { const { windowId } = await cdp.send('Browser.getWindowForTarget'); await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } }); }
    finally { await cdp.detach(); }
  }
  async capture() {
    if (!this.isOpen() || this.capturing) return;
    this.capturing = true;
    try { await this.vault.capture(this.page!); }
    catch (error) {
      if (!this.cachedCipherError && error instanceof Error && error.message.includes('安全存储')) { this.cachedCipherError = true; this.report(error.message); }
    } finally { this.capturing = false; }
  }
  async disarm() {
    this.deadline = 0;
    if (this.isOpen()) await this.armPage().catch(() => {});
    if (this.browser?.isConnected()) {
      await this.context?.setGeolocation(null);
      await this.context?.clearPermissions();
    }
    await this.capture();
  }
  private closeBrowser(browser = this.browser): Promise<void> {
    if (this.shutdown) return this.shutdown;
    if (browser !== this.browser) return Promise.resolve();
    if (!browser?.isConnected()) return Promise.resolve();
    this.shutdown = (async () => {
      const cdp = await browser.newBrowserCDPSession();
      try {
        await cdp.send('Browser.close');
      } catch (error) {
        if (browser.isConnected()) throw error;
      }
      for (let i = 0; i < 50 && browser.isConnected(); i++) await delay(100);
      if (browser.isConnected()) throw new Error('专用 Chrome 未能正常退出');
    })().finally(() => { this.shutdown = undefined; });
    return this.shutdown;
  }
  async dispose() {
    clearInterval(this.checkpoint);
    try { await this.disarm(); }
    finally { await this.closeBrowser(); }
  }
}
