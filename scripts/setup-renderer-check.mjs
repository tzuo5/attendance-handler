import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const candidates=process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:[process.env.LOCALAPPDATA,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean).map(root=>join(root,'Google/Chrome/Application/chrome.exe'));
let executablePath;
for(const path of candidates){try{await access(path);executablePath=path;break;}catch{}}
assert.ok(executablePath,'Chrome required');
const server=await createServer({logLevel:'error',server:{port:0}});await server.listen();
const browser=await chromium.launch({executablePath,headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:640}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const state=JSON.parse(sessionStorage.getItem('setup-fixture')||'null')||{courses:[],logs:[],summaries:[],session:null,demo:true,browserConnected:false,classroomOrigin:'https://student.iclicker.com',setup:{step:'environment',completedSteps:[],dismissed:false}};
  let listener;const emit=()=>{sessionStorage.setItem('setup-fixture',JSON.stringify(state));listener?.(structuredClone(state));};
  window.__setupState=patch=>{Object.assign(state,patch);emit();};
  window.attendance={
   getState:async()=>structuredClone(state),onState:cb=>{listener=cb;return()=>{};},
   checkEnvironment:async()=>{state.environment={checkedAt:Date.now(),items:['platform','chrome','storage','encryption','browser'].map(id=>({id,label:id,status:'passed',detail:'模拟检查通过'}))};emit();return state.environment;},
   setupAction:async action=>{const steps=['environment','login','course','notification','complete'];if(action==='reopen'){state.setup.dismissed=false;if(state.setup.completedAt)state.setup.step='environment';}else if(action==='dismiss')state.setup.dismissed=true;else if(action==='finish'){state.setup.completedAt=Date.now();state.setup.dismissed=true;}else if(action==='back')state.setup.step=steps[Math.max(0,steps.indexOf(state.setup.step)-1)];else {if(state.setup.step==='login'&&state.loginReport?.status!=='verified')throw new Error('登录尚未确认');state.setup.completedSteps.push(state.setup.step);state.setup.step=steps[steps.indexOf(state.setup.step)+1];}emit();return structuredClone(state);},
   login:async()=>{},checkLogin:async()=>{state.loginReport=state.loginReport?.status==='verified'?state.loginReport:{status:'waiting',detail:'等待学校验证',checkedAt:Date.now()};emit();return state.loginReport;},
   checkCourseImport:async()=>{state.courseImport={status:'courses',courses:[{remoteId:'demo',name:'向导示例课程',url:'https://student.iclicker.com/#/course/demo/overview'}],checkedAt:Date.now(),detail:'已读取 1 门课程'};emit();return state.courseImport;},
   importCourses:async()=>[{remoteId:'demo',name:'向导示例课程',url:'https://student.iclicker.com/#/course/demo/overview'}],saveCourse:async c=>{state.courses.push(c);emit();return structuredClone(state);},
   openHelp:async()=>{},testNotification:async()=>{state.setup.notification={status:'requested',attemptId:'fixture-test',requestedAt:Date.now(),detail:'系统已接受测试提醒，仍需要你确认是否收到。'};state.notificationCanConfirm=true;emit();},notificationChoice:async choice=>{state.setup.notification={...state.setup.notification,status:choice==='received'?'confirmed':'pending',confirmedAt:choice==='received'?Date.now():undefined,deferred:choice==='later',detail:choice==='received'?'你已确认收到测试提醒。':'提醒尚未确认，已选择稍后处理。'};state.notificationCanConfirm=choice==='not-received';emit();return structuredClone(state);},start:async id=>{window.__startedId=id;},openHelp:async target=>{window.__lastHelp=target;},showClassroom:async()=>{},
  };
 });
 await page.goto(server.resolvedUrls.local[0]);
 await mkdir('.test-artifacts/phase2',{recursive:true});
 const wizard=page.getByRole('region',{name:'首次配置向导',exact:true});await wizard.waitFor();
 assert.equal(await wizard.getByRole('button',{name:'下一步',exact:true}).isDisabled(),true);
 await wizard.getByRole('button',{name:'开始检查',exact:true}).click();
 await wizard.getByRole('button',{name:'下一步',exact:true}).click();
 await page.reload();await wizard.getByRole('heading',{name:'登录你的 iClicker 账号',exact:true}).waitFor();
 await wizard.getByRole('button',{name:'打开登录窗口',exact:true}).click();await wizard.getByRole('button',{name:'下一步',exact:true}).click();
 await page.getByRole('alert').getByText('登录尚未确认',{exact:true}).waitFor();
 await page.evaluate(()=>window.__setupState({loginReport:{status:'verified',detail:'登录已确认',checkedAt:Date.now()}}));
 await wizard.getByRole('heading',{name:'添加第一门课',exact:true}).waitFor();
 await page.reload();await wizard.getByRole('heading',{name:'添加第一门课',exact:true}).waitFor();
 await wizard.getByRole('button',{name:'配置导入课程',exact:true}).click();
 await page.getByLabel('粘贴坐标（纬度，经度）',{exact:true}).fill('0, 0');await page.getByRole('button',{name:'填入坐标',exact:true}).click();
 await page.getByRole('radio',{name:'提醒我手动作答',exact:true}).check();await page.getByRole('button',{name:'保存课程',exact:true}).click();
 await wizard.getByText('向导示例课程 · 已保存 · 50 分钟',{exact:true}).waitFor();
 await page.evaluate(()=>window.__setupState({courseImport:{status:'empty',courses:[],checkedAt:Date.now(),detail:'账号目前没有课程'}}));
 await wizard.getByText('账号目前没有课程',{exact:true}).waitFor();assert.equal(await wizard.getByRole('button',{name:'配置导入课程',exact:true}).count(),0);
 await page.evaluate(()=>window.__setupState({courseImport:{status:'error',courses:[],checkedAt:Date.now(),detail:'课程列表读取失败，请重试'}}));
 await wizard.getByText('课程列表读取失败，请重试',{exact:true}).waitFor();await wizard.getByRole('button',{name:'重新读取课程',exact:true}).click();await wizard.getByRole('button',{name:'配置导入课程',exact:true}).waitFor();
 await wizard.getByRole('button',{name:'下一步',exact:true}).click();await page.reload();await wizard.getByRole('heading',{name:'试一下题目提醒',exact:true}).waitFor();
 assert.equal(await wizard.getByRole('button',{name:'下一步',exact:true}).isDisabled(),true);
 await wizard.getByRole('button',{name:'发送测试通知',exact:true}).click();
 await wizard.getByText('系统已接受测试提醒，仍需要你确认是否收到。',{exact:true}).waitFor();
 assert.equal(await wizard.getByRole('button',{name:'下一步',exact:true}).isDisabled(),true);
 await wizard.getByRole('button',{name:'没收到',exact:true}).click();
 await wizard.getByRole('button',{name:'打开系统通知设置',exact:true}).click();assert.equal(await page.evaluate(()=>window.__lastHelp),'notifications');
 await wizard.getByRole('button',{name:'稍后处理提醒',exact:true}).click();await wizard.getByRole('button',{name:'下一步',exact:true}).click();await page.reload();await wizard.getByRole('heading',{name:'课程配置已保存',exact:true}).waitFor();
 await wizard.getByText('提醒尚未确认，已选择稍后处理。',{exact:true}).waitFor();
 await wizard.getByRole('button',{name:'上一步',exact:true}).click();
 await wizard.getByRole('button',{name:'重新发送测试通知',exact:true}).click();await wizard.getByRole('button',{name:'我收到了',exact:true}).click();
 await wizard.getByRole('button',{name:'下一步',exact:true}).click();await wizard.getByText('你已确认收到测试提醒。',{exact:true}).waitFor();
 await page.screenshot({path:'.test-artifacts/phase2/completion.png'});
 await wizard.getByRole('button',{name:'完成配置并开始上课',exact:true}).click();await page.waitForFunction(()=>!!window.__startedId);
 assert.equal(await page.evaluate(()=>window.__startedId),(await page.evaluate(()=>window.attendance.getState())).courses[0].id);await page.reload();await page.getByRole('heading',{name:'我的课程',exact:true}).waitFor();
 assert.equal(await wizard.count(),0);await page.getByRole('button',{name:'连接与提醒',exact:true}).click();await page.getByRole('button',{name:'重新打开配置向导',exact:true}).click();await wizard.waitFor();
 await wizard.getByRole('button',{name:'稍后继续',exact:true}).click();await page.reload();await page.getByRole('heading',{name:'我的课程',exact:true}).waitFor();
 await mkdir('.test-artifacts/phase2',{recursive:true});await page.screenshot({path:'.test-artifacts/phase2/setup.png'});assert.deepEqual(errors,[]);
 console.log('Setup renderer passed: first run, prerequisite guard, course form reuse, interrupted step reloads, completion and reopening.');
}finally{await browser.close();await server.close();}
