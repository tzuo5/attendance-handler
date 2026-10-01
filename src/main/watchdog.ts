import { summarizeSession } from '../shared/session-summary';
import { ACTIVE, type CourseConfig, type LogDetails, type LogEvent, type PageSnapshot, type QuestionSnapshot, type SessionState } from '../shared/types';
export interface ClassroomDriver {
  isOpen(): boolean;
  prepare(course: CourseConfig, deadline: number, signal: AbortSignal): Promise<void>;
  read(): Promise<PageSnapshot>;
  join(signal: AbortSignal): Promise<void>;
  answerA(question: QuestionSnapshot, signal: AbortSignal): Promise<void>;
  disarm(): Promise<void>;
  extendDeadline(deadline: number): Promise<void>;
}
export interface WatchdogHooks {
  changed(session: SessionState): void;
  log(level: 'info' | 'success' | 'warning' | 'error', message: string, details?: LogDetails): void;
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
  private extending: Promise<void> | null = null;
  private preparation?: Promise<void>;
  private stopping: Promise<void> | null = null;
  constructor(private driver: ClassroomDriver, private hooks: WatchdogHooks, private now = () => Date.now()) {}

  async start(course: CourseConfig) {
    if (ACTIVE(this.session)) throw new Error('已有课程正在监控，请先结束当前课程。');
    if (this.stopping) await this.stopping;
    this.controller = new AbortController();
    this.lastReminders.clear(); this.failures = 0; this.joins = 0; this.lastJoin = -Infinity;
    this.session = { id: crypto.randomUUID(), course: structuredClone(course), startedAt: this.now(), endsAt: this.now() + course.durationMinutes * 60000, status: 'starting', attendance: 'unknown', questions: {}, handled: {}, detail: '正在打开专用 Chrome 课堂窗口' };
    const run = this.session;
    this.hooks.keepAwake(true); this.hooks.clearNotifications(); this.emit();
    this.event('info', `开始 ${course.name} · ${course.durationMinutes} 分钟`, 'session-started', { endsAt: run.endsAt });
    this.armDeadline(run);
    const signal = this.controller.signal;
    this.preparation = this.driver.prepare(course, run.endsAt, signal);
    try {
      await this.preparation;
      if (!this.live(run)) { await this.driver.disarm(); return; }
      this.session.status = 'waiting'; this.emit();
      await this.tick();
    } catch (error) {
      if (!this.live(run)) return;
      this.change('attention', error instanceof Error ? error.message : '浏览器连接失败', 'browser');
      this.event('error', this.session!.detail, 'system', { result: 'failed' });
      this.remind('browser-error', '课堂连接需要处理', this.session!.detail, Infinity);
      this.schedule(5000);
    }
  }

  private live(run: SessionState) {
    return this.session === run && ACTIVE(run) && !this.controller?.signal.aborted && this.now() < run.endsAt;
  }
  private emit() { if (this.session) this.hooks.changed(structuredClone(this.session)); }
  private change(status: SessionState['status'], detail: string, issue?: SessionState['issue']) {
    if (!this.session) return;
    const changed = this.session.status !== status || this.session.detail !== detail || this.session.issue !== issue;
    if (['offline','needs-login','window-closed','attention'].includes(status)) this.session.hadInterruptions = true;
    this.session.status = status; this.session.detail = detail; this.session.issue = issue;
    if (changed) this.event(issue || ['offline', 'window-closed', 'needs-login', 'attention'].includes(status) ? 'warning' : 'info', detail, 'status-changed', { status });
    this.emit();
  }
  private event(level: 'info' | 'success' | 'warning' | 'error', message: string, event: LogEvent, details: LogDetails = {}) {
    const run = this.session;
    this.hooks.log(level, message, { event, sessionId: run?.id, courseId: run?.course.id, courseName: run?.course.name, mode: run?.course.mode,
      questionKey: run?.question?.key, questionTitle: run?.question?.title, ...details });
  }
  private observeQuestion(run: SessionState, question?: QuestionSnapshot) {
    run.questions ||= {};
    const previous = run.question && run.questions[run.question.key];
    if (previous && !previous.closedAt && (question?.key !== previous.key || !question.open)) {
      previous.closedAt = this.now();
      this.event('info', '题目已关闭或课堂已切换到新题', 'question-closed', { questionKey: previous.key, questionTitle: previous.title, result: 'closed' });
    }
    if (!question) return;
    let record = run.questions[question.key];
    if (!record) {
      record = { key: question.key, title: question.title, kind: question.kind, mode: run.course.mode, firstSeenAt: this.now(), lastSeenAt: this.now() };
      run.questions[question.key] = record;
      this.event('info', `发现题目：${question.title}`, 'question-opened', { questionKey: question.key, questionTitle: question.title });
    }
    record.lastSeenAt = this.now(); record.title = question.title;
    if (!question.open) record.closedAt ||= this.now();
  }
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
    let operation: 'page' | 'join' | 'answer' = 'page';
    try {
      if (!this.driver.isOpen()) {
        if (run.status !== 'window-closed') this.hooks.clearNotifications();
        run.question = undefined;
        this.change('window-closed', '课堂窗口已关闭。点击“恢复课堂”继续监控，原结束时间保留。');
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
      if (page.state === 'offline') throw new Error('网络连接中断，正在自动重连');
      if (['needs-login', 'window-closed', 'offline'].includes(run.status)) this.hooks.clearNotifications();
      this.lastReminders.delete('connection');
      this.failures = 0;
      if (page.courseId && page.courseId !== run.course.remoteId) {
        if (!this.lastReminders.has('wrong-course')) this.hooks.clearNotifications();
        run.question = undefined;
        this.change('attention', '浏览器已切到其他课程。点击“返回监控课程”继续。', 'course');
        this.remind('wrong-course', '课堂页面已改变', '点击返回当前监控课程。', Infinity); return;
      }
      if (this.lastReminders.delete('wrong-course')) this.hooks.clearNotifications();
      if (page.state !== 'unknown') run.lastSuccessfulCheckAt = this.now();
      if (page.attendance === 'confirmed' && run.attendance !== 'confirmed') { run.attendanceConfirmedAt = this.now(); this.event('success', '已确认课堂签到成功', 'attendance-confirmed', { confirmedAt: run.attendanceConfirmedAt, result: 'confirmed' }); }
      if (run.attendance !== 'confirmed' && page.attendance !== 'unknown') run.attendance = page.attendance;
      const previousKey = run.question?.key;
      if (page.state !== 'unknown') this.observeQuestion(run, page.question);
      run.question = page.question;
      if (previousKey && (previousKey !== page.question?.key || !page.question?.open || page.question.answered)) this.hooks.clearNotifications();
      if (page.state === 'joinable') {
        if (this.joins >= 3) {
          this.change('attention', '三次加入尝试后仍未确认签到，请检查课堂页面。', 'join');
          this.remind('join-failed', '签到需要检查', '请查看 iClicker 中的签到结果或错误提示。', Infinity); return;
        }
        this.change('waiting', '正在加入课堂，等待签到回执');
        if (this.now() - this.lastJoin >= 15000) {
          this.lastJoin = this.now(); this.joins++;
          operation = 'join';
          await this.driver.join(this.controller!.signal);
          if (this.live(run)) this.event('info', '已点击加入课堂，正在核实结果', 'attendance-attempted', { attemptedAt: this.now(), result: 'pending' });
        }
        return;
      }
      if (page.state === 'unknown') {
        run.question = undefined;
        this.change('attention', page.detail || '暂时无法识别页面，自动提交已暂停', 'page');
        this.remind('unknown', '请检查课堂页面', this.session!.detail, 60000); return;
      }
      if (this.lastReminders.delete('unknown') || this.lastReminders.delete('browser-error')) this.hooks.clearNotifications();
      if (this.lastReminders.delete('join-failed')) this.hooks.clearNotifications();
      if (page.state === 'waiting') { this.change('waiting', '等待老师开课，保持每 5 秒检查'); return; }
      this.joins = 0;
      const q = page.question;
      if (q?.answered) {
        if (run.handled[q.key] !== 'confirmed') {
          const record = run.questions![q.key]; record.confirmedAt = this.now();
          this.event('success', '已确认题目答案被接收', 'answer-confirmed', { attemptedAt: record.attemptedAt, confirmedAt: record.confirmedAt, result: 'confirmed' });
        }
        run.handled[q.key] = 'confirmed'; this.change('monitoring', '当前题目已作答'); return;
      }
      if (!q || !q.open) { this.change('monitoring', '已进入课堂，等待新题目'); return; }
      if (run.handled[q.key] === 'confirmed') { this.change('monitoring', '当前题目已处理'); return; }
      if (run.course.mode === 'auto-a' && q.kind === 'single' && q.hasA && q.stable && !q.selected && !run.handled[q.key]) {
        // Persist intent BEFORE the side effect. An uncertain result never causes a second automatic submission.
        run.handled[q.key] = 'attempted'; run.questions![q.key].attemptedAt = this.now();
        this.event('info', '开始尝试选择 A，等待网站确认', 'answer-attempted', { attemptedAt: this.now(), result: 'pending' });
        this.change('monitoring', '正在选择 A，等待答案回执');
        operation = 'answer';
        await this.driver.answerA(q, this.controller!.signal);
        if (this.live(run)) this.event('info', '已尝试选择 A，下一次检查确认提交结果', 'system', { result: 'pending' });
        return;
      }
      const reason = run.handled[q.key] === 'attempted' ? '自动作答尚未收到确认，请检查原页面。' : q.selected ? '页面已有选择，请检查答案是否提交。' : '出现新题目，请在 iClicker 中作答。';
      this.change('needs-answer', reason);
      this.remind(`question:${q.key}`, `${run.course.name} · 需要作答`, reason);
    } catch (error) {
      if (!this.live(run)) return;
      this.failures = Math.min(this.failures + 1, 3);
      const detail = error instanceof Error ? error.message : '网页检查失败';
      run.question = undefined;
      const network = /网络连接|net::ERR_|ERR_INTERNET|ERR_CONNECTION|ERR_NETWORK/i.test(detail);
      const status = !this.driver.isOpen() ? 'window-closed' : operation === 'page' && network ? 'offline' : 'attention';
      this.change(status, detail, status === 'offline' ? 'network' : status === 'window-closed' ? 'browser' : operation);
      if (this.failures === 1) this.event('warning', detail, 'system', { result: 'failed' });
      this.remind('connection', '课堂监控暂时中断', detail, 60000);
    }
  }
  async resumed() {
    if (!ACTIVE(this.session)) return;
    if (this.now() >= this.session.endsAt) { await this.stop(true); return; }
    this.joins = 0; this.lastJoin = -Infinity; this.lastReminders.clear(); this.failures = 0;
    await this.tick();
  }
  private armDeadline(run: SessionState) {
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = setTimeout(() => { void this.stop(true); }, Math.max(0, run.endsAt - this.now()));
  }
  async extend() {
    if (!ACTIVE(this.session) || this.now() >= this.session.endsAt) throw new Error('本次监控已结束，请重新开始上课。');
    if (this.extending) return this.extending;
    const run = this.session;
    const previousEndsAt = run.endsAt;
    run.endsAt += 10 * 60000;
    this.armDeadline(run); this.emit();
    this.event('info', '本次监控已延长 10 分钟', 'session-extended', { previousEndsAt, endsAt: run.endsAt });
    this.extending = this.driver.extendDeadline(run.endsAt).catch(error => {
      if (this.live(run)) {
        this.change('attention', '时间已延长，浏览器截止时间需要重新核实。请检查课堂。', 'browser');
        this.event('warning', error instanceof Error ? error.message : '更新浏览器截止时间失败', 'system', { result:'failed' });
      }
      throw new Error('时间已延长，但浏览器暂时无法连接。请点击恢复入口重新核实。');
    }).finally(() => { this.extending = null; });
    return this.extending;
  }
  async stop(expired = false) {
    if (this.stopping) return this.stopping;
    if (!ACTIVE(this.session)) return;
    this.controller?.abort(); clearTimeout(this.timer); clearTimeout(this.deadlineTimer);
    this.session.summary = summarizeSession(this.session, this.now(), expired ? 'expired' : 'manual');
    this.session.question = undefined;
    this.change(expired ? 'completed' : 'stopped', expired ? '课程时间已到，监控已停止' : '已手动结束监控');
    this.hooks.clearNotifications(); this.hooks.keepAwake(false);
    this.event('info', this.session.detail, 'session-ended', { endsAt: this.session.endsAt });
    this.stopping = (async () => {
      let disarmFailed = false;
      await this.driver.disarm().catch(() => { disarmFailed = true; });
      await this.preparation?.catch(() => {});
      await this.inFlight?.catch(() => {});
      await this.extending?.catch(() => {});
      await this.driver.disarm().catch(() => { disarmFailed = true; });
      if (disarmFailed) this.event('warning', '浏览器曾断开；恢复连接时将清除残留定位设置。', 'system', { result:'failed' });
    })().finally(() => { this.stopping = null; });
    return this.stopping;
  }
}
