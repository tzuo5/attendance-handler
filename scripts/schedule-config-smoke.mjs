import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import { mkdir,mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createMockClassroom } from './mock-classroom.mjs';
const mock=await createMockClassroom(),data=await mkdtemp(join(tmpdir(),'attendance-schedule-config-'));
const defaultApp=process.platform==='win32'?'release-public/win-unpacked/Attendance Handler.exe':'release/mac-arm64/Attendance Handler.app/Contents/MacOS/Attendance Handler';
const executablePath=resolve(process.env.ATTENDANCE_TEST_APP||defaultApp);
const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const passed=[],errors=[];
let application,window,pid,launcher;
const alive=()=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function start(){application=await electron.launch({executablePath,env:{...process.env,ATTENDANCE_DEMO:'1',ATTENDANCE_ORIGIN:mock.origin,ATTENDANCE_DATA_DIR:data}});pid=await application.evaluate(()=>process.pid);launcher=application.process();window=await application.firstWindow();window.on('pageerror',error=>errors.push(error.message));await window.getByRole('heading',{name:'我的课程',exact:true}).waitFor();}
async function stop(){if(!application)return;try{await application.evaluate(({app})=>setTimeout(()=>app.quit(),0));const until=Date.now()+15000;while(alive()&&Date.now()<until)await delay(100);assert.ok(!alive(),'the App exits without browser activity');}finally{if(alive())process.kill(pid,'SIGKILL');if(process.platform==='win32'&&launcher.exitCode===null&&launcher.pid)await promisify(execFile)('taskkill',['/pid',String(launcher.pid),'/T','/F'],{windowsHide:true,timeout:5000}).catch(()=>{});application=undefined;}}
const state=()=>window.evaluate(()=>window.attendance.getState());
async function openTasks(){await window.getByRole('button',{name:'定时任务',exact:true}).click();await window.getByRole('heading',{name:'定时任务',exact:true}).waitFor();}
try{
 await mkdir('.test-artifacts/phase4',{recursive:true});await start();await window.setViewportSize({width:900,height:640});await openTasks();
 await window.getByRole('button',{name:'添加定时任务',exact:true}).click();
 const modal=()=>window.getByRole('dialog');await modal().getByLabel('城市时区',{exact:true}).fill('CST');await modal().getByRole('alert').getByText(/城市时区/).waitFor();assert.equal(await modal().getByRole('button',{name:'保存定时任务',exact:true}).isDisabled(),true);
 await modal().getByLabel('城市时区',{exact:true}).fill('America/Chicago');await modal().getByLabel('开始日期',{exact:true}).fill('2028-03-12');await modal().getByLabel('当地开始时刻',{exact:true}).fill('02:30');await modal().getByRole('alert').getByText(/不存在/).waitFor();
 await modal().getByLabel('开始日期',{exact:true}).fill(tomorrow);await modal().getByLabel('当地开始时刻',{exact:true}).fill('09:00');await modal().getByLabel('监控时长（分钟）',{exact:true}).fill('65');
 const courseId=await modal().getByLabel('定时课程',{exact:true}).inputValue();
 assert.match(await modal().locator('.schedule-preview').innerText(),/09:00/);assert.match(await modal().locator('.schedule-preview').innerText(),/10:05/);
 await modal().getByRole('button',{name:'保存定时任务',exact:true}).scrollIntoViewIfNeeded();const saveBounds=await modal().getByRole('button',{name:'保存定时任务',exact:true}).boundingBox();assert.ok(saveBounds.y>=0&&saveBounds.y+saveBounds.height<=640,'save control is fully visible at 900x640');
 await modal().getByRole('button',{name:'保存定时任务',exact:true}).click();await modal().waitFor({state:'hidden'});
 let saved=await state();assert.equal(saved.schedules.length,1);assert.equal(saved.schedules[0].courseId,courseId);assert.equal(saved.schedules[0].timeZone,'America/Chicago');assert.equal(saved.browserConnected,false);const id=saved.schedules[0].id;
 passed.push('single plan preview, invalid city/DST guard and complete save control at 900x640; no classroom opened');
 await window.getByRole('button',{name:'添加定时任务',exact:true}).click();await modal().getByLabel('重复方式',{exact:true}).selectOption('weekly');await modal().getByLabel('重复开始日期',{exact:true}).fill(tomorrow);await modal().getByLabel('城市时区',{exact:true}).fill('America/Chicago');await modal().getByLabel('当地开始时刻',{exact:true}).fill('11:00');
 for(const day of ['周日','周一','周二','周三','周四','周五','周六'])await modal().getByRole('checkbox',{name:day,exact:true}).check();assert.equal(await modal().locator('.schedule-preview li').count(),3);await modal().getByRole('button',{name:'保存定时任务',exact:true}).click();await modal().waitFor({state:'hidden'});
 await stop();await start();assert.equal((await state()).schedules.length,2);await openTasks();
 const card=()=>window.getByRole('article',{name:`任务 ${id}`,exact:true});await card().getByRole('button',{name:'编辑任务',exact:true}).click();assert.equal(await modal().getByLabel('城市时区',{exact:true}).inputValue(),'America/Chicago');await modal().getByLabel('当地开始时刻',{exact:true}).fill('12:00');await modal().getByLabel('监控时长（分钟）',{exact:true}).fill('75');await modal().getByRole('button',{name:'保存定时任务',exact:true}).click();await modal().waitFor({state:'hidden'});await card().getByRole('button',{name:'暂停任务',exact:true}).click();await card().getByText('已暂停',{exact:true}).waitFor();
 await stop();await start();saved=await state();assert.equal(saved.schedules.find(item=>item.id===id).enabled,false);assert.equal(saved.schedules.find(item=>item.id===id).localTime,'12:00');assert.equal(saved.schedules.find(item=>item.id===id).durationMinutes,75);await openTasks();await card().getByRole('button',{name:'启用任务',exact:true}).click();await card().getByText('已启用',{exact:true}).waitFor();
 passed.push('single/weekly plans survive real App restarts; edited time/duration, pause and re-enable persist');
 const otherId=(await state()).schedules.find(item=>item.id!==id).id;const other=window.getByRole('article',{name:`任务 ${otherId}`,exact:true});await other.getByRole('button',{name:'取消任务',exact:true}).click();await other.getByRole('button',{name:'保留任务',exact:true}).click();assert.equal((await state()).schedules.length,2);await other.getByRole('button',{name:'取消任务',exact:true}).click();await other.getByRole('button',{name:'确认取消任务',exact:true}).click();await other.waitFor({state:'hidden'});
 await window.screenshot({path:'.test-artifacts/phase4/schedule-config.png'});
 await window.getByRole('button',{name:'我的课程',exact:false}).click();const courseCard=window.locator('.course-card').filter({has:window.getByRole('heading',{name:'模拟课堂 · 自动 A',exact:true})});await courseCard.getByRole('button',{name:'删除 模拟课堂 · 自动 A',exact:true}).click();await courseCard.getByText(/也会取消 1 个关联定时任务/).waitFor();await courseCard.getByRole('button',{name:'确认删除',exact:true}).click();await courseCard.waitFor({state:'hidden'});await stop();await start();assert.equal((await state()).schedules.length,0);assert.equal((await state()).courses.length,1);await openTasks();
 passed.push('cancel confirmation keeps or removes only the intended plan; deleting a course explains and persistently cancels linked plans');
 const remaining=(await state()).courses[0].id;await window.evaluate(id=>window.attendance.deleteCourse(id),remaining);assert.equal(await window.getByRole('button',{name:'添加定时任务',exact:true}).isDisabled(),true);await window.getByText('先在“我的课程”添加课程，再设置开始时间。',{exact:true}).waitFor();
 assert.equal((await state()).browserConnected,false);assert.deepEqual(errors,[]);passed.push('no-course creation disabled, no renderer errors, and configuration never starts a classroom');
 await stop();const disk=JSON.parse(await readFile(join(data,'state.json'),'utf8'));assert.deepEqual(disk.schedules,[]);console.log(JSON.stringify({passed},null,2));
}finally{await stop();await mock.close();}
