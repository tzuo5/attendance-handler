import assert from 'node:assert/strict';
import { _electron as electron, chromium } from 'playwright-core';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createMockClassroom } from './mock-classroom.mjs';
const mock=await createMockClassroom();
const data=await mkdtemp(join(tmpdir(),'attendance-first-run-'));
const defaultApp=process.platform==='win32'?'release-public/win-unpacked/Attendance Handler.exe':'release/mac-arm64/Attendance Handler.app/Contents/MacOS/Attendance Handler';
const executablePath=resolve(process.env.ATTENDANCE_TEST_APP||defaultApp);
const synthetic=process.env.ATTENDANCE_UI_CIPHER==='synthetic';
const key=randomBytes(32).toString('hex');const errors=[];let application,window,classroom,pid,launcher;
const alive=()=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function start(){
 application=await electron.launch({executablePath,env:{...process.env,ATTENDANCE_DEMO:'1',ATTENDANCE_DEMO_EMPTY:'1',ATTENDANCE_ORIGIN:mock.origin,ATTENDANCE_DATA_DIR:data}});
 pid=await application.evaluate(()=>process.pid);launcher=application.process();window=await application.firstWindow();window.on('pageerror',e=>errors.push(e.message));
 if(synthetic)await application.evaluate(({safeStorage},hex)=>{
  // Isolated synthetic demo only. A shared test key permits restart verification;
  // the default Windows path exercises operating-system storage instead.
  const {randomBytes,createCipheriv,createDecipheriv}=process.getBuiltinModule('node:crypto');const key=Buffer.from(hex,'hex');safeStorage.isEncryptionAvailable=()=>true;
  safeStorage.encryptString=text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(text,'utf8'),c.final(),c.getAuthTag()]);};
  safeStorage.decryptString=bytes=>{const c=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));c.setAuthTag(bytes.subarray(-16));return Buffer.concat([c.update(bytes.subarray(12,-16)),c.final()]).toString();};
 },key);
}
async function stop(){
 if(!application)return;
 try{
  await application.evaluate(({app})=>setTimeout(()=>app.quit(),0));const deadline=Date.now()+20000;while(alive()&&Date.now()<deadline)await delay(100);
  assert.ok(!alive(),'app exits gracefully');
 }finally{
  if(alive())process.kill(pid,'SIGKILL');
  if(process.platform==='win32'&&launcher.exitCode===null&&launcher.pid)await promisify(execFile)('taskkill',['/pid',String(launcher.pid),'/T','/F'],{windowsHide:true,timeout:5000}).catch(()=>{});
  if(classroom?.isConnected()){const cdp=await classroom.newBrowserCDPSession();await cdp.send('Browser.close').catch(()=>{});await classroom.close();}
  application=undefined;classroom=undefined;
 }
}
const state=()=>window.evaluate(()=>window.attendance.getState());
const wizard=()=>window.getByRole('region',{name:'首次配置向导',exact:true});
async function restart(step){await window.waitForFunction(async expected=>(await window.attendance.getState()).setup.step===expected,step);await stop();await start();await wizard().waitFor();assert.equal((await state()).setup.step,step);}
try{
 await start();await wizard().waitFor();assert.equal((await state()).courses.length,0);
 await restart('environment');
 await wizard().getByRole('button',{name:'开始检查',exact:true}).click();await wizard().getByRole('button',{name:'重新检查',exact:true}).waitFor();
 assert.equal((await state()).environment.items.filter(item=>item.status==='passed').length,5);
 await wizard().getByRole('button',{name:'下一步',exact:true}).click();await restart('login');
 await wizard().getByRole('button',{name:'打开登录窗口',exact:true}).click();
 await window.waitForFunction(async()=>(await window.attendance.getState()).browserConnected);
 await window.waitForFunction(()=>!document.querySelector('.setup-card .primary')?.disabled);
 const [port,path]=(await readFile(join(data,'chrome-profile/DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);
 classroom=await chromium.connectOverCDP(`ws://127.0.0.1:${port}${path}`);const page=classroom.contexts()[0].pages().find(page=>page.url().startsWith(mock.origin));assert.ok(page);
 assert.equal((await window.evaluate(()=>window.attendance.checkLogin())).status,'waiting');
 await page.locator('#sign-in-button').click();await page.locator('.course-title').waitFor();
 await wizard().getByRole('heading',{name:'添加第一门课',exact:true}).waitFor();await restart('course');
 // Login restoration is driven by encrypted session data, not saved setup progress.
 await wizard().getByRole('button',{name:'配置导入课程',exact:true}).click();
 await window.getByLabel('选择已加入的课程',{exact:true}).waitFor();
 await window.getByLabel('粘贴坐标（纬度，经度）',{exact:true}).fill('0, 0');await window.getByRole('button',{name:'填入坐标',exact:true}).click();
 await window.getByRole('radio',{name:'提醒我手动作答',exact:true}).check();await window.getByRole('button',{name:'保存课程',exact:true}).click();
 await wizard().getByText('模拟课堂 · 已保存 · 50 分钟',{exact:true}).waitFor();
 await wizard().getByRole('button',{name:'下一步',exact:true}).click();await restart('notification');
 assert.equal(await wizard().getByRole('button',{name:'下一步',exact:true}).isDisabled(),true);
 // Fault injection tests the application's result model; human receipt is not
 // established by this automated click or a simulated operating-system event.
 await application.evaluate(({Notification})=>{Notification.prototype.show=function(){this.emit('failed',{},'模拟发送失败');};});
 await wizard().getByRole('button',{name:'发送测试通知',exact:true}).click();
 await window.waitForFunction(async()=>(await window.attendance.getState()).setup.notification?.status==='failed');
 assert.equal(await window.evaluate(async()=>{try{await window.attendance.notificationChoice('received');return false;}catch{return true;}}),true);
 await wizard().getByRole('button',{name:'稍后处理提醒',exact:true}).click();
 await wizard().getByRole('button',{name:'下一步',exact:true}).click();await restart('complete');
 assert.equal((await state()).setup.notification.status,'failed');assert.equal((await state()).setup.notification.deferred,true);
 await wizard().getByRole('button',{name:'上一步',exact:true}).click();
 await application.evaluate(({Notification})=>{Notification.prototype.show=function(){this.emit('show');};});
 await wizard().getByRole('button',{name:'重新发送测试通知',exact:true}).click();
 await window.waitForFunction(async()=>(await window.attendance.getState()).setup.notification?.status==='requested');
 assert.equal((await state()).setup.notification.confirmedAt,undefined);
 assert.equal(await wizard().getByRole('button',{name:'下一步',exact:true}).isDisabled(),true);
 await wizard().getByRole('button',{name:'没收到',exact:true}).click();
 await window.waitForFunction(async()=>(await window.attendance.getState()).setup.notification?.status==='pending');
 await wizard().getByRole('button',{name:'重新发送测试通知',exact:true}).click();
 await wizard().getByRole('button',{name:'我收到了',exact:true}).click();
 await wizard().getByRole('button',{name:'下一步',exact:true}).click();await restart('complete');
 assert.equal((await state()).setup.notification.status,'confirmed');

 await window.evaluate(()=>window.attendance.checkEnvironment());await window.evaluate(()=>window.attendance.login());
 await window.waitForFunction(async()=>(await window.attendance.checkLogin()).status==='verified');
 await mkdir('.test-artifacts/phase2',{recursive:true});await window.screenshot({path:'.test-artifacts/phase2/packaged-completion.png'});
 mock.control({open:true});
 await wizard().getByRole('button',{name:'完成配置并开始上课',exact:true}).click();await window.getByRole('heading',{name:'我的课程',exact:true}).waitFor();
 await window.waitForFunction(async()=>(await window.attendance.getState()).session?.status==='monitoring');
 await stop();await start();await window.getByRole('heading',{name:'我的课程',exact:true}).waitFor();assert.equal(await wizard().count(),0);
 await window.getByRole('button',{name:'连接与提醒',exact:true}).click();await window.getByRole('button',{name:'重新打开配置向导',exact:true}).click();await wizard().waitFor();
 assert.equal((await state()).courses.length,1);assert.deepEqual(errors,[]);
 await mkdir('.test-artifacts/phase2',{recursive:true});await window.screenshot({path:'.test-artifacts/phase2/first-run.png'});
 console.log(`Packaged first-run passed: five interrupted steps, verified page login, imported course, saved configuration, notification failure and unconfirmed/confirmed choices, completion starts first class, completed restart and reopening (${synthetic?'synthetic encrypted storage; OS storage unverified':'OS-encrypted storage'}).`);
}finally{await stop();await mock.close();}
