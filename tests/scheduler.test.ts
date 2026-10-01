import { describe,it,expect,vi } from 'vitest';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/main/store';
import { Scheduler,type SchedulerHooks } from '../src/main/scheduler';
import type { ScheduleConfig } from '../src/shared/schedule';
import type { SessionState } from '../src/shared/types';
const start=Date.parse('2026-10-01T09:00:00Z');
const course={id:'22222222-2222-4222-8222-222222222222',remoteId:'demo',name:'示例定时课程',url:'https://student.iclicker.com/#/course/demo',latitude:0,longitude:0,accuracy:10,durationMinutes:60,mode:'notify' as const};
const task:ScheduleConfig={id:'11111111-1111-4111-8111-111111111111',courseId:course.id,enabled:true,localTime:'09:00',timeZone:'UTC',durationMinutes:60,effectiveFrom:0,recurrence:{kind:'once',date:'2026-10-01'}};
async function fixture(run:(store:Store,hooks:SchedulerHooks,scheduler:Scheduler,directory:string)=>Promise<void>,now=start){
 const directory=mkdtempSync(join(tmpdir(),'attendance-scheduler-'));let scheduler:Scheduler|undefined;
 try{const store=new Store(directory);store.data.courses=[course];store.saveSchedule(task,start-60000);
 const hooks:SchedulerHooks={session:()=>store.data.session,ready:vi.fn(async()=>true),changed:vi.fn(),log:vi.fn(),notify:vi.fn(),start:vi.fn(async(_id,timing)=>{store.setSession({id:timing.sessionId,course,scheduleKey:timing.scheduleKey,startedAt:now,endsAt:timing.endsAt,status:'monitoring',attendance:'unknown',handled:{},detail:'模拟监控'});})};
 scheduler=new Scheduler(store,hooks,()=>now);await run(store,hooks,scheduler,directory);
 }finally{scheduler?.stop();vi.restoreAllMocks();rmSync(directory,{recursive:true,force:true});}
}
describe('durable classroom scheduler',()=>{
 it('persists the claim before starting and serializes repeated checks',()=>fixture(async(store,hooks,scheduler)=>{
  const startHook=hooks.start;hooks.start=vi.fn(async(id,timing)=>{expect(store.data.scheduledRuns[0].status).toBe('claimed');expect(JSON.parse(readFileSync(store.path,'utf8')).scheduledRuns[0].status).toBe('claimed');await startHook(id,timing);});
  await Promise.all([scheduler.tick(),scheduler.tick(),scheduler.tick()]);await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();expect(store.data.scheduledRuns[0]).toMatchObject({status:'started',endsAt:start+3600000,sessionId:store.data.session!.id});
 }));
 it('does not repeat a started or claimed instance after recreating the store and scheduler',()=>fixture(async(store,hooks,scheduler,directory)=>{
  await scheduler.tick();const loaded=new Store(directory);loaded.data.session=null;const restarted=new Scheduler(loaded,{...hooks,session:()=>null},()=>start+1);await restarted.tick();restarted.stop();expect(hooks.start).toHaveBeenCalledOnce();
  loaded.updateScheduledRun(loaded.data.scheduledRuns[0].key,{status:'claimed',detail:'模拟中断',updatedAt:start});const again=new Scheduler(new Store(directory),{...hooks,session:()=>null},()=>start+1);await again.tick();again.stop();expect(hooks.start).toHaveBeenCalledOnce();
 }));
 it('preserves the planned end for a late start',()=>fixture(async(store,hooks,scheduler)=>{await scheduler.tick();expect(hooks.start).toHaveBeenCalledWith(course.id,expect.objectContaining({endsAt:start+3600000,durationMinutes:60}));expect(store.data.scheduledRuns[0].detail).toContain('保留原定结束');},start+480000));
 it('records a conflict and preserves the manual classroom',()=>fixture(async(store,hooks,scheduler)=>{const manual:SessionState={id:'33333333-3333-4333-8333-333333333333',course,startedAt:start-1,endsAt:start+10000,status:'monitoring',attendance:'confirmed',handled:{},detail:'手动课堂'};store.setSession(manual);await scheduler.tick();expect(hooks.start).not.toHaveBeenCalled();expect(hooks.ready).not.toHaveBeenCalled();expect(store.data.session).toEqual(manual);expect(store.data.scheduledRuns[0].status).toBe('skipped');}));
 it('starts at most one of two simultaneous plans in deterministic order',()=>fixture(async(store,hooks,scheduler)=>{store.saveSchedule({...task,id:'44444444-4444-4444-8444-444444444444'},start-1);await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();expect(store.data.scheduledRuns.find(run=>run.scheduleId===task.id)?.status).toBe('started');expect(store.data.scheduledRuns.find(run=>run.scheduleId!==task.id)?.status).toBe('skipped');}));
 it('waits for future or paused plans without probing or starting Chrome',()=>fixture(async(store,hooks,scheduler)=>{store.setScheduleEnabled(task.id,false,start-1);await scheduler.tick();expect(hooks.ready).not.toHaveBeenCalled();expect(store.data.scheduledRuns).toEqual([]);expect(hooks.start).not.toHaveBeenCalled();},start-1));
 it('records environment failure with a repair reminder and never starts the classroom',()=>fixture(async(store,hooks,scheduler)=>{hooks.ready=vi.fn(async()=>false);await scheduler.tick();await scheduler.tick();expect(hooks.start).not.toHaveBeenCalled();expect(hooks.notify).toHaveBeenCalledOnce();expect(store.data.scheduledRuns[0]).toMatchObject({status:'skipped',detail:expect.stringContaining('环境')});}));
 it('keeps failed executions durable and does not retry them',()=>fixture(async(store,hooks,scheduler)=>{hooks.start=vi.fn(async()=>{throw new Error('模拟浏览器失败');});await scheduler.tick();await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();expect(store.data.scheduledRuns[0]).toMatchObject({status:'failed',detail:expect.stringContaining('模拟浏览器失败')});expect(hooks.notify).toHaveBeenCalledOnce();}));
 it('does not start if the execution claim cannot be saved',()=>fixture(async(store,hooks,scheduler)=>{vi.spyOn(store,'save').mockImplementation(()=>{throw new Error('模拟磁盘失败');});await expect(scheduler.tick()).rejects.toThrow('磁盘');expect(hooks.start).not.toHaveBeenCalled();expect(store.data.scheduledRuns).toEqual([]);}));
 it('does not claim or start after quit during preflight',()=>fixture(async(store,hooks,scheduler)=>{let release!:(ready:boolean)=>void;hooks.ready=()=>new Promise(resolve=>{release=resolve;});const work=scheduler.tick();scheduler.stop();release(true);await work;expect(hooks.start).not.toHaveBeenCalled();expect(store.data.scheduledRuns).toEqual([]);}));
});

async function controlled(run:(store:Store,hooks:SchedulerHooks,scheduler:Scheduler,setNow:(value:number)=>void,directory:string)=>Promise<void>,initial=start) {
 return fixture(async(store,hooks,_unused,directory)=>{let clock=initial;const scheduler=new Scheduler(store,hooks,()=>clock);try{await run(store,hooks,scheduler,value=>{clock=value;},directory);}finally{scheduler.stop();}},initial);
}
const manual:SessionState={id:'33333333-3333-4333-8333-333333333333',course,startedAt:start-1,endsAt:start+3600000,status:'monitoring',attendance:'confirmed',handled:{},detail:'手动课堂'};
describe('clock changes, missed instances and cancellation',()=>{
 it('backfills every elapsed weekly instance in bounded batches and persists the scan on restart',()=>controlled(async(store,hooks,scheduler,_set,directory)=>{
  store.saveSchedule({...task,recurrence:{kind:'weekly',weekdays:[4],startDate:'2026-09-10'}},Date.parse('2026-09-10T08:00:00Z'));
  for(let i=0;i<5;i++)await scheduler.tick();
  expect(store.data.scheduledRuns.map(run=>run.localDate).sort()).toEqual(['2026-09-10','2026-09-17','2026-09-24','2026-10-01']);
  expect(hooks.start).toHaveBeenCalledOnce();expect(store.data.scheduledRuns.filter(run=>run.status==='skipped')).toHaveLength(3);expect(store.data.scheduleScans[task.id].through).toBe('2026-09-30');
  const loaded=new Store(directory),restarted=new Scheduler(loaded,{...hooks,session:()=>loaded.data.session},()=>start);await restarted.tick();restarted.stop();expect(loaded.data.scheduledRuns).toHaveLength(4);expect(hooks.start).toHaveBeenCalledOnce();
 }));
 it('consumes a missed task after a forward jump and does not start it when the clock moves back',()=>controlled(async(store,hooks,scheduler,set)=>{set(start+660000);await scheduler.tick();expect(store.data.scheduledRuns[0].detail).toContain('错过');set(start);await scheduler.tick();expect(hooks.start).not.toHaveBeenCalled();expect(hooks.ready).not.toHaveBeenCalled();expect(store.data.scheduledRuns).toHaveLength(1);}));
 it('waits after a backward jump and starts only when the fixed instant is reached',()=>controlled(async(store,hooks,scheduler,set)=>{set(start-300000);await scheduler.tick();expect(store.data.scheduledRuns).toEqual([]);expect(hooks.ready).not.toHaveBeenCalled();set(start);await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();}));
 it('executes the earlier DST fold only once even when both instants are checked',()=>controlled(async(store,hooks,scheduler,set)=>{
  store.saveSchedule({...task,timeZone:'America/Chicago',localTime:'01:30',recurrence:{kind:'weekly',weekdays:[0],startDate:'2026-11-01'}},Date.parse('2026-10-31T00:00:00Z'));
  set(Date.parse('2026-11-01T06:30:00Z'));await scheduler.tick();store.data.session=null;set(Date.parse('2026-11-01T07:30:00Z'));await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();expect(store.data.scheduledRuns).toHaveLength(1);expect(store.data.scheduledRuns[0].scheduledStart).toBe(Date.parse('2026-11-01T06:30:00Z'));
 }));
 it('records a DST gap and still executes the next valid weekly date',()=>controlled(async(store,hooks,scheduler,set)=>{
  store.saveSchedule({...task,timeZone:'America/Chicago',localTime:'02:30',recurrence:{kind:'weekly',weekdays:[0],startDate:'2026-03-08'}},Date.parse('2026-03-07T00:00:00Z'));
  set(Date.parse('2026-03-08T08:30:00Z'));await scheduler.tick();expect(store.data.scheduledRuns[0]).toMatchObject({status:'skipped',scheduledStart:null,detail:expect.stringContaining('不存在')});
  set(Date.parse('2026-03-15T07:30:00Z'));await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();expect(store.data.scheduledRuns).toHaveLength(2);
 }));
 it('keeps the configured city instant when the host time zone changes',()=>controlled(async(store,hooks,scheduler)=>{const previous=process.env.TZ;try{process.env.TZ='Asia/Tokyo';await scheduler.tick();expect(store.data.scheduledRuns[0].scheduledStart).toBe(start);expect(hooks.start).toHaveBeenCalledOnce();}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}}));
 it.each(['cancel','pause','edit','delete course'])('does not start when %s wins during asynchronous preflight',action=>controlled(async(store,hooks,scheduler)=>{
  let release!:(ready:boolean)=>void;hooks.ready=()=>new Promise(resolve=>{release=resolve;});const work=scheduler.tick();
  if(action==='cancel')store.deleteSchedule(task.id);else if(action==='pause')store.setScheduleEnabled(task.id,false,start);else if(action==='edit')store.saveSchedule({...task,localTime:'10:00'},start);else store.deleteCourse(course.id);
  release(true);await work;expect(hooks.start).not.toHaveBeenCalled();expect(store.data.scheduledRuns).toEqual([]);expect(store.data.scheduleScans).toEqual({});
 }));
 it('preserves a manual classroom that begins during preflight',()=>controlled(async(store,hooks,scheduler)=>{let release!:(ready:boolean)=>void;hooks.ready=()=>new Promise(resolve=>{release=resolve;});const work=scheduler.tick();store.setSession(manual);release(true);await work;expect(hooks.start).not.toHaveBeenCalled();expect(store.data.session).toEqual(manual);expect(store.data.scheduledRuns[0].detail).toContain('已有课堂');}));
 it('rechecks the late limit after preflight instead of using a stale start decision',()=>controlled(async(store,hooks,scheduler,set)=>{let release!:(ready:boolean)=>void;hooks.ready=()=>new Promise(resolve=>{release=resolve;});const work=scheduler.tick();set(start+660000);release(true);await work;expect(hooks.start).not.toHaveBeenCalled();expect(store.data.scheduledRuns[0].detail).toContain('错过');}));
 it('does not consume an instance when the clock rewinds during preflight',()=>controlled(async(store,hooks,scheduler,set)=>{let release!:(ready:boolean)=>void;hooks.ready=()=>new Promise(resolve=>{release=resolve;});const work=scheduler.tick();set(start-1);release(true);await work;expect(store.data.scheduledRuns).toEqual([]);hooks.ready=async()=>true;set(start);await scheduler.tick();expect(hooks.start).toHaveBeenCalledOnce();}));
 it('reports a claim interrupted before a classroom record without retrying',()=>controlled(async(store,hooks,scheduler)=>{
  store.claimScheduledRun({key:`${task.id}/2026-10-01`,scheduleId:task.id,courseId:course.id,courseName:course.name,localDate:'2026-10-01',timeZone:'UTC',scheduledStart:start,endsAt:start+3600000,at:start,updatedAt:start,status:'claimed',detail:'正在启动',sessionId:manual.id});
  await scheduler.tick();await scheduler.tick();expect(store.data.scheduledRuns[0]).toMatchObject({status:'failed',detail:expect.stringContaining('无法确认')});expect(hooks.start).not.toHaveBeenCalled();expect(hooks.notify).toHaveBeenCalledOnce();
 }));
 it('links an interrupted claim to its existing classroom for explicit recovery',()=>controlled(async(store,hooks,scheduler)=>{
  const key=`${task.id}/2026-10-01`;store.claimScheduledRun({key,scheduleId:task.id,courseId:course.id,courseName:course.name,localDate:'2026-10-01',timeZone:'UTC',scheduledStart:start,endsAt:start+3600000,at:start,updatedAt:start,status:'claimed',detail:'正在启动',sessionId:manual.id});store.setSession({...manual,scheduleKey:key,status:'interrupted'});
  await scheduler.tick();expect(store.data.scheduledRuns[0]).toMatchObject({status:'started',detail:expect.stringContaining('已有课堂记录')});expect(store.data.session?.status).toBe('interrupted');expect(hooks.start).not.toHaveBeenCalled();
 }));
 it('does not carry an old scan into an edited or re-enabled task',()=>controlled(async(store,hooks,scheduler)=>{
  const weekly={...task,recurrence:{kind:'weekly' as const,weekdays:[0],startDate:'2026-09-28'}};const activation=Date.parse('2026-09-28T08:00:00Z');store.saveSchedule(weekly,activation);await scheduler.tick();expect(store.data.scheduleScans[task.id].through).toBe('2026-09-30');
  store.saveSchedule({...weekly,localTime:'10:00'},activation);expect(store.data.scheduleScans).toEqual({});store.setScheduleEnabled(task.id,false,start);store.setScheduleEnabled(task.id,true,start);await scheduler.tick();expect(store.data.scheduledRuns).toEqual([]);expect(hooks.start).not.toHaveBeenCalled();
 }));
 it('rolls back a scan if saving fails so elapsed dates can be checked again',()=>controlled(async(store,hooks,scheduler)=>{
  store.saveSchedule({...task,recurrence:{kind:'weekly',weekdays:[0],startDate:'2026-09-28'}},Date.parse('2026-09-28T08:00:00Z'));vi.spyOn(store,'save').mockImplementation(()=>{throw new Error('模拟扫描保存失败');});await expect(scheduler.tick()).rejects.toThrow('扫描保存失败');expect(store.data.scheduleScans).toEqual({});expect(hooks.start).not.toHaveBeenCalled();
 }));
});

describe('claimed execution cancellation boundary',()=>{
 it('keeps the current classroom and deadline when cancellation occurs after the durable claim',()=>controlled(async(store,hooks,scheduler)=>{const begin=hooks.start;hooks.start=async(id,timing)=>{expect(store.data.scheduledRuns[0].status).toBe('claimed');await begin(id,timing);store.deleteSchedule(task.id);};await scheduler.tick();expect(store.data.schedules).toEqual([]);expect(store.data.scheduledRuns[0].status).toBe('started');expect(store.data.session?.endsAt).toBe(start+3600000);}));
});
