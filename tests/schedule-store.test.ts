import { describe,it,expect,vi } from 'vitest';
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/main/store';
import { nextOccurrences,type ScheduleConfig } from '../src/shared/schedule';
const course={id:'22222222-2222-4222-8222-222222222222',remoteId:'demo',name:'示例课程',url:'https://student.iclicker.com/#/course/demo',latitude:0,longitude:0,accuracy:10,durationMinutes:50,mode:'notify' as const};
const task:ScheduleConfig={id:'11111111-1111-4111-8111-111111111111',courseId:course.id,enabled:true,localTime:'09:00',timeZone:'America/Chicago',durationMinutes:60,effectiveFrom:0,recurrence:{kind:'once',date:'2026-10-02'}};
function fixture(run:(store:Store,directory:string)=>void){const directory=mkdtempSync(join(tmpdir(),'attendance-schedules-'));try{const store=new Store(directory);store.data.courses=[course];store.save();run(store,directory);}finally{rmSync(directory,{recursive:true,force:true});}}
describe('saved schedules',()=>{
 it('migrates legacy records to an empty schedule list',()=>fixture((store,directory)=>{const {schedules,...legacy}=store.data;writeFileSync(store.path,JSON.stringify(legacy));expect(new Store(directory).data.schedules).toEqual([]);}));
 it('persists create, edit, pause, re-enable and cancel with server activation times',()=>fixture((store,directory)=>{
  store.saveSchedule(task,100);expect(new Store(directory).data.schedules[0].effectiveFrom).toBe(100);
  store.saveSchedule({...task,localTime:'10:00',durationMinutes:75},200);expect(new Store(directory).data.schedules).toMatchObject([{localTime:'10:00',durationMinutes:75,effectiveFrom:200}]);
  store.setScheduleEnabled(task.id,false,300);expect(new Store(directory).data.schedules[0]).toMatchObject({enabled:false,effectiveFrom:200});
  store.setScheduleEnabled(task.id,true,400);expect(new Store(directory).data.schedules[0]).toMatchObject({enabled:true,effectiveFrom:400});
  store.setScheduleEnabled(task.id,true,500);expect(store.data.schedules[0].effectiveFrom).toBe(400);
  store.deleteSchedule(task.id);expect(new Store(directory).data.schedules).toEqual([]);
 }));
 it('cancels only the deleted course tasks in the same saved state',()=>fixture((store,directory)=>{
  const other={...course,id:'33333333-3333-4333-8333-333333333333'};store.data.courses.push(other);
  store.saveSchedule(task,100);store.saveSchedule({...task,id:'44444444-4444-4444-8444-444444444444',courseId:other.id},100);
  store.deleteCourse(course.id);const loaded=new Store(directory);expect(loaded.data.courses).toEqual([other]);expect(loaded.data.schedules.map(item=>item.courseId)).toEqual([other.id]);
 }));
 it('rejects incomplete and missing-course configurations without mutating saved tasks',()=>fixture((store,directory)=>{
  store.saveSchedule(task,100);const before=readFileSync(store.path,'utf8');
  for(const patch of [{localTime:''},{courseId:'33333333-3333-4333-8333-333333333333'},{durationMinutes:1.5}])expect(()=>store.saveSchedule({...task,...patch},200)).toThrow();
  expect(readFileSync(store.path,'utf8')).toBe(before);expect(new Store(directory).data.schedules).toHaveLength(1);
 }));
 it('preserves the original file and fails closed on invalid or duplicate saved tasks',()=>fixture((store,directory)=>{
  for(const schedules of [[{...task,timeZone:'Invalid/City'}],[task,task]]){const text=JSON.stringify({...store.data,schedules});writeFileSync(store.path,text);expect(()=>new Store(directory)).toThrow('原文件已保留');expect(readFileSync(store.path,'utf8')).toBe(text);}
 }));
 it('rolls back in-memory tasks and courses if saving fails',()=>fixture((store,directory)=>{
  store.saveSchedule(task,100);const before=readFileSync(store.path,'utf8');const spy=vi.spyOn(store,'save').mockImplementation(()=>{throw new Error('模拟磁盘失败');});
  expect(()=>store.saveSchedule({...task,localTime:'10:00'},200)).toThrow('磁盘');expect(store.data.schedules[0].localTime).toBe('09:00');
  expect(()=>store.deleteCourse(course.id)).toThrow('磁盘');expect(store.data.courses).toEqual([course]);expect(store.data.schedules).toHaveLength(1);expect(readFileSync(store.path,'utf8')).toBe(before);spy.mockRestore();
 }));
 it('previews a distant single and weekly plan, includes DST warnings and excludes past instances',()=>{
  expect(nextOccurrences(task,Date.parse('2026-10-01T00:00:00Z'))[0].scheduledStart).toBe(Date.parse('2026-10-02T14:00:00Z'));
  expect(nextOccurrences(task,Date.parse('2026-10-03T00:00:00Z'))).toEqual([]);
  const weekly:ScheduleConfig={...task,localTime:'02:30',recurrence:{kind:'weekly',startDate:'2028-03-12',weekdays:[0]}};
  expect(nextOccurrences(weekly,Date.parse('2026-10-01T00:00:00Z'))).toHaveLength(3);
  expect(nextOccurrences(weekly,Date.parse('2026-10-01T00:00:00Z'))[0].resolution).toBe('nonexistent');
 });
});

describe('schedule scan persistence',()=>{
 it('migrates legacy scans and preserves files with invalid scan metadata',()=>fixture((store,directory)=>{
  store.saveSchedule(task,100);const {scheduleScans,...legacy}=store.data;writeFileSync(store.path,JSON.stringify(legacy));expect(new Store(directory).data.scheduleScans).toEqual({});
  for(const scan of [{effectiveFrom:100,through:'2026-02-30'},{effectiveFrom:-1,through:'2026-10-01'}]){const text=JSON.stringify({...store.data,scheduleScans:{[task.id]:scan}});writeFileSync(store.path,text);expect(()=>new Store(directory)).toThrow('原文件已保留');expect(readFileSync(store.path,'utf8')).toBe(text);}
 }));
 it('rejects invalid execution time zones before the history page can render them',()=>fixture((store,directory)=>{
  const run={key:`${task.id}/2026-10-02`,scheduleId:task.id,courseId:course.id,courseName:course.name,localDate:'2026-10-02',timeZone:'Invalid/City',scheduledStart:0,endsAt:1,at:0,updatedAt:0,status:'failed',detail:'示例'};const text=JSON.stringify({...store.data,scheduledRuns:[run]});writeFileSync(store.path,text);expect(()=>new Store(directory)).toThrow('原文件已保留');expect(readFileSync(store.path,'utf8')).toBe(text);
 }));
});
