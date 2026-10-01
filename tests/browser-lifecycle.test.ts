import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ browser: undefined as any, launching: vi.fn() }));
vi.mock('playwright-core', () => ({ chromium: { connectOverCDP: async () => runtime.browser } }));
vi.mock('../src/main/platform', () => ({ activateChrome: vi.fn(), launchChrome: (...args: unknown[]) => runtime.launching(...args) }));
import { ChromeClassroom } from '../src/main/browser';

it.each(['last-tab', 'canceled-startup'])('cleans up the dedicated profile during %s', async scenario => {
  vi.useFakeTimers();
  const directory = mkdtempSync(join(tmpdir(), 'attendance-lock-test-'));
  mkdirSync(join(directory, 'chrome-profile'));writeFileSync(join(directory, 'chrome-profile', 'DevToolsActivePort'), '1234\n/devtools/browser/test');
  let alive = true, endpoint = true;
  const page = new EventEmitter() as any;
  page.url = () => 'about:blank';page.isClosed = () => false;page.evaluate = async () => true;
  const context = new EventEmitter() as any;
  context.pages = () => [page];context.setDefaultTimeout = () => {};
  const first = new EventEmitter() as any;
  first.contexts = () => [context];first.isConnected = () => endpoint;
  first.newBrowserCDPSession = async () => ({ detach: async () => {}, send: async (name: string) => {
    if (name === 'Browser.getVersion') return { userAgent: 'Chrome' };
    if (name === 'SystemInfo.getProcessInfo') return { processInfo: [{ type: 'browser', id: 987654 }] };
    if (name === 'Browser.close') { endpoint = false; if(scenario==='canceled-startup')alive=false; first.emit('disconnected'); }
    return {};
  } });
  runtime.browser = first;
  vi.spyOn(process, 'kill').mockImplementation((pid) => { if (pid !== 987654) throw new Error('unexpected process');if (alive) return true;throw Object.assign(new Error('exited'),{code:'ESRCH'}); });
  vi.stubGlobal('fetch', vi.fn(async () => { if (!endpoint) throw new Error('CDP disconnected');return { json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/browser/test' }) }; }));
  runtime.launching.mockImplementation(async () => {
    // A launch forwarded to the exiting owner is lost, matching the real profile
    // lock race. It cannot publish a new CDP endpoint while that PID is alive.
    if (!alive) { endpoint = true;runtime.browser = first; }
  });
  const browser = new ChromeClassroom(directory,'https://example.invalid',{isEncryptionAvailable:()=>true,encryptString:Buffer.from,decryptString:()=>''},()=>{},()=>{},'helper');
  try {
    if(scenario==='canceled-startup'){
      endpoint=false;let release!:()=>void;
      runtime.launching.mockImplementation(async()=>{await new Promise<void>(resolve=>{release=resolve;});endpoint=true;});
      const opening=browser.checkConnection();void opening.catch(()=>{});
      await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
      const disposing=browser.dispose();release();await vi.advanceTimersByTimeAsync(200);
      await expect(opening).rejects.toThrow(/aborted|退出/);await disposing;
      expect(endpoint).toBe(false);expect(alive).toBe(false);return;
    }
    await browser.checkConnection();
    context.pages = () => [];page.emit('close');
    await vi.waitFor(() => expect(endpoint).toBe(false));
    const reopening = browser.checkConnection();
    // Wait for either the process guard or the unsafe launch, rather than a
    // fixed delay that could pass while filesystem endpoint reads are pending.
    await vi.waitFor(() => expect(runtime.launching.mock.calls.length + vi.mocked(process.kill).mock.calls.length).toBeGreaterThan(0));
    expect(runtime.launching).not.toHaveBeenCalled();
    alive = false;await vi.advanceTimersByTimeAsync(500);
    context.pages = () => [page];
    await reopening;
    expect(runtime.launching).toHaveBeenCalledOnce();
    expect(browser.isOpen()).toBe(true);
  } finally {
    endpoint=false;await browser.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();
    rmSync(directory,{recursive:true,force:true});runtime.launching.mockReset();
  }
});
