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
