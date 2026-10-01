import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateService, type UpdateAdapter } from '../src/main/updater';
import { newerVersion, releaseManifestSchema, type ReleaseManifest } from '../src/shared/update';

const base = 'https://github.com/tzuo5/attendance-handler/releases/download/v0.1.2/';
const manifest: ReleaseManifest = { schemaVersion: 1, version: '0.1.2', publishedAt: '2026-10-01T12:00:00Z', releaseUrl: 'https://github.com/tzuo5/attendance-handler/releases/tag/v0.1.2', downloads: { mac: base + 'Attendance-Handler-0.1.2-mac-universal.dmg', windows: base + 'Attendance-Handler-0.1.2-win-x64-Setup.exe' }, updates: { macAppcast: base + 'appcast.xml', windowsFeed: base } };
const directories: string[] = [], services: UpdateService[] = [];
function deferred<T = void>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(overrides: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'attendance-update-test-')); directories.push(directory);
  const adapter: UpdateAdapter = { download: vi.fn(async () => {}), install: vi.fn(async () => {}), cancel: vi.fn() };
  const deps = { currentVersion: '0.1.1', directory, supported: true, adapter, fetch: vi.fn<typeof fetch>(async () => new Response(JSON.stringify(manifest), { headers: { ETag: '"release-2"' } })), changed: vi.fn(), startupAvailable: vi.fn(), activeSession: vi.fn((): string | undefined => undefined), confirmInterruption: vi.fn(async () => true), prepareInstall: vi.fn(async () => {}), installationFailed: vi.fn(), ...overrides };
  const service = new UpdateService(deps); services.push(service); return { service, deps, adapter, directory };
}
afterEach(() => { services.splice(0).forEach(service => service.dispose()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); vi.useRealTimers(); });

describe('release versions and provenance', () => {
  it('compares numerical version segments and never downgrades or installs prereleases', () => {
    expect(newerVersion('0.1.10', '0.1.9')).toBe(true); expect(newerVersion('1.0.0', '0.99.99')).toBe(true);
    for (const value of ['0.1.1', '0.1.0', 'v0.1.2', '0.1.2-beta.1', 'garbage']) expect(newerVersion(value, '0.1.1')).toBe(false);
  });
  it('rejects off-repository URLs and mixed-version feeds', () => {
    expect(releaseManifestSchema.safeParse(manifest).success).toBe(true);
    expect(releaseManifestSchema.safeParse({ ...manifest, downloads: { ...manifest.downloads, mac: 'https://example.com/app.zip' } }).success).toBe(false);
    expect(releaseManifestSchema.safeParse({ ...manifest, updates: { ...manifest.updates, windowsFeed: base.replace('0.1.2', '0.1.3') } }).success).toBe(false);
  });
});
describe('non-blocking checks', () => {
  it('checks once at startup, hourly thereafter, and prompts only for the startup result', async () => {
    vi.useFakeTimers(); const { service, deps } = fixture(); service.start(); service.start();
    await service.check(); expect(deps.fetch).toHaveBeenCalledTimes(1); expect(deps.startupAvailable).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3600000); expect(deps.fetch).toHaveBeenCalledTimes(2); expect(deps.startupAvailable).toHaveBeenCalledTimes(1);
  });
  it('deduplicates in-flight checks without blocking the caller that starts the app', async () => {
    const pending = deferred<Response>(); const { service, deps } = fixture({ fetch: vi.fn(() => pending.promise) });
    service.start(); const check = service.check(); expect(deps.fetch).toHaveBeenCalledTimes(1);
    pending.resolve(new Response(JSON.stringify(manifest))); await check; expect(service.state.phase).toBe('available');
  });
  it('aborts a request after the total deadline and does not report latest or show a popup', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const { service, deps } = fixture({ fetch: fetcher }); const check = service.check(true);
    await vi.advanceTimersByTimeAsync(3000); await check;
    expect(service.state.phase).toBe('error'); expect(deps.startupAvailable).not.toHaveBeenCalled(); expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('times out a stalled response body as well as initial connection', async () => {
    vi.useFakeTimers(); const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } });
    const { service } = fixture({ fetch: vi.fn(async () => new Response(stream)) }); const check = service.check(); await vi.advanceTimersByTimeAsync(3000); await check;
    expect(service.state.phase).toBe('error');
  });
  it('uses ETag and cached content for a 304, independently of course storage', async () => {
    const { service, deps, directory } = fixture(); await service.check();
    deps.fetch.mockResolvedValueOnce(new Response(null, { status: 304 })); await service.check(true);
    expect(deps.fetch.mock.calls[1][1]?.headers).toEqual({ 'If-None-Match': '"release-2"' }); expect(service.state.release?.version).toBe('0.1.2');
    expect(JSON.parse(readFileSync(join(directory, 'update-cache.json'), 'utf8')).manifest.version).toBe('0.1.2');
  });
  it.each([new Response('not json'), new Response('{}'), new Response('x'.repeat(65537)), new Response('', { status: 503 })])('tolerates invalid/unavailable metadata', async response => {
    const { service, deps } = fixture({ fetch: vi.fn(async () => response) }); await service.check(true);
    expect(service.state.phase).toBe('error'); expect(deps.startupAvailable).not.toHaveBeenCalled();
  });
  it('ignores a damaged cache and keeps network errors distinct from current', async () => {
    const { deps, directory } = fixture(); writeFileSync(join(directory, 'update-cache.json'), '{broken');
    const service = new UpdateService({ ...deps, fetch: vi.fn(async () => { throw new Error('offline'); }) }); services.push(service);
    await service.check(); expect(service.state.phase).toBe('error');
  });
  it('does no networking for development/demo runs', async () => {
    const { service, deps } = fixture({ disabled: true }); service.start(); await service.check(); expect(deps.fetch).not.toHaveBeenCalled();
  });
});
describe('download, consent, and install handoff', () => {
  it('downloads once and prepares cleanup before installation without a second user click', async () => {
    const pending = deferred(); const { service, adapter, deps } = fixture(); await service.check();
    vi.mocked(adapter.download).mockImplementation(async (_release, progress) => { progress(42); await pending.promise; });
    const first = service.download(); const second = service.download(); expect(first).toBe(second); expect(service.state.progress).toBe(42);
    expect(deps.prepareInstall).not.toHaveBeenCalled(); pending.resolve(); await first;
    expect(adapter.download).toHaveBeenCalledTimes(1); expect(deps.prepareInstall.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(adapter.install).mock.invocationCallOrder[0]);
  });
  it('keeps class running if confirmation is declined or download fails', async () => {
    const { service, adapter, deps } = fixture({ activeSession: vi.fn(() => 'class-1') }); await service.check();
    deps.confirmInterruption.mockResolvedValueOnce(false); await service.download(); expect(adapter.download).not.toHaveBeenCalled();
    vi.mocked(adapter.download).mockRejectedValueOnce(new Error('checksum mismatch')); await service.download();
    expect(deps.prepareInstall).not.toHaveBeenCalled(); expect(adapter.install).not.toHaveBeenCalled(); expect(service.state.phase).toBe('error');
  });
  it('reconfirms a different classroom that starts during the download', async () => {
    const pending = deferred(); let session: string | undefined;
    const { service, deps, adapter } = fixture({ activeSession: vi.fn(() => session) }); await service.check();
    vi.mocked(adapter.download).mockImplementation(() => pending.promise); const download = service.download();
    session = 'new-class'; deps.confirmInterruption.mockResolvedValueOnce(false); pending.resolve(); await download;
    expect(deps.confirmInterruption).toHaveBeenCalledTimes(1); expect(deps.prepareInstall).not.toHaveBeenCalled(); expect(adapter.install).not.toHaveBeenCalled();
  });
  it('does not ask twice for the same approved class', async () => {
    const { service, deps } = fixture({ activeSession: vi.fn(() => 'class-1') }); await service.check(); await service.download();
    expect(deps.confirmInterruption).toHaveBeenCalledTimes(1); expect(deps.prepareInstall).toHaveBeenCalledTimes(1);
  });
  it('cancellation never stops the class, even if a downloader ignores the signal', async () => {
    const pending = deferred(); const { service, deps, adapter } = fixture(); await service.check(); vi.mocked(adapter.download).mockImplementation(() => pending.promise);
    const download = service.download(); service.cancelDownload(); pending.resolve(); await download;
    expect(deps.prepareInstall).not.toHaveBeenCalled(); expect(adapter.install).not.toHaveBeenCalled(); expect(service.state.phase).toBe('available');
  });
  it('restores scheduling if install preparation or handoff fails', async () => {
    const { service, deps, adapter } = fixture(); await service.check(); vi.mocked(adapter.install).mockRejectedValueOnce(new Error('spawn failed')); await service.download();
    expect(deps.installationFailed).toHaveBeenCalledTimes(1); expect(service.state.phase).toBe('error');
  });
});
