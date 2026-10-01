import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright-core';
import { buildSite } from './build-site.mjs';
import { assetNames, releaseBase } from './release-metadata.mjs';

const siteDirectory = resolve('.test-artifacts/updates/site');
// Offline published-release fixture keeps UI tests independent of GitHub availability.
const names = [...Object.values(assetNames('0.1.1')), 'SHA256SUMS.txt', 'SHA256SUMS-windows.txt'];
await buildSite({ destination: siteDirectory, release: { tag_name: 'v0.1.1', draft: false, prerelease: false, published_at: '2026-09-22T12:00:00Z', assets: names.map(name => ({ name, state: 'uploaded', size: 100, browser_download_url: releaseBase('0.1.1') + name })) } });

const candidates = process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(root => join(root, 'Google/Chrome/Application/chrome.exe'));
let executablePath; for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
assert.ok(executablePath, 'Chrome is required for renderer verification');
const vite = await createViteServer({ logLevel: 'error', server: { port: 0 } }); await vite.listen();
const website = createServer(async (request, response) => {
  const relative = decodeURIComponent(request.url.split('?')[0]).replace(/^\/attendance-handler\//, '').replace(/^\//, '') || 'index.html';
  const file = resolve(siteDirectory, relative);
  if (!file.startsWith(siteDirectory + sep)) { response.writeHead(403); response.end(); return; }
  try { response.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' })[extname(file)] || 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => website.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath, headless: true });
await mkdir('.test-artifacts/updates', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const state = { courses: [], schedules: [], scheduledRuns: [], logs: [], summaries: [], session: null, demo: true, browserConnected: false, classroomOrigin: 'https://student.iclicker.com', setup: { step: 'complete', completedSteps: [], dismissed: true, completedAt: 1 }, update: { currentVersion: '0.1.1', supported: true, phase: 'current' } };
    let listener;
    window.__updateCalls = { download: 0, cancel: 0, check: 0, page: 0 };
    window.__setUpdate = patch => { Object.assign(state.update, patch); listener?.(structuredClone(state)); };
    window.attendance = { getState: async () => structuredClone(state), onState: callback => { listener = callback; return () => {}; }, checkForUpdates: async () => { window.__updateCalls.check++; }, downloadUpdate: async () => { window.__updateCalls.download++; }, cancelUpdate: async () => { window.__updateCalls.cancel++; }, openUpdatePage: async () => { window.__updateCalls.page++; } };
  });
  await page.goto(vite.resolvedUrls.local[0]); const panel = page.getByRole('region', { name: '应用更新', exact: true });
  await panel.getByText('已是最新版', { exact: true }).waitFor();
  await page.evaluate(() => window.__setUpdate({ phase: 'available', release: { version: '0.1.2', updates: {} } }));
  await panel.getByRole('button', { name: '下载更新', exact: true }).click(); assert.equal(await page.evaluate(() => window.__updateCalls.download), 1);
  assert.equal(await page.getByRole('dialog').count(), 0, 'background availability is passive');
  await page.evaluate(() => window.__setUpdate({ phase: 'downloading', progress: 37 }));
  await panel.getByText('正在下载 37%', { exact: true }).waitFor(); await panel.getByRole('button', { name: '取消下载', exact: true }).click(); assert.equal(await page.evaluate(() => window.__updateCalls.cancel), 1);
  assert.equal(await panel.getByRole('button', { name: '下载更新', exact: true }).count(), 0);
  await page.evaluate(() => window.__setUpdate({ phase: 'error', detail: '更新校验失败，请重试。' }));
  await panel.getByRole('button', { name: '重试检查更新', exact: true }).click(); assert.equal(await page.evaluate(() => window.__updateCalls.check), 1);
  await page.screenshot({ path: '.test-artifacts/updates/app-download.png' });
  await page.evaluate(() => window.__setUpdate({ phase: 'available', supported: false }));
  await panel.getByRole('button', { name: '前往官网下载', exact: true }).click(); assert.equal(await page.evaluate(() => window.__updateCalls.page), 1);
  await page.close();
  const site = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' }); site.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${website.address().port}/attendance-handler/`;
  await site.goto(url); await site.getByText('v0.1.1', { exact: true }).waitFor();
  assert.match(await site.locator('#mac-download').getAttribute('href'), /v0\.1\.1\/Attendance-Handler-0\.1\.1-mac-universal\.dmg$/);
  assert.match(await site.locator('#windows-download').getAttribute('href'), /v0\.1\.1\/Attendance-Handler-0\.1\.1-win-x64-Setup\.exe$/);
  assert.equal(await site.locator('#modern-features').isVisible(), false);
  assert.equal(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await site.screenshot({ path: '.test-artifacts/updates/website-en.png', fullPage: true });
  await site.getByRole('button', { name: 'Switch to Chinese', exact: true }).click(); assert.equal(await site.locator('html').getAttribute('lang'), 'zh-CN');
  await site.reload(); assert.equal(await site.locator('html').getAttribute('lang'), 'zh-CN');
  await site.setViewportSize({ width: 390, height: 844 });
  await site.getByRole('link', { name: '下载 macOS 版', exact: true }).waitFor();
  assert.equal(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await site.screenshot({ path: '.test-artifacts/updates/website-zh-mobile.png', fullPage: true });
  await site.route('**/version.json', route => route.fulfill({ status: 503, body: 'unavailable' })); await site.reload();
  assert.equal(await site.locator('#mac-download').getAttribute('href'), 'https://github.com/tzuo5/attendance-handler/releases/latest');
  assert.deepEqual(errors, []);
  console.log('Update renderer and website passed: passive button, progress, cancel/retry, installer fallback, real release links, bilingual persistence, mobile width, metadata outage.');
} finally { await browser.close(); await vite.close(); await new Promise(resolve => website.close(resolve)); }
