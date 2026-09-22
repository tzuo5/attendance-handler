import { ACTIVE, type CourseConfig, type PageSnapshot, type QuestionSnapshot, type SessionState } from '../shared/types';
export interface ClassroomDriver {
  isOpen(): boolean;
  prepare(course: CourseConfig, deadline: number, signal: AbortSignal): Promise<void>;
  read(): Promise<PageSnapshot>;
  join(signal: AbortSignal): Promise<void>;
  answerA(question: QuestionSnapshot, signal: AbortSignal): Promise<void>;
  disarm(): Promise<void>;
}
export interface WatchdogHooks {
  changed(session: SessionState): void;
  log(level: 'info' | 'success' | 'warning' | 'error', message: string): void;
  notify(key: string, title: string, body: string): void;
  clearNotifications(): void;
  keepAwake(enabled: boolean): void;
}
export class Watchdog {
  session: SessionState | null = null;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private inFlight: Promise<void> | null = null;
  private lastReminders = new Map<string, number>();
  private failures = 0;
  private joins = 0;
  private lastJoin = -Infinity;
  private preparation?: Promise<void>;
  private stopping: Promise<void> | null = null;
  constructor(private driver: ClassroomDriver, private hooks: WatchdogHooks, private now = () => Date.now()) {}

  async start(course: CourseConfig) {
    if (ACTIVE(this.session)) throw new Error('已有课程正在监控，请先结束当前课程。');
    if (this.stopping) await this.stopping;
    this.controller = new AbortController();
    this.lastReminders.clear(); this.failures = 0; this.joins = 0; this.lastJoin = -Infinity;
    this.session = { id: crypto.randomUUID(), course: structuredClone(course), startedAt: this.now(), endsAt: this.now() + course.durationMinutes * 60000, status: 'starting', attendance: 'unknown', handled: {}, detail: '正在打开专用 Chrome 课堂窗口' };
    const run = this.session;
    this.hooks.keepAwake(true); this.hooks.clearNotifications(); this.emit();
    this.hooks.log('info', `开始 ${course.name} · ${course.durationMinutes} 分钟`);
    this.deadlineTimer = setTimeout(() => { void this.stop(true); }, run.endsAt - this.now());
    const signal = this.controller.signal;
    this.preparation = this.driver.prepare(course, run.endsAt, signal);
    try {
      await this.preparation;
      if (!this.live(run)) { await this.driver.disarm(); return; }
      this.session.status = 'waiting'; this.emit();
      await this.tick();
    } catch (error) {
      if (!this.live(run)) return;
      this.change('attention', error instanceof Error ? error.message : '浏览器连接失败');
      this.hooks.log('error', this.session!.detail);
      this.remind('browser-error', '课堂连接需要处理', this.session!.detail, Infinity);
      this.schedule(5000);
    }
  }

  private live(run: SessionState) {
    return this.session === run && ACTIVE(run) && !this.controller?.signal.aborted && this.now() < run.endsAt;
  }
  private emit() { if (this.session) this.hooks.changed(structuredClone(this.session)); }
  private change(status: SessionState['status'], detail: string) { if (this.session) { this.session.status = status; this.session.detail = detail; this.emit(); } }
  private remind(key: string, title: string, body: string, interval = 30000) {
    const last = this.lastReminders.get(key);
    if (last === undefined || this.now() - last >= interval) {
      this.lastReminders.set(key, this.now()); this.hooks.notify(key, title, body);
    }
  }
  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (ACTIVE(this.session)) this.timer = setTimeout(() => { void this.tick(); }, ms);
  }
  async tick() {
    if (this.inFlight || !ACTIVE(this.session)) return;
    if (this.now() >= this.session.endsAt) { await this.stop(true); return; }
    const run = this.session;
    const started = this.now();
    this.inFlight = this.check(run);
    try { await this.inFlight; }
    finally {
      this.inFlight = null;
      if (this.live(run)) this.schedule(Math.max(0, Math.min(30000, 5000 * 2 ** this.failures) - (this.now() - started)));
    }
  }
  private async check(run: SessionState) {
    try {
      if (!this.driver.isOpen()) {
        if (run.status !== 'window-closed') this.hooks.clearNotifications();
        run.question = undefined;
        this.change('window-closed', '课堂窗口已关闭。点击“查看课堂”恢复，倒计时继续。');
        this.remind('window-closed', '课堂监控已暂停', '点击此通知重新打开课堂。', Infinity);
        return;
      }
      const page = await this.driver.read();
      if (!this.live(run)) return;
      run.lastCheckedAt = this.now();
      if (page.state === 'login') {
        if (run.status !== 'needs-login') this.hooks.clearNotifications();
        run.question = undefined;
        this.change('needs-login', '请在 Chrome 中完成登录，然后点击“查看课堂”恢复课程。');
        this.remind('login', 'iClicker 需要登录', '点击通知，在课堂窗口完成登录或学校验证。', Infinity); return;
      }
      this.lastReminders.delete('login'); this.lastReminders.delete('window-closed');
      if (page.state === 'offline') throw new Error('网络连接中断，正在等待恢复');
      if (['needs-login', 'window-closed', 'offline'].includes(run.status)) this.hooks.clearNotifications();
      this.lastReminders.delete('connection');
      this.failures = 0;
      if (page.courseId && page.courseId !== run.course.remoteId) {
        if (!this.lastReminders.has('wrong-course')) this.hooks.clearNotifications();
        this.change('attention', '浏览器已切到其他课程。点击“查看课堂”返回监控课程。');
        this.remind('wrong-course', '课堂页面已改变', '点击返回当前监控课程。', Infinity); return;
      }
      if (this.lastReminders.delete('wrong-course')) this.hooks.clearNotifications();
      if (page.attendance === 'confirmed' && run.attendance !== 'confirmed') this.hooks.log('success', '已确认课堂签到成功');
      if (page.attendance !== 'unknown') run.attendance = page.attendance;
      const previousKey = run.question?.key;
      run.question = page.question;
      if (previousKey && (previousKey !== page.question?.key || !page.question?.open || page.question.answered)) this.hooks.clearNotifications();
      if (page.state === 'joinable') {
        if (this.joins >= 3) {
          this.change('attention', '三次加入尝试后仍未确认签到，请检查课堂页面。');
          this.remind('join-failed', '签到需要检查', '请查看 iClicker 中的签到结果或错误提示。', Infinity); return;
        }
        this.change('waiting', '正在加入课堂，等待签到回执');
        if (this.now() - this.lastJoin >= 15000) {
          this.lastJoin = this.now(); this.joins++;
          await this.driver.join(this.controller!.signal);
          if (this.live(run)) this.hooks.log('info', '已点击加入课堂，正在核实结果');
        }
        return;
      }
      if (page.state === 'unknown') {
        this.change('attention', page.detail || '暂时无法识别页面，自动提交已暂停');
        this.remind('unknown', '请检查课堂页面', this.session!.detail, 60000); return;
      }
      if (this.lastReminders.delete('unknown') || this.lastReminders.delete('browser-error')) this.hooks.clearNotifications();
      if (this.lastReminders.delete('join-failed')) this.hooks.clearNotifications();
      if (page.state === 'waiting') { this.change('waiting', '等待老师开课，保持每 5 秒检查'); return; }
      this.joins = 0;
      const q = page.question;
      if (!q || !q.open) { this.change('monitoring', '已进入课堂，等待新题目'); return; }
      if (q.answered) {
        if (run.handled[q.key] !== 'confirmed') this.hooks.log('success', '已确认题目答案被接收');
        run.handled[q.key] = 'confirmed'; this.change('monitoring', '当前题目已作答'); return;
      }
      if (run.handled[q.key] === 'confirmed') { this.change('monitoring', '当前题目已处理'); return; }
      if (run.course.mode === 'auto-a' && q.kind === 'single' && q.hasA && q.stable && !q.selected && !run.handled[q.key]) {
        // Persist intent BEFORE the side effect. An uncertain result never causes a second automatic submission.
        run.handled[q.key] = 'attempted'; this.change('monitoring', '正在选择 A，等待答案回执');
        await this.driver.answerA(q, this.controller!.signal);
        if (this.live(run)) this.hooks.log('info', '已尝试选择 A，下一次检查确认提交结果');
        return;
      }
      const reason = run.handled[q.key] === 'attempted' ? '自动作答尚未收到确认，请检查原页面。' : q.selected ? '页面已有选择，请检查答案是否提交。' : '出现新题目，请在 iClicker 中作答。';
      this.change('needs-answer', reason);
      this.remind(`question:${q.key}`, `${run.course.name} · 需要作答`, reason);
    } catch (error) {
      if (!this.live(run)) return;
      this.failures = Math.min(this.failures + 1, 3);
      const detail = error instanceof Error ? error.message : '网页检查失败';
      this.change(this.driver.isOpen() ? 'offline' : 'window-closed', detail);
      if (this.failures === 1) this.hooks.log('warning', detail);
      this.remind('connection', '课堂监控暂时中断', detail, 60000);
    }
  }
  async resumed() {
    if (!ACTIVE(this.session)) return;
    if (this.now() >= this.session.endsAt) { await this.stop(true); return; }
    this.joins = 0; this.lastJoin = -Infinity; this.lastReminders.clear(); this.failures = 0;
    await this.tick();
  }
  async stop(expired = false) {
    if (this.stopping) return this.stopping;
    if (!ACTIVE(this.session)) return;
    this.controller?.abort(); clearTimeout(this.timer); clearTimeout(this.deadlineTimer);
    this.session.question = undefined;
    this.change(expired ? 'completed' : 'stopped', expired ? '课程时间已到，监控已停止' : '已手动结束监控');
    this.hooks.clearNotifications(); this.hooks.keepAwake(false);
    this.hooks.log('info', this.session.detail);
    this.stopping = (async () => {
      try {
        await this.driver.disarm();
        await this.preparation?.catch(() => {});
        await this.inFlight?.catch(() => {});
        await this.driver.disarm();
      } catch { this.hooks.log('warning', '浏览器已断开；下次连接时将清除残留定位设置。'); }
      finally { this.stopping = null; }
    })();
    return this.stopping;
  }
}
