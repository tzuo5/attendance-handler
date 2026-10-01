import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const candidates = process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  : [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(root => join(root, 'Google/Chrome/Application/chrome.exe'));
let executablePath;
for (const path of candidates) { try { await access(path); executablePath = path; break; } catch {} }
assert.ok(executablePath, 'Chrome is required for renderer acceptance checks');
const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const course = { id: '11111111-1111-4111-8111-111111111111', remoteId: 'demo', name: '示例课程', url: 'https://student.iclicker.com/#/course/demo/overview', latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 50, mode: 'notify' };
    const state = { courses: [course], session: null, logs: [], browserConnected: true, demo: true };
    let listener;
    window.__testState = patch => { Object.assign(state, patch); listener?.(structuredClone(state)); };
    window.attendance = {
      getState: async () => structuredClone(state), onState: cb => { listener = cb; return () => {}; },
      saveCourse: async c => { state.courses.push(c); listener?.(structuredClone(state)); return structuredClone(state); },
      deleteCourse: async () => structuredClone(state), login: async () => {}, importCourses: async () => [{ remoteId:'new',name:'导入课程',url:'https://student.iclicker.com/#/course/new/overview' }],
      start: async () => {}, stop: async () => {}, showClassroom: async () => {}, minimizeClassroom: async () => {}, testNotification: async () => {},
    };
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('heading', { name: '我的课程', exact: true }).waitFor();
  for (const [status, label, action, tone] of [
    ['monitoring','监控正常','查看课堂','success'], ['offline','正在重连','立即重试','warning'],
    ['needs-login','需要重新登录','重新登录','warning'], ['window-closed','课堂窗口已关闭','恢复课堂','warning'],
    ['attention','需要检查页面','检查课堂','error'], ['waiting','等待老师开课','查看课堂','neutral'],
  ]) {
    await page.evaluate(status => {
      window.__testState({ session: { id:'session', course:{id:'11111111-1111-4111-8111-111111111111',name:'示例课程',mode:'notify'}, startedAt:Date.now(),endsAt:Date.now()+60000,status,attendance:'confirmed',handled:{},detail:'模拟状态',lastSuccessfulCheckAt:Date.now() } });
    }, status);
    await page.getByRole('button',{ name:action,exact:true }).waitFor();
    assert.equal(await page.locator('.panel-label').innerText(),label);
    assert.ok(await page.locator(`.session-panel.status-${tone}`).count());
    assert.equal(await page.locator('.start-button').innerText(),label);
    assert.ok((await page.getByRole('button',{name:'结束上课',exact:true}).boundingBox()).y < 640);
  }
  await mkdir('.test-artifacts/phase1', { recursive:true });
  await page.screenshot({path:'.test-artifacts/phase1/status.png'});
  assert.deepEqual(errors,[]);
  console.log('Renderer acceptance passed: status, recovery actions, small window controls.');
} finally { await browser?.close(); await server.close(); }
