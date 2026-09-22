import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { CourseConfig, LogEntry, SessionState } from '../shared/types';
export interface StoredData { version: 1; courses: CourseConfig[]; logs: LogEntry[]; session: SessionState | null; }
export class Store {
  readonly path: string;
  data: StoredData = { version: 1, courses: [], logs: [], session: null };
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'state.json');
    if (existsSync(this.path)) {
      try {
        const data = JSON.parse(readFileSync(this.path, 'utf8'));
        if (data.version !== 1 || !Array.isArray(data.courses) || !Array.isArray(data.logs)) throw new Error('Unsupported data');
        this.data = data;
      } catch { throw new Error('本地课程数据无法读取。原文件已保留，请先备份后检查 state.json。'); }
    }
  }
  save() {
    const temp = this.path + '.tmp';
    writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(temp, this.path);
  }
  log(level: LogEntry['level'], message: string) {
    this.data.logs.unshift({ id: crypto.randomUUID(), at: Date.now(), level, message });
    this.data.logs = this.data.logs.slice(0, 400);
    this.save();
  }
}
