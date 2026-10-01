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
  await page.evaluate(() => window.__testState({logs:Array.from({length:80},(_,i)=>({id:`event-${i}`,at:Date.now()-i*10000,level:i%2?'info':'success',event:i%2?'question-opened':'answer-confirmed',sessionId:'session',courseName:'示例课程',questionTitle:`题目 ${i}`,message:'示例事件',confirmedAt:i%2?undefined:Date.now()-i*10000}))}));
  await page.getByRole('button',{name:'课堂记录',exact:true}).click();
  assert.equal(await page.locator('.log-entry').count(),80);
  await page.getByLabel('事件级别',{exact:true}).selectOption('success');
  assert.equal(await page.locator('.log-entry').count(),40);
  await page.getByLabel('事件级别',{exact:true}).selectOption('all');
  await page.getByLabel('搜索记录',{exact:true}).fill('题目 79');
  assert.equal(await page.locator('.log-entry').count(),1);
  await page.getByLabel('搜索记录',{exact:true}).fill('');
  await page.locator('.log-list').evaluate(element => {element.scrollTop=600;});
  await page.evaluate(async () => {const state=await window.attendance.getState();window.__testState({logs:[{id:'new-event',at:Date.now(),level:'warning',message:'新事件'},...state.logs]});});
  await page.getByRole('button',{name:'查看 1 条新事件',exact:true}).waitFor();
  assert.ok(await page.locator('.log-list').evaluate(element=>element.scrollTop)>600);
  await page.getByRole('button',{name:'查看 1 条新事件',exact:true}).click();
  assert.equal(await page.locator('.log-list').evaluate(element=>element.scrollTop),0);
  await mkdir('.test-artifacts/phase1', { recursive:true });
  await page.screenshot({path:'.test-artifacts/phase1/logs.png'});
  assert.deepEqual(errors,[]);
  console.log('Renderer acceptance passed: status, recovery actions, small window controls, full event log and reading position.');
} finally { await browser?.close(); await server.close(); }
