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
    const state = { courses: [course], session: null, logs: [], browserConnected: true, demo: true, classroomOrigin:'https://student.iclicker.com' };
    let listener;
    window.__testState = patch => { Object.assign(state, patch); listener?.(structuredClone(state)); };
    window.attendance = {
      getState: async () => structuredClone(state), onState: cb => { listener = cb; return () => {}; },
      saveCourse: async c => { state.courses.push(c); listener?.(structuredClone(state)); return structuredClone(state); },
      deleteCourse: async () => structuredClone(state), login: async () => {}, importCourses: async () => [{ remoteId:'new',name:'导入课程',url:'https://student.iclicker.com/#/course/new/overview' }],
      extend:async()=>{state.session.endsAt+=600000;listener?.(structuredClone(state));}, start: async () => {}, stop: async () => {}, showClassroom: async () => {}, minimizeClassroom: async () => {}, testNotification: async () => {},
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
  const originalEnd = await page.evaluate(async ()=>(await window.attendance.getState()).session.endsAt);
  await page.getByRole('button',{name:'本次延长 10 分钟',exact:true}).click();
  assert.equal(await page.evaluate(async ()=>(await window.attendance.getState()).session.endsAt),originalEnd+600000);
  await page.evaluate(async () => {
    const state = await window.attendance.getState();
    window.__testState({session:{...state.session,status:'needs-answer',question:{key:'q-feedback',title:'示例待答题目',kind:'single',open:true,answered:false,selected:false},questions:{'q-feedback':{key:'q-feedback',title:'示例待答题目',kind:'single',firstSeenAt:Date.now(),lastSeenAt:Date.now()}}}});
  });
  await page.getByRole('heading',{name:'示例待答题目',exact:true}).waitFor();
  await page.getByRole('button',{name:'前往作答',exact:true}).waitFor();
  await page.evaluate(async () => {const state=await window.attendance.getState();state.session.handled['q-feedback']='attempted';state.session.questions['q-feedback'].attemptedAt=Date.now();window.__testState(state);});
  await page.getByText('已尝试，等待确认',{exact:true}).waitFor();
  await page.getByRole('button',{name:'查看提交结果',exact:true}).waitFor();
  await page.evaluate(async () => {const state=await window.attendance.getState();state.session.questions['q-feedback'].confirmedAt=Date.now();state.session.handled['q-feedback']='confirmed';state.session.question.answered=true;window.__testState(state);});
  await page.getByText('答案已确认收到',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'查看提交结果',exact:true}).count(),0);
  await page.evaluate(async () => {const state=await window.attendance.getState();state.session.status='offline';state.session.question=undefined;window.__testState(state);});
  await page.getByText('历史题目 · 恢复后核实当前课堂',{exact:false}).waitFor();
  await page.evaluate(async () => {const state=await window.attendance.getState();state.session.status='monitoring';state.session.questions['q-feedback'].closedAt=Date.now();window.__testState(state);});
  await page.getByText('最近题目',{exact:false}).waitFor();
  assert.equal(await page.getByText('历史题目 · 恢复后核实当前课堂',{exact:false}).count(),0);
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
  const anchorBefore=await page.locator('.log-entry').nth(5).evaluate(element=>({id:element.querySelector('.log-question').textContent,top:element.getBoundingClientRect().top}));
  await page.evaluate(async () => {const state=await window.attendance.getState();window.__testState({logs:[{id:'new-event',at:Date.now(),level:'warning',message:'新事件'},...state.logs.slice(0,-1)]});});
  await page.getByRole('button',{name:'查看 1 条新事件',exact:true}).waitFor();
  assert.ok(await page.locator('.log-list').evaluate(element=>element.scrollTop)>600);
  const anchorAfter=await page.getByRole('heading',{name:anchorBefore.id,exact:true}).evaluate(element=>element.closest('.log-entry').getBoundingClientRect().top);
  assert.ok(Math.abs(anchorAfter-anchorBefore.top)<1,'reading position stays fixed when retention removes an older event');
  await page.getByRole('button',{name:'查看 1 条新事件',exact:true}).click();
  assert.equal(await page.locator('.log-list').evaluate(element=>element.scrollTop),0);
  await page.evaluate(async () => {
    const state=await window.attendance.getState();
    const summary={id:'session',courseId:'demo',courseName:'示例课程',startedAt:Date.now()-60000,endedAt:Date.now(),plannedEndsAt:Date.now(),reason:'manual',attendance:'confirmed',observedQuestionCount:3,confirmedAnswerCount:1,pendingAttemptCount:1,unconfirmedQuestionCount:2,hadInterruptions:true,questions:[]};
    window.__testState({session:{...state.session,status:'stopped',summary},summaries:[summary]});
  });
  await page.getByRole('button',{name:'我的课程',exact:false}).click();
  await page.getByRole('region',{name:'结束摘要',exact:true}).waitFor();
  assert.ok((await page.getByRole('region',{name:'结束摘要',exact:true}).innerText()).includes('尝试尚未确认'));
  await page.getByRole('button',{name:'本节日志',exact:true}).click();
  assert.equal(await page.getByLabel('课堂',{exact:true}).inputValue(),'session');
  assert.ok(await page.getByLabel('课堂历史',{exact:true}).count());
  await page.getByRole('button',{name:'我的课程',exact:false}).click();
  await page.getByRole('button',{name:'添加课程',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'添加课程');
  await page.getByRole('button',{name:'添加课程',exact:true}).click();
  for(let i=0;i<24;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));}
  await page.getByLabel('课程名称',{exact:true}).fill('新课程');
  await page.getByLabel('iClicker 课程链接',{exact:true}).fill('https://invalid.example/#/course/manual/overview');
  await page.getByRole('button',{name:'保存课程',exact:true}).click();
  await page.getByText('请使用当前 iClicker 的课程链接，或重新导入课程。',{exact:true}).waitFor();
  await page.getByLabel('iClicker 课程链接',{exact:true}).fill('https://student.iclicker.com/#/course/manual/overview');
  await page.getByLabel('粘贴坐标（纬度，经度）',{exact:true}).fill('0, 0');
  await page.getByRole('button',{name:'填入坐标',exact:true}).click();
  assert.equal(await page.getByLabel('纬度 Latitude',{exact:true}).inputValue(),'0');
  await page.getByLabel('教室名称（可选）',{exact:true}).fill('示例教室');
  await page.getByLabel('常用时长',{exact:true}).selectOption('75');
  await page.getByRole('radio',{name:'提醒我手动作答',exact:true}).check();
  await page.getByRole('button',{name:'保存课程',exact:true}).click();
  await page.getByText('课程已保存',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'新课程',exact:true}).waitFor();
  const newId=await page.evaluate(async()=>(await window.attendance.getState()).courses.find(c=>c.name==='新课程').id);
  await page.getByRole('button',{name:'编辑 新课程',exact:true}).click();
  assert.equal(await page.getByLabel('纬度 Latitude',{exact:true}).inputValue(),'0');
  assert.equal(await page.getByLabel('课程时长（分钟）',{exact:true}).inputValue(),'75');
  await page.waitForFunction(()=>!!document.activeElement.closest('[role=dialog]'));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/从 iClicker 导入/}).click();
  await page.getByLabel('选择已加入的课程',{exact:true}).waitFor();
  assert.equal(await page.locator('.course-details').getAttribute('open'),null);
  await page.getByLabel('复用已保存的教室',{exact:true}).selectOption(newId);
  assert.equal(await page.getByLabel('教室名称（可选）',{exact:true}).inputValue(),'示例教室');
  await page.getByRole('radio',{name:'自动选择 A',exact:true}).check();
  await page.getByRole('button',{name:'保存课程',exact:true}).click();
  await page.getByRole('heading',{name:'导入课程',exact:true}).waitFor();
  await mkdir('.test-artifacts/phase1', { recursive:true });
  await page.screenshot({path:'.test-artifacts/phase1/courses.png'});
  assert.deepEqual(errors,[]);
  console.log('Renderer acceptance passed: status, recovery actions, small window controls, full event log, reading position and question receipts, summary navigation and simplified course configuration.');
} finally { await browser?.close(); await server.close(); }
