import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettings, CourseConfig, LogDetails, LogEntry, SessionState, SessionSummary, SetupState } from '../shared/types';
import { initialSetup, restoreSetup } from '../shared/setup';
export const LOG_LIMIT = 2000;
export interface StoredData { version: 1; courses: CourseConfig[]; logs: LogEntry[]; session: SessionState | null; summaries: SessionSummary[]; setup: SetupState; settings: AppSettings; }
export class Store {
  readonly path: string;
  data: StoredData = { version: 1, courses: [], logs: [], session: null, summaries: [], setup: initialSetup(), settings: { browserMode: 'visible' } };
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'state.json');
    if (existsSync(this.path)) {
      try {
        const data = JSON.parse(readFileSync(this.path, 'utf8'));
        if (data.version !== 1 || !Array.isArray(data.courses) || !Array.isArray(data.logs)) throw new Error('Unsupported data');
        this.data = { ...data, settings: { browserMode: data.settings?.browserMode === 'background' ? 'background' : 'visible' }, setup: restoreSetup(data.setup, data.courses.length > 0), logs: data.logs.slice(0, LOG_LIMIT), summaries: Array.isArray(data.summaries) ? data.summaries.slice(0, 100) : [] };
      } catch { throw new Error('本地课程数据无法读取。原文件已保留，请先备份后检查 state.json。'); }
    }
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
