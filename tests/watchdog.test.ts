import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Watchdog, type ClassroomDriver, type WatchdogHooks } from '../src/main/watchdog';
import type { CourseConfig, PageSnapshot, QuestionSnapshot } from '../src/shared/types';

const course: CourseConfig = { id: '11111111-1111-4111-8111-111111111111', remoteId: 'course', name: 'Testing', url: 'https://student.iclicker.com/#/course/course/overview', latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 1, mode: 'auto-a' };
const question = (patch: Partial<QuestionSnapshot> = {}): QuestionSnapshot => ({ key: 'meeting:activity:q1', stable: true, kind: 'single', open: true, answered: false, selected: false, hasA: true, title: 'Question', ...patch });
describe('classroom watchdog', () => {
  let snapshot: PageSnapshot;
  let open: boolean;
  let driver: ClassroomDriver;
  let hooks: WatchdogHooks;
  let watchdog: Watchdog;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
    open = true; snapshot = { state: 'classroom', courseId: 'course', attendance: 'confirmed' };
    driver = { isOpen: vi.fn(() => open), prepare: vi.fn(async () => {}), read: vi.fn(async () => structuredClone(snapshot)), join: vi.fn(async () => {}), answerA: vi.fn(async () => {}), disarm: vi.fn(async () => {}), extendDeadline: vi.fn(async () => {}) };
    hooks = { changed: vi.fn(), log: vi.fn(), notify: vi.fn(), clearNotifications: vi.fn(), keepAwake: vi.fn() };
    watchdog = new Watchdog(driver, hooks);
  });
  afterEach(async () => { await watchdog.stop(); vi.useRealTimers(); });
  it('pauses checks during a transition and retains the session, deadline and handled answers', async () => {
    snapshot.question=question({answered:true}); await watchdog.start(course);
    const id=watchdog.session!.id, deadline=watchdog.session!.endsAt;
    let release!:()=>void;
    const switching=watchdog.transition(async()=>{await new Promise<void>(resolve=>{release=resolve;});});
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const reads=vi.mocked(driver.read).mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);await watchdog.tick();
    expect(driver.read).toHaveBeenCalledTimes(reads);
    await expect(watchdog.start(course)).rejects.toThrow('切换');
    release();await switching;
    expect(watchdog.session).toMatchObject({id,endsAt:deadline,status:'monitoring',handled:{[question().key]:'confirmed'}});
    expect(driver.answerA).not.toHaveBeenCalled();
  });
  it('aborts an in-progress transition when stopped and does not restart checks', async () => {
    await watchdog.start(course);
    let release!:()=>void, signal:AbortSignal|undefined;
    const switching=watchdog.transition(async input=>{signal=input;await new Promise<void>(resolve=>{release=resolve;});});
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const reads=vi.mocked(driver.read).mock.calls.length;
    await watchdog.stop();expect(signal?.aborted).toBe(true);
    release();await switching;await vi.advanceTimersByTimeAsync(10000);
    expect(driver.read).toHaveBeenCalledTimes(reads);expect(watchdog.session!.status).toBe('stopped');
  });
  it('still opens an explicit classroom action after a previous session ended', async () => {
    await watchdog.start(course);await watchdog.stop();
    const action=vi.fn(async()=>{});await watchdog.transition(action);
    expect(action).toHaveBeenCalledOnce();expect(action).toHaveBeenCalledWith(undefined);
  });
  it('submits A once and confirms only after a receipt, even across repeated snapshots', async () => {
    snapshot.question = question(); await watchdog.start(course);
    expect(driver.answerA).toHaveBeenCalledTimes(1);
    expect(watchdog.session?.handled[question().key]).toBe('attempted');
    await vi.advanceTimersByTimeAsync(15000);
    expect(driver.answerA).toHaveBeenCalledTimes(1);
    snapshot.question.answered = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(watchdog.session?.handled[question().key]).toBe('confirmed');
    expect(watchdog.session?.status).toBe('monitoring');
  });
  it('treats identical text with a different question id as a new question', async () => {
    snapshot.question = question(); await watchdog.start(course);
    snapshot.question = question({ key: 'meeting:activity:q2' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(driver.answerA).toHaveBeenCalledTimes(2);
  });
  it.each([{ selected: true }, { kind: 'other' as const }, { stable: false }, { hasA: false }])('requires human action for %j', async patch => {
    snapshot.question = question(patch); await watchdog.start(course);
    expect(driver.answerA).not.toHaveBeenCalled(); expect(hooks.notify).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite an existing received answer', async () => {
    snapshot.question = question({ answered: true }); await watchdog.start(course);
    expect(driver.answerA).not.toHaveBeenCalled(); expect(hooks.notify).not.toHaveBeenCalled();
  });
  it('reminds at 0 and 30 seconds, then stops after the answer is received', async () => {
    snapshot.question = question(); await watchdog.start({ ...course, mode: 'notify' });
    expect(hooks.notify).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29999); expect(hooks.notify).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(hooks.notify).toHaveBeenCalledTimes(2);
    snapshot.question.answered = true;
    await vi.advanceTimersByTimeAsync(30000); expect(hooks.notify).toHaveBeenCalledTimes(2);
    expect(watchdog.session?.status).toBe('completed');
  });
  it('stops reminding when polling closes', async () => {
    snapshot.question = question(); await watchdog.start({ ...course, mode: 'notify' });
    snapshot.question.open = false;
    await vi.advanceTimersByTimeAsync(35000); expect(hooks.notify).toHaveBeenCalledTimes(1);
  });
  it('cannot submit after stop, even when page inspection finishes late', async () => {
    await watchdog.start(course);
    let resolve!: (value: PageSnapshot) => void;
    vi.mocked(driver.read).mockImplementation(() => new Promise(done => { resolve = done; }));
    const check = watchdog.tick();
    const stopped = watchdog.stop();
    resolve({ ...snapshot, question: question() });
    await Promise.all([check, stopped]);
    expect(driver.answerA).not.toHaveBeenCalled(); expect(hooks.keepAwake).toHaveBeenLastCalledWith(false);
  });
  it('cancels a late browser preparation at the original deadline', async () => {
    let resolve!: () => void;
    vi.mocked(driver.prepare).mockImplementation(() => new Promise(done => { resolve = done; }));
    const start = watchdog.start(course);
    await vi.advanceTimersByTimeAsync(60000);
    expect(watchdog.session?.status).toBe('completed');
    resolve(); await start;
    expect(driver.read).not.toHaveBeenCalled(); expect(driver.disarm).toHaveBeenCalled();
  });
  it('pauses on window closure without opening another window and retains the deadline', async () => {
    await watchdog.start(course); const ends = watchdog.session!.endsAt;
    open = false; await vi.advanceTimersByTimeAsync(10000);
    expect(watchdog.session?.status).toBe('window-closed'); expect(hooks.notify).toHaveBeenCalledTimes(1);
    expect(driver.prepare).toHaveBeenCalledTimes(1); expect(watchdog.session?.endsAt).toBe(ends);
    open = true; await watchdog.resumed(); expect(watchdog.session?.status).toBe('monitoring');
  });
  it('does not act when the user navigates to another course', async () => {
    snapshot = { state: 'joinable', courseId: 'other', attendance: 'unknown', question: question() };
    await watchdog.start(course);
    expect(driver.join).not.toHaveBeenCalled(); expect(driver.answerA).not.toHaveBeenCalled();
    expect(watchdog.session?.status).toBe('attention');
  });
  it.each(['wrong-course', 'unknown', 'join-failed'])('keeps the %s notification available between checks', async reason => {
    snapshot = reason === 'wrong-course'
      ? { state: 'waiting', courseId: 'other', attendance: 'unknown' }
      : { state: reason === 'unknown' ? 'unknown' : 'joinable', courseId: 'course', attendance: 'unknown' };
    await watchdog.start({ ...course, durationMinutes: 5 });
    if (reason === 'join-failed') await vi.advanceTimersByTimeAsync(45000);
    expect(hooks.notify).toHaveBeenLastCalledWith(reason, expect.any(String), expect.any(String));
    vi.mocked(hooks.clearNotifications).mockClear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(hooks.clearNotifications).not.toHaveBeenCalled();
    snapshot = { state: 'classroom', courseId: 'course', attendance: 'confirmed' };
    await watchdog.tick();
    expect(hooks.clearNotifications).toHaveBeenCalled();
  });
  it('backs off offline checks and resumes before the deadline', async () => {
    snapshot.state = 'offline'; await watchdog.start(course);
    await vi.advanceTimersByTimeAsync(9999); expect(driver.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(driver.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19999); expect(driver.read).toHaveBeenCalledTimes(2);
    snapshot.state = 'classroom'; await vi.advanceTimersByTimeAsync(1);
    expect(watchdog.session?.status).toBe('monitoring');
  });
  it('requires login without extending the course', async () => {
    snapshot.state = 'login'; await watchdog.start(course);
    await vi.advanceTimersByTimeAsync(60000);
    expect(watchdog.session?.status).toBe('completed'); expect(driver.join).not.toHaveBeenCalled();
  });
  it('only confirms attendance after the website confirms, and caps join attempts', async () => {
    snapshot = { state: 'joinable', courseId: 'course', attendance: 'pending' };
    await watchdog.start(course); expect(watchdog.session?.attendance).toBe('pending');
    await vi.advanceTimersByTimeAsync(45000);
    expect(driver.join).toHaveBeenCalledTimes(3); expect(watchdog.session?.status).toBe('attention');
  });
  it('retains the last successful check and clears stale questions while offline', async () => {
    snapshot.question = question({ answered: true }); await watchdog.start(course);
    const successful = watchdog.session!.lastSuccessfulCheckAt;
    snapshot.state = 'offline'; await vi.advanceTimersByTimeAsync(5000);
    expect(watchdog.session?.status).toBe('offline');
    expect(watchdog.session?.lastSuccessfulCheckAt).toBe(successful);
    expect(watchdog.session?.attendance).toBe('confirmed');
    expect(watchdog.session?.question).toBeUndefined();
    expect(watchdog.session?.issue).toBe('network');
  });
  it('reports an answer failure as an action requiring inspection, preserving deduplication', async () => {
    snapshot.question = question(); vi.mocked(driver.answerA).mockRejectedValue(new Error('Answer button unavailable'));
    await watchdog.start(course);
    expect(watchdog.session?.status).toBe('attention'); expect(watchdog.session?.issue).toBe('answer');
    await vi.advanceTimersByTimeAsync(10000);
    expect(driver.answerA).toHaveBeenCalledTimes(1);
  });
  it('keeps a confirmed attendance receipt when a later page is pending again', async () => {
    await watchdog.start(course); const confirmedAt=watchdog.session!.attendanceConfirmedAt;
    snapshot={state:'joinable',courseId:'course',attendance:'pending'};
    await vi.advanceTimersByTimeAsync(5000);
    expect(watchdog.session?.attendance).toBe('confirmed');
    expect(watchdog.session?.attendanceConfirmedAt).toBe(confirmedAt);
    await watchdog.stop();expect(watchdog.session?.summary?.attendance).toBe('confirmed');
    expect(vi.mocked(hooks.log).mock.calls.filter(call=>call[2]?.event==='attendance-confirmed')).toHaveLength(1);
  });
  it('does not mislabel page inspection failures as network failures', async () => {
    vi.mocked(driver.read).mockRejectedValue(new Error('Page inspection timed out'));
    await watchdog.start(course);
    expect(watchdog.session?.status).toBe('attention'); expect(watchdog.session?.issue).toBe('page');
    expect(watchdog.session?.lastSuccessfulCheckAt).toBeUndefined();
  });

  it('links discovery, attempt and confirmation events with their question and timestamps', async () => {
    snapshot.question = question(); await watchdog.start(course);
    const initial = vi.mocked(hooks.log).mock.calls;
    expect(initial.find(call => call[2]?.event === 'question-opened')?.[2]).toMatchObject({questionKey:question().key,questionTitle:'Question',courseName:'Testing'});
    expect(initial.find(call => call[2]?.event === 'answer-attempted')?.[2]?.attemptedAt).toBe(Date.now());
    snapshot.question.answered = true; await vi.advanceTimersByTimeAsync(5000);
    const confirmed = vi.mocked(hooks.log).mock.calls.find(call => call[2]?.event === 'answer-confirmed');
    expect(confirmed?.[2]).toMatchObject({questionKey:question().key,result:'confirmed',confirmedAt:Date.now()});
    const count = vi.mocked(hooks.log).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.mocked(hooks.log).mock.calls.length).toBe(count);
    expect(watchdog.session?.questions?.[question().key].confirmedAt).toBeDefined();
  });

  it('keeps an observed question historical without inferring closure from an unknown page', async () => {
    snapshot.question=question(); await watchdog.start({...course,mode:'notify'});
    snapshot={state:'unknown',courseId:'course',attendance:'unknown'};
    await vi.advanceTimersByTimeAsync(5000);
    expect(watchdog.session?.question).toBeUndefined();
    expect(watchdog.session?.questions?.[question().key].closedAt).toBeUndefined();
    expect(watchdog.session?.questions?.[question().key].title).toBe('Question');
  });
  it('records a receipt first observed after a question closes without another submission', async () => {
    snapshot.question=question();await watchdog.start(course);
    snapshot.question={...snapshot.question,open:false,answered:true};
    await vi.advanceTimersByTimeAsync(5000);
    expect(watchdog.session?.handled[question().key]).toBe('confirmed');
    expect(watchdog.session?.questions?.[question().key].confirmedAt).toBeDefined();
    expect(driver.answerA).toHaveBeenCalledTimes(1);
    await watchdog.stop();expect(watchdog.session?.summary?.confirmedAnswerCount).toBe(1);
  });

  it('extends only this session and replaces the original hard deadline', async () => {
    await watchdog.start(course); const original=watchdog.session!.endsAt;
    await watchdog.extend();
    expect(watchdog.session!.endsAt).toBe(original+600000);
    expect(driver.extendDeadline).toHaveBeenCalledWith(original+600000);
    expect(watchdog.session!.course.durationMinutes).toBe(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(watchdog.session?.status).toBe('monitoring');
    await watchdog.extend(); expect(watchdog.session!.endsAt).toBe(original+1200000);
    await vi.advanceTimersByTimeAsync(1200000);
    expect(watchdog.session?.status).toBe('completed');
    await expect(watchdog.extend()).rejects.toThrow('已结束');
  });
  it('disarms again after a late extension finishes during manual stop', async () => {
    await watchdog.start(course);
    let resolve!:()=>void; let gate=watchdog.session!.endsAt;
    vi.mocked(driver.extendDeadline).mockImplementation(async deadline=>{await new Promise<void>(done=>{resolve=done;});gate=deadline;});
    vi.mocked(driver.disarm).mockImplementation(async()=>{gate=0;});
    const extending=watchdog.extend(); const stopped=watchdog.stop(); resolve();
    await Promise.all([extending,stopped]);
    expect(gate).toBe(0); expect(watchdog.session?.status).toBe('stopped');
    expect(hooks.keepAwake).toHaveBeenLastCalledWith(false);
  });
  it('can extend during an outage and keeps the same deadline after resume', async () => {
    snapshot.state='offline'; await watchdog.start(course);
    await watchdog.extend(); const ends=watchdog.session!.endsAt;
    snapshot.state='classroom'; await watchdog.resumed();
    expect(watchdog.session?.status).toBe('monitoring');expect(watchdog.session?.endsAt).toBe(ends);
  });

  it('accepts extension immediately before expiry and rejects it once expired', async () => {
    await watchdog.start(course); await vi.advanceTimersByTimeAsync(59999);
    await watchdog.extend(); await vi.advanceTimersByTimeAsync(1);
    expect(watchdog.session?.status).toBe('monitoring');
    await vi.advanceTimersByTimeAsync(600000); expect(watchdog.session?.status).toBe('completed');
    await expect(watchdog.extend()).rejects.toThrow('已结束');
  });
  it('uses the extended deadline on wake and never acts after it has passed', async () => {
    await watchdog.start(course);await watchdog.extend();const ends=watchdog.session!.endsAt;
    vi.setSystemTime(ends-1);await watchdog.resumed();
    expect(watchdog.session?.status).toBe('monitoring');expect(watchdog.session?.endsAt).toBe(ends);
    vi.mocked(driver.read).mockClear();snapshot.question=question();
    vi.setSystemTime(ends+1);await watchdog.resumed();
    expect(watchdog.session?.status).toBe('completed');
    expect(driver.read).not.toHaveBeenCalled();expect(driver.answerA).not.toHaveBeenCalled();
    expect(watchdog.session?.summary?.reason).toBe('expired');
  });
  it('waits for a late extension even when the first disarm fails', async () => {
    await watchdog.start(course); let resolve!:()=>void; let gate=watchdog.session!.endsAt;
    vi.mocked(driver.extendDeadline).mockImplementation(async deadline=>{await new Promise<void>(done=>{resolve=done;});gate=deadline;});
    vi.mocked(driver.disarm).mockRejectedValueOnce(new Error('temporary disconnect')).mockImplementation(async()=>{gate=0;});
    const extending=watchdog.extend(); const stopped=watchdog.stop(); resolve();
    await Promise.all([extending,stopped]); expect(gate).toBe(0);
  });

  it('summarizes confirmed answers separately from pending attempts and unconfirmed questions', async () => {
    snapshot.question=question(); await watchdog.start(course);
    snapshot.question.answered=true; await vi.advanceTimersByTimeAsync(5000);
    snapshot.question=question({key:'q2',kind:'other'}); await vi.advanceTimersByTimeAsync(5000);
    snapshot.question=question({key:'q3'}); await vi.advanceTimersByTimeAsync(5000);
    await watchdog.stop();
    const summary=watchdog.session!.summary!;
    expect(summary).toMatchObject({reason:'manual',attendance:'confirmed',observedQuestionCount:3,confirmedAnswerCount:1,pendingAttemptCount:1,unconfirmedQuestionCount:2,endedAt:Date.now()});
    expect(summary.questions).toHaveLength(3);
    await watchdog.stop();expect(watchdog.session!.summary).toEqual(summary);
  });
  it('creates an expiry summary with gaps after a monitoring interruption', async () => {
    snapshot.question=question({kind:'other'}); await watchdog.start(course);
    open=false; await vi.advanceTimersByTimeAsync(60000);
    expect(watchdog.session?.summary).toMatchObject({reason:'expired',hadInterruptions:true,observedQuestionCount:1,confirmedAnswerCount:0,pendingAttemptCount:0});
  });

});
