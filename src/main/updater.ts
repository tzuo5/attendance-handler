import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { releaseManifestSchema, newerVersion, UPDATE_INTERVAL_MS, UPDATE_TIMEOUT_MS, UPDATE_SITE, type ReleaseManifest, type UpdateState } from '../shared/update';

export interface UpdateAdapter {
  download(release: ReleaseManifest, progress: (percent: number) => void, signal: AbortSignal): Promise<void>;
  install(): Promise<void>;
  cancel(): void;
}
export interface UpdateDependencies {
  currentVersion: string; directory: string; supported: boolean; disabled?: boolean;
  fetch?: typeof fetch; manifestUrl?: string; timeoutMs?: number; intervalMs?: number;
  adapter: UpdateAdapter;
  changed(state: UpdateState): void;
  startupAvailable(): void;
  activeSession(): string | undefined;
  confirmInterruption(): Promise<boolean>;
  prepareInstall(): Promise<void>;
  installationFailed?(): void;
}
interface Cache { etag?: string; manifest: ReleaseManifest; checkedAt: number; }

// Network checks never participate in startup or classroom readiness.
export class UpdateService {
  state: UpdateState;
  private cache?: Cache;
  private checkPromise?: Promise<void>;
  private downloadPromise?: Promise<void>;
  private downloadController?: AbortController;
  private checkController?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;
  private startupPrompted = false;
  private readonly cachePath: string;
  constructor(private readonly deps: UpdateDependencies) {
    this.cachePath = join(deps.directory, 'update-cache.json');
    this.state = { phase: deps.disabled ? 'unsupported' : 'idle', currentVersion: deps.currentVersion, supported: deps.supported && !deps.disabled };
    try {
      const saved = JSON.parse(readFileSync(this.cachePath, 'utf8'));
      const manifest = releaseManifestSchema.parse(saved.manifest);
      if (Number.isFinite(saved.checkedAt)) {
        this.cache = { manifest, checkedAt: saved.checkedAt, etag: typeof saved.etag === 'string' && saved.etag.length < 512 ? saved.etag : undefined };
        this.state = { ...this.state, release: newerVersion(manifest.version, deps.currentVersion) ? manifest : undefined, checkedAt: saved.checkedAt };
      }
    } catch { /* A missing or corrupt update cache never affects course data. */ }
  }
  start() {
    if (this.deps.disabled || this.timer || this.disposed) return;
    void this.check(true);
    this.timer = setInterval(() => { void this.check(); }, this.deps.intervalMs ?? UPDATE_INTERVAL_MS);
    this.timer.unref?.();
  }
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.deps.changed(this.state);
  }
  check(startup = false): Promise<void> {
    if (this.deps.disabled || this.disposed || this.downloadPromise || this.state.phase === 'installing' || this.state.phase === 'ready') return Promise.resolve();
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.performCheck(startup).finally(() => { this.checkPromise = undefined; });
    return this.checkPromise;
  }
  private async performCheck(startup: boolean) {
    this.set({ phase: 'checking', detail: undefined });
    const controller = new AbortController(); this.checkController = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('检查更新超时，请稍后重试。')); }, this.deps.timeoutMs ?? UPDATE_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([this.fetchManifest(controller.signal), timeout]);
      if (this.disposed) return;
      this.cache = result;
      try {
        writeFileSync(this.cachePath + '.tmp', JSON.stringify(result), { mode: 0o600 });
        renameSync(this.cachePath + '.tmp', this.cachePath);
      } catch { /* Cache persistence is best effort, independently of state.json. */ }
      const available = newerVersion(result.manifest.version, this.deps.currentVersion);
      this.set({ phase: available ? 'available' : 'current', release: available ? result.manifest : undefined, checkedAt: result.checkedAt });
      if (startup && available && !this.startupPrompted) {
        this.startupPrompted = true; this.deps.startupAvailable();
      }
    } catch (error) {
      if (!this.disposed) this.set({ phase: 'error', detail: error instanceof Error && ['检查更新超时，请稍后重试。', '更新信息为空。', '更新信息过大。', '更新信息格式不正确。'].includes(error.message) ? error.message : '暂时无法检查更新，请稍后重试。' });
    } finally { clearTimeout(timer); if (this.checkController === controller) this.checkController = undefined; }
  }
  private async fetchManifest(signal: AbortSignal): Promise<Cache> {
    const response = await (this.deps.fetch ?? fetch)(this.deps.manifestUrl ?? `${UPDATE_SITE}version.json`, {
      signal, headers: this.cache?.etag ? { 'If-None-Match': this.cache.etag } : {}, cache: 'no-cache',
    });
    if (response.status === 304 && this.cache) return { ...this.cache, checkedAt: Date.now() };
    if (!response.ok) throw new Error('暂时无法检查更新，请稍后重试。');
    if (Number(response.headers.get('content-length')) > 65536) throw new Error('更新信息格式不正确。');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('更新信息为空。');
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 65536) throw new Error('更新信息过大。');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const manifest = releaseManifestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return { manifest, etag: response.headers.get('etag') ?? undefined, checkedAt: Date.now() };
  }
  download(): Promise<void> {
    if (this.downloadPromise) return this.downloadPromise;
    if (this.deps.disabled || this.disposed || !this.state.supported) return Promise.reject(new Error('此安装方式暂不支持自动更新，请到官网下载新版本。'));
    this.downloadPromise = this.performDownload().finally(() => { this.downloadPromise = undefined; this.downloadController = undefined; });
    return this.downloadPromise;
  }
  private async performDownload() {
    if (this.checkPromise) await this.checkPromise;
    const target = this.state.release;
    if (!target?.updates || !newerVersion(target.version, this.deps.currentVersion)) throw new Error('没有可自动安装的新版，请先检查更新。');
    const controller = new AbortController(); this.downloadController = controller;
    let consentedSession = this.deps.activeSession();
    if (consentedSession && !await this.deps.confirmInterruption()) return;
    if (controller.signal.aborted || this.disposed) return;
    this.set({ phase: 'downloading', progress: 0, detail: undefined });
    try {
      await this.deps.adapter.download(target, percent => {
        if (!controller.signal.aborted) this.set({ progress: Math.max(0, Math.min(100, percent)) });
      }, controller.signal);
      if (controller.signal.aborted || this.disposed) return;
      this.set({ phase: 'ready', progress: 100 });
      // Approval only covers the classroom the user actually saw in the dialog.
      while (this.deps.activeSession() && this.deps.activeSession() !== consentedSession) {
        const session = this.deps.activeSession();
        if (!await this.deps.confirmInterruption()) { this.deps.adapter.cancel(); this.set({ phase: 'available', progress: undefined }); return; }
        consentedSession = session;
        if (controller.signal.aborted || this.disposed) return;
      }
      this.set({ phase: 'installing' });
      await this.deps.prepareInstall();
      await this.deps.adapter.install();
    } catch (error) {
      this.deps.adapter.cancel();
      if (this.disposed) return;
      if (this.state.phase === 'installing') this.deps.installationFailed?.();
      this.set(controller.signal.aborted ? { phase: 'available', progress: undefined, detail: undefined } : {
        phase: 'error', progress: undefined, detail: error instanceof Error ? error.message : '更新失败，请重试。',
      });
    }
  }
  cancelDownload() {
    if (this.state.phase === 'installing') return;
    this.downloadController?.abort(); this.deps.adapter.cancel();
    if (this.state.phase === 'downloading' || this.state.phase === 'ready') this.set({ phase: 'available', progress: undefined });
  }
  dispose() {
    this.disposed = true; clearInterval(this.timer); this.checkController?.abort();
    if (this.state.phase !== 'installing') this.cancelDownload();
  }
}
