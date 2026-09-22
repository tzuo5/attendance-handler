import type { Page } from 'playwright-core';
import type { PageSnapshot, QuestionSnapshot, RemoteCourse } from '../shared/types';

type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
export class EvidenceTracker {
  courses = new Map<string, RemoteCourse>();
  attendance = new Map<string, boolean>();
  question?: { key: string; ended: boolean };
  constructor(private origin: string) {}
  resetQuestion() { this.question = undefined; }
  observeFrame(raw: string) {
    try {
      const frame = JSON.parse(raw);
      const data = typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data;
      if (!object(data)) return;
      const id = typeof data.questionId === 'string' ? data.questionId : undefined;
      if (frame.event === 'question' && id) this.question = { key: `${data.meetingId || ''}:${data.activityId || ''}:${id}`, ended: false };
      if (frame.event === 'endQuestion' && this.question && (!id || this.question.key.endsWith(`:${id}`))) this.question.ended = true;
      if (frame.event === 'MEETING_ENDED') this.question = undefined;
    } catch { /* Ignore non-JSON and unrelated events. */ }
  }
  observeResponse(url: string, value: unknown) {
    // Only passive observations of responses the page requested. Never replay private endpoints.
    if (/auth|token|login|logging|log-events|reporting|history|results/i.test(url)) return;
    if (object(value)) {
      if (typeof value.courseId === 'string' && object(value.attendanceStatus) && typeof value.attendanceStatus.userPresent === 'boolean') this.attendance.set(value.courseId, value.attendanceStatus.userPresent);
      const joinedCourse = url.match(/\/course\/attendance\/join\/([^/?]+)/)?.[1];
      if (joinedCourse && ['PRESENT', 'LATE'].includes(String(value.result))) this.attendance.set(joinedCourse, true);
    }
    const walk = (v: unknown, depth: number) => {
      if (depth > 7) return;
      if (Array.isArray(v)) { for (const child of v.slice(0, 200)) walk(child, depth + 1); return; }
      if (!object(v)) return;
      if (typeof v.courseId === 'string' && typeof v.name === 'string' && !v.questionId && !v.activityId && v.archived !== true && v.isArchived !== true) {
        this.courses.set(v.courseId, { remoteId: v.courseId, name: v.name, url: `${this.origin}/#/course/${v.courseId}/overview` });
      }
      if (/status|active/i.test(url) && typeof v.questionId === 'string' && typeof v.activityId === 'string' && v.answerType && !this.question) {
        this.question = { key: `${v.meetingId || ''}:${v.activityId}:${v.questionId}`, ended: v.ended === true || v.isQuestionEnded === true };
      }
      for (const [key, child] of Object.entries(v)) if (!/userQuestions|answers|correct|result|archived/i.test(key)) walk(child, depth + 1);
    };
    walk(value, 0);
  }
}

export class IClickerAdapter {
  readonly evidence: EvidenceTracker;
  private fallbackId = crypto.randomUUID();
  private hadQuestion = false;
  constructor(readonly page: Page, readonly origin: string) {
    this.evidence = new EvidenceTracker(origin);
    page.on('websocket', socket => {
      socket.on('framereceived', event => this.evidence.observeFrame(event.payload.toString()));
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin !== origin && !/(^|\.)iclicker\.com$/.test(url.hostname) && !/(^|\.)reef-education\.com$/.test(url.hostname)) return;
      if (!/json/.test(response.headers()['content-type'] || '')) return;
      if (/auth|token|login/i.test(url.pathname)) return;
      void response.json().then(value => this.evidence.observeResponse(url.href, value)).catch(() => {});
    });
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && !/\/class\//.test(frame.url())) { this.evidence.resetQuestion(); this.hadQuestion = false; }
    });
  }

  async read(): Promise<PageSnapshot> {
    const evidence = this.evidence.question;
    const result = await this.page.evaluate(({ origin, evidence, fallbackId, attendanceEvidence }): PageSnapshot => {
      const visible = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const text = document.body?.innerText || '';
      if (!navigator.onLine || [...document.querySelectorAll('.connection-error')].some(visible)) return { state: 'offline', attendance: 'unknown' };
      const route = `${location.pathname}${location.hash.replace(/^#/, '')}`;
      const courseId = route.match(/\/(?:course|class)\/([^/?#]+)/)?.[1];
      if (location.origin !== origin || /\/login(?:[/?#]|$)/.test(route) || visible(document.querySelector('#sign-in-button'))) return { state: 'login', attendance: 'unknown' };
      const confirmed = /you[’']?re checked in|you are checked in|check.in successful/i.test(text) || visible(document.querySelector('[data-attendance="confirmed"]')) || !!(courseId && attendanceEvidence[courseId]);
      const attendance = confirmed ? 'confirmed' as const : 'unknown' as const;
      if (visible(document.querySelector('.modal.show, .modal-dialog, [role="dialog"]'))) return { state: confirmed ? 'classroom' : 'unknown', courseId, attendance, detail: '页面有弹窗，请查看课堂并处理后继续。' };
      if (/check in failed|check-in failed|out of range|location.*(?:denied|unavailable)/i.test(text)) return { state: 'unknown', courseId, attendance, detail: 'iClicker 签到或定位失败，请检查课堂页面。' };
      const join = document.querySelector<HTMLButtonElement>('#btnJoin');
      if (visible(join) && !join.disabled && join.getAttribute('aria-disabled') !== 'true') return { state: 'joinable', courseId, attendance: 'pending' };
      const single = [...document.querySelectorAll('app-multiple-choice-question')].find(visible);
      const other = [...document.querySelectorAll('app-multiple-answer-question, app-multiple-choice-group-question, app-short-answer-question, app-numeric-question, app-target-question, app-stem-question, [data-question-type]')].find(visible);
      const root = single || other;
      if (root && /\/class\//.test(route)) {
        const status = root.querySelector('#status-text-container-id')?.textContent || '';
        const choices = [...root.querySelectorAll<HTMLButtonElement>('button[id^="multiple-choice-"], button[id^="multiple-answer-"]')];
        const answerA = root.querySelector<HTMLButtonElement>('#multiple-choice-a');
        const anyEnabled = [...root.querySelectorAll<HTMLButtonElement>('button, input, textarea')].some(e => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
        const ended = /polling.*(?:closed|ended)|question.*(?:closed|ended)/i.test(root.textContent || '') || evidence?.ended === true;
        const fixtureKey = root.getAttribute('data-question-id');
        const key = fixtureKey || evidence?.key || fallbackId;
        return { state: 'classroom', courseId, attendance, question: {
          key, stable: !!(fixtureKey || evidence?.key), kind: single && !/\/quiz\//.test(route) ? 'single' : 'other',
          open: !ended && anyEnabled, answered: /answer received|response received|answer submitted/i.test(status),
          selected: choices.some(e => e.getAttribute('aria-pressed') === 'true'),
          hasA: visible(answerA) && !answerA.disabled && answerA.getAttribute('aria-disabled') !== 'true',
          title: root.querySelector('h1,h2,h3,[data-question-title]')?.textContent?.trim().slice(0, 160) || '课堂题目',
        } };
      }
      if (/\/class\//.test(route) && (confirmed || /today[’']s class|waiting|instructor.*(?:start|activity)|poll.*ended/i.test(text))) return { state: 'classroom', courseId, attendance };
      if (/\/course\/[^/]+(?:\/overview)?\/?$/.test(route) && visible(document.querySelector('.course-content-area, [data-course-overview]'))) return { state: 'waiting', courseId, attendance };
      if (confirmed && /\/course\/[^/]+\/class-history/.test(route)) return { state: 'classroom', courseId, attendance };
      if (/\/courses\/?$/.test(route)) return { state: 'waiting', attendance };
      return { state: 'unknown', courseId, attendance, detail: '无法识别当前页面。自动提交已暂停，请检查课堂。' };
    }, { origin: this.origin, evidence, fallbackId: this.fallbackId, attendanceEvidence: Object.fromEntries(this.evidence.attendance) });
    if (!result.question && this.hadQuestion) this.fallbackId = crypto.randomUUID();
    this.hadQuestion = !!result.question;
    return result;
  }

  async courses(): Promise<RemoteCourse[]> {
    const fromDOM = await this.page.evaluate(origin => [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/course/"]')].flatMap(a => {
      const url = new URL(a.href); const id = `${url.pathname}${url.hash}`.match(/\/course\/([A-Za-z0-9_-]+)/)?.[1];
      const name = a.querySelector('.course-title')?.textContent?.trim() || a.textContent?.trim();
      return id && name && url.origin === origin ? [{ remoteId: id, name, url: `${origin}/#/course/${id}/overview` }] : [];
    }), this.origin);
    return [...new Map([...this.evidence.courses.values(), ...fromDOM].map(c => [c.remoteId, c])).values()];
  }

  async clickJoin(deadline: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const snap = await this.read();
    if (snap.state !== 'joinable') return;
    signal.throwIfAborted();
    await this.page.evaluate(until => {
      const button = document.querySelector<HTMLButtonElement>('#btnJoin');
      const gate = (window as unknown as { __attendanceDeadline?: number }).__attendanceDeadline;
      if (!gate || Date.now() >= Math.min(gate, until) || !button || button.disabled) return;
      // DOM click invokes the website handler without activating the OS window.
      button.click();
    }, deadline);
  }

  async selectA(question: QuestionSnapshot, deadline: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const fresh = await this.read();
    if (fresh.question?.key !== question.key || !fresh.question.open || fresh.question.answered || fresh.question.selected || fresh.question.kind !== 'single') return;
    signal.throwIfAborted();
    await this.page.evaluate(({ until, expectedKey }) => {
      const gate = (window as unknown as { __attendanceDeadline?: number }).__attendanceDeadline;
      if (!gate || Date.now() >= Math.min(gate, until)) return;
      const root = document.querySelector('app-multiple-choice-question');
      if (!root || root.getClientRects().length === 0 || /\/quiz\//.test(location.href)) return;
      const key = root.getAttribute('data-question-id');
      if (key && key !== expectedKey) return;
      if (root.querySelector('[aria-pressed="true"]') || /answer received|sending answer/i.test(root.querySelector('#status-text-container-id')?.textContent || '')) return;
      const button = root.querySelector<HTMLButtonElement>('#multiple-choice-a');
      if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') button.click();
      // Current iClicker single-choice polls submit on selection; never click unrelated Submit buttons.
    }, { until: deadline, expectedKey: question.key });
  }
}
