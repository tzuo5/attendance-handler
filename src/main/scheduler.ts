import { Store } from './store';
import { addLocalDays, compareOccurrences, dateInTimeZone, decideSchedule, occurrenceOnDate, type ScheduleConfig, type ScheduleOccurrence, type ScheduledRun } from '../shared/schedule';
import type { LogDetails, LogEntry, SessionState } from '../shared/types';
export interface ScheduledStart { endsAt:number; scheduleKey:string; sessionId:string; durationMinutes:number; }
export interface SchedulerHooks {
  session():SessionState|null; ready():Promise<boolean>; start(courseId:string, timing:ScheduledStart):Promise<void>;
  changed():void; log(level:LogEntry['level'],message:string,details:LogDetails):void;
  notify?(title:string,body:string):void;
}
export class Scheduler {
  private timer?:ReturnType<typeof setTimeout>;
  private work?:Promise<void>;
  private running=false;
  private stopped=false;
  constructor(private store:Store,private hooks:SchedulerHooks,private now=()=>Date.now()){}
  start(){if(this.running)return;this.stopped=false;this.running=true;this.schedule(0);}
  stop(){this.stopped=true;this.running=false;clearTimeout(this.timer);}
  private schedule(delay:number){clearTimeout(this.timer);if(!this.running)return;this.timer=setTimeout(()=>{void this.tick().catch(error=>{try{this.hooks.log('error',`定时检查失败：${error instanceof Error?error.message:'请检查本机保存权限'}`,{event:'scheduled-failed'});}catch{}}).finally(()=>this.schedule(5000));},delay);}
  tick(){if(this.stopped)return Promise.resolve();if(this.work)return this.work;this.work=this.check().finally(()=>{this.work=undefined;});return this.work;}
  private current(schedule:ScheduleConfig){return !this.stopped&&this.store.data.schedules.some(item=>item.id===schedule.id&&JSON.stringify(item)===JSON.stringify(schedule));}
  private async check(){
    const candidates:Array<{schedule:ScheduleConfig;occurrence:ScheduleOccurrence}>=[];
    for(const saved of this.store.data.schedules){
      if(!saved.enabled)continue;
      const schedule=structuredClone(saved),today=dateInTimeZone(this.now(),schedule.timeZone);
      const dates=schedule.recurrence.kind==='once'?[schedule.recurrence.date]:[addLocalDays(today,-1),today];
      for(const date of dates){const occurrence=occurrenceOnDate(schedule,date);if(occurrence && (occurrence.scheduledStart === null ? date >= dateInTimeZone(schedule.effectiveFrom,schedule.timeZone) : occurrence.scheduledStart >= schedule.effectiveFrom))candidates.push({schedule,occurrence});}
    }
    candidates.sort((a,b)=>compareOccurrences(a.occurrence,b.occurrence));
    for(const {schedule,occurrence} of candidates){
      if(!this.current(schedule)||this.store.data.scheduledRuns.some(run=>run.key===occurrence.key))continue;
      const course=this.store.data.courses.find(course=>course.id===schedule.courseId);
      const context=()=>({now:this.now(),courseExists:!!this.store.data.courses.find(item=>item.id===schedule.courseId),environmentReady:true,session:this.hooks.session()});
      let decision=decideSchedule(schedule,occurrence,context());
      if(decision.kind==='pending')continue;
      if(decision.kind==='start'){
        let ready=false;try{ready=await this.hooks.ready();}catch{}
        if(!this.current(schedule))continue;
        decision=decideSchedule(schedule,occurrence,{...context(),environmentReady:ready});
        if(decision.kind==='pending')continue;
      }
      const at=this.now(),sessionId=decision.kind==='start'?crypto.randomUUID():undefined;
      const run:ScheduledRun={key:occurrence.key,scheduleId:schedule.id,courseId:schedule.courseId,courseName:course?.name||'课程已不存在',localDate:occurrence.localDate,timeZone:occurrence.timeZone,scheduledStart:occurrence.scheduledStart,endsAt:occurrence.endsAt,at,updatedAt:at,status:decision.kind==='start'?'claimed':'skipped',detail:decision.kind==='start'?'正在启动监控，尚未确认课堂连接。':decision.detail,sessionId};
      if(!this.store.claimScheduledRun(run))continue; // Durable claim before any classroom effect.
      this.hooks.changed();
      if(decision.kind==='skip'){this.log(run,'warning','scheduled-skipped');if(['environment','course'].includes(decision.reason))this.hooks.notify?.('定时课堂需要处理',run.detail);continue;}
      try{
        await this.hooks.start(schedule.courseId,{endsAt:decision.endsAt,scheduleKey:run.key,sessionId:sessionId!,durationMinutes:schedule.durationMinutes});
        this.store.updateScheduledRun(run.key,{status:'started',detail:decision.late?'已补开监控，保留原定结束时间；签到和作答以课堂回执为准。':'已启动本次监控；连接、签到和作答以课堂状态及回执为准。',updatedAt:this.now()});
        this.log(this.store.data.scheduledRuns.find(item=>item.key===run.key)!,'info','scheduled-started');
      }catch(error){
        this.store.updateScheduledRun(run.key,{status:'failed',detail:`定时启动失败：${error instanceof Error?error.message:'请打开 App 检查'}；本次不会重复启动，请手动处理。`.slice(0,1000),updatedAt:this.now()});
        this.log(this.store.data.scheduledRuns.find(item=>item.key===run.key)!,'error','scheduled-failed');
        this.hooks.notify?.('定时启动需要处理','请打开 App 查看失败原因，本次不会重复自动开始。');
      }
      this.hooks.changed();
    }
  }
  private log(run:ScheduledRun,level:LogEntry['level'],event:LogDetails['event']){this.hooks.log(level,`${run.courseName} · ${run.detail}`,{event,scheduleKey:run.key,sessionId:run.sessionId,courseId:run.courseId,courseName:run.courseName,scheduledStart:run.scheduledStart??undefined,endsAt:run.endsAt??undefined});}
}
