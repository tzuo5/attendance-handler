import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createMockClassroom } from './mock-classroom.mjs';

await mkdir('.test-artifacts', { recursive: true });
await build({ entryPoints: ['src/main/browser.ts'], outfile: '.test-artifacts/chrome-lifecycle-browser.mjs', format: 'esm', bundle: true, platform: 'node', external: ['playwright-core'] });
const { ChromeClassroom } = await import(pathToFileURL(resolve('.test-artifacts/chrome-lifecycle-browser.mjs')));
const mock = await createMockClassroom();
const directory = await mkdtemp(join(tmpdir(), 'attendance-chrome-lifecycle-'));
const cipher = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: data => data.toString() };
const helper = resolve(`dist-electron/attendance-native${process.platform === 'win32' ? '.exe' : ''}`);
const browser = new ChromeClassroom(directory, mock.origin, cipher, () => {}, () => {}, helper);
const course = { id: '11111111-1111-4111-8111-111111111111', remoteId: 'demo', name: 'Lifecycle', url: `${mock.origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 5, mode: 'notify' };
const prepare = () => browser.prepare(course, Date.now() + 300000, new AbortController().signal);
const pidOf = async () => {
  const cdp = await browser.browser.newBrowserCDPSession();
  try { return (await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(info => info.type === 'browser').id; }
  finally { await cdp.detach(); }
};
const isAlive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};
async function until(condition, message) {
  for (let i = 0; i < 100; i++) {
    if (await condition()) return;
    await delay(100);
  }
  throw new Error(message);
}

try {
  await prepare();
  const first = browser.browser;
  const firstPid = await pidOf();
  await browser.page.close();
  await until(() => !first.isConnected() && !isAlive(firstPid), 'closing the last dedicated Chrome tab left its process running');
  await prepare();
  assert.equal(browser.isOpen(), true, 'the dedicated Chrome must reopen on demand');
  const second = browser.browser;
  const secondPid = await pidOf();
  const extra = await browser.context.newPage();
  await browser.page.close();
  assert.equal(second.isConnected(), true, 'closing one of several tabs must keep Chrome running');
  await extra.close();
  await until(() => !second.isConnected() && !isAlive(secondPid), 'closing the last user-opened tab left Chrome running');
  await prepare();
  const third = browser.browser;
  const thirdPid = await pidOf();
  await browser.dispose();
  await until(() => !third.isConnected() && !isAlive(thirdPid), 'quitting the app left its dedicated Chrome process running');
  console.log('Dedicated Chrome exits with its last tab or the app, preserves other open tabs, and reopens on demand.');
} finally {
  if (browser.browser?.isConnected()) {
    const cdp = await browser.browser.newBrowserCDPSession();
    await cdp.send('Browser.close').catch(() => {});
  }
  await mock.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
