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
    driver = { isOpen: vi.fn(() => open), prepare: vi.fn(async () => {}), read: vi.fn(async () => structuredClone(snapshot)), join: vi.fn(async () => {}), answerA: vi.fn(async () => {}), disarm: vi.fn(async () => {}) };
    hooks = { changed: vi.fn(), log: vi.fn(), notify: vi.fn(), clearNotifications: vi.fn(), keepAwake: vi.fn() };
    watchdog = new Watchdog(driver, hooks);
  });
  afterEach(async () => { await watchdog.stop(); vi.useRealTimers(); });
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
});
