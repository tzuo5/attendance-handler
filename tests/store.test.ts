import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { summarizeSession } from '../src/shared/session-summary';
import type { SessionState } from '../src/shared/types';
import { Store, LOG_LIMIT } from '../src/main/store';

describe('local event records', () => {
  it('reads legacy state and persists structured events without credentials', () => {
    const directory = mkdtempSync(join(tmpdir(), 'attendance-store-test-'));
    try {
      writeFileSync(join(directory,'state.json'),JSON.stringify({version:1,courses:[],session:null,logs:[{id:'old',at:1,level:'info',message:'旧记录'}]}));
      const store = new Store(directory);
      expect(store.data.logs[0].message).toBe('旧记录');
      store.log('success','已确认答案',{event:'answer-confirmed',sessionId:'session',questionKey:'q1',questionTitle:'示例题目',confirmedAt:123,result:'confirmed'});
      store.log('error','access_token=demo-secret Bearer example-secret');
      const loaded = new Store(directory);
      expect(loaded.data.logs[1]).toMatchObject({event:'answer-confirmed',sessionId:'session',questionKey:'q1',confirmedAt:123});
      expect(loaded.data.logs[0].message).not.toContain('demo-secret');
      expect(loaded.data.logs[0].message).not.toContain('example-secret');
      store.data.logs = Array.from({length:LOG_LIMIT},(_,i)=>({id:String(i),at:i,level:'info',message:'记录'}));
      store.log('info','新事件');
      expect(new Store(directory).data.logs).toHaveLength(LOG_LIMIT);
    } finally { rmSync(directory,{recursive:true,force:true}); }
  });
  it('persists one summary per classroom and recovers legacy question counts', () => {
    const directory=mkdtempSync(join(tmpdir(),'attendance-summary-test-'));
    try {
      const store=new Store(directory);
      const session:SessionState={id:'session',course:{id:'11111111-1111-4111-8111-111111111111',remoteId:'demo',name:'示例课程',url:'https://student.iclicker.com/#/course/demo',latitude:0,longitude:0,accuracy:10,durationMinutes:50,mode:'auto-a'},startedAt:100,endsAt:1000,status:'stopped',attendance:'confirmed',handled:{q1:'confirmed',q2:'attempted'},detail:'结束'};
      session.summary=summarizeSession(session,500,'interrupted');
      store.setSession(session);store.setSession(session);
      const loaded=new Store(directory);
      expect(loaded.data.summaries).toHaveLength(1);
      expect(loaded.data.summaries[0]).toMatchObject({reason:'interrupted',observedQuestionCount:2,confirmedAnswerCount:1,pendingAttemptCount:1,hadInterruptions:true});
    } finally {rmSync(directory,{recursive:true,force:true});}
  });

});
