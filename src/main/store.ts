import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings, CourseConfig, LogDetails, LogEntry, SessionState, SessionSummary, SetupState } from '../shared/types';
import { initialSetup, restoreSetup } from '../shared/setup';
import { validateSchedule, type ScheduleConfig } from '../shared/schedule';
export const LOG_LIMIT = 2000;
export interface StoredData { version: 1; courses: CourseConfig[]; schedules: ScheduleConfig[]; logs: LogEntry[]; session: SessionState | null; summaries: SessionSummary[]; setup: SetupState; settings: AppSettings; }
export class Store {
  readonly path: string;
  data: StoredData = { version: 1, courses: [], schedules: [], logs: [], session: null, summaries: [], setup: initialSetup(), settings: { browserMode: 'visible' } };
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'state.json');
    if (existsSync(this.path)) {
      try {
        const data = JSON.parse(readFileSync(this.path, 'utf8'));
        if (data.version !== 1 || !Array.isArray(data.courses) || !Array.isArray(data.logs)) throw new Error('Unsupported data');
        const schedules = data.schedules === undefined ? [] : data.schedules;
        if (!Array.isArray(schedules) || schedules.length > 100) throw new Error('Invalid schedules');
        const restored = schedules.map(item => validateSchedule(item, data.courses.map((course: CourseConfig) => course.id)));
        if (new Set(restored.map(item => item.id)).size !== restored.length) throw new Error('Duplicate schedules');
        this.data = { ...data, schedules: restored, settings: { browserMode: data.settings?.browserMode === 'background' ? 'background' : 'visible' }, setup: restoreSetup(data.setup, data.courses.length > 0), logs: data.logs.slice(0, LOG_LIMIT), summaries: Array.isArray(data.summaries) ? data.summaries.slice(0, 100) : [] };
      } catch { throw new Error('本地课程数据无法读取。原文件已保留，请先备份后检查 state.json。'); }
    }
  }
  saveSchedule(input: unknown, now = Date.now()) {
    const schedule = validateSchedule(input, this.data.courses.map(course => course.id));
    schedule.effectiveFrom = now;
    if (!this.data.schedules.some(item => item.id === schedule.id) && this.data.schedules.length >= 100) throw new Error('最多保存 100 个定时任务，请先取消不再需要的任务。');
    this.updateSchedules([...this.data.schedules.filter(item => item.id !== schedule.id), schedule]);
  }
  setScheduleEnabled(id: string, enabled: boolean, now = Date.now()) {
    const schedule = this.data.schedules.find(item => item.id === id);
    if (!schedule) throw new Error('任务已不存在，请刷新后重试。');
    if (schedule.enabled === enabled) return;
    this.updateSchedules(this.data.schedules.map(item => item.id === id ? { ...item, enabled, effectiveFrom: enabled ? now : item.effectiveFrom } : item));
  }
  deleteSchedule(id: string) { this.updateSchedules(this.data.schedules.filter(item => item.id !== id)); }
  deleteCourse(id: string) {
    const courses = this.data.courses;
    this.data.courses = courses.filter(course => course.id !== id);
    try { this.updateSchedules(this.data.schedules.filter(item => item.courseId !== id)); }
    catch (error) { this.data.courses = courses; throw error; }
  }
  private updateSchedules(schedules: ScheduleConfig[]) {
    const previous = this.data.schedules;
    this.data.schedules = schedules;
    try { this.save(); } catch (error) { this.data.schedules = previous; throw error; }
  }
  setSession(session: SessionState) {
    this.data.session = session;
    if (session.summary) this.data.summaries = [session.summary, ...this.data.summaries.filter(summary => summary.id !== session.id)].slice(0, 100);
    this.save();
  }
  save() {
    const temp = this.path + '.tmp';
    writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(temp, this.path);
  }
  log(level: LogEntry['level'], message: string, details: LogDetails = {}) {
    this.data.logs.unshift({ ...details, questionTitle: details.questionTitle ? redactLogText(details.questionTitle) : undefined, id: crypto.randomUUID(), at: Date.now(), level, message: redactLogText(message) });
    this.data.logs = this.data.logs.slice(0, LOG_LIMIT);
    this.save();
  }
}

function redactLogText(value: string) {
  return value.replace(/((?:access_token|refresh_token|password|authorization)\s*[=:]\s*)([^\s&,;]+)/gi, '$1[已隐藏]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [已隐藏]');
}
