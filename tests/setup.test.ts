import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceSetup, initialSetup, restoreSetup } from '../src/shared/setup';
import { SETUP_STEPS } from '../src/shared/types';
import { Store } from '../src/main/store';

const facts = { environment: true, login: true, courses: 1 };
describe('first-run progress', () => {
  it('restores each interrupted step, leaves completed users on their courses and preserves progress when dismissed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'attendance-setup-'));
    try {
      let store = new Store(directory);
      for (const step of SETUP_STEPS) {
        expect(store.data.setup.step).toBe(step);
        store.save(); store = new Store(directory);
        expect(store.data.setup.step).toBe(step);
        const dismissed = advanceSetup(store.data.setup, 'dismiss', facts);
        expect(advanceSetup(dismissed, 'reopen', facts).step).toBe(step);
        if (step !== 'complete') store.data.setup = advanceSetup(store.data.setup, 'next', facts);
      }
      store.data.setup = advanceSetup(store.data.setup, 'finish', facts); store.save();
      expect(new Store(directory).data.setup.completedAt).toBeGreaterThan(0);
      expect(advanceSetup(store.data.setup, 'reopen', facts).step).toBe('environment');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('migrates existing courses without forcing first-run setup, while an empty legacy account starts setup', () => {
    expect(restoreSetup(undefined, true).completedAt).toBeGreaterThan(0);
    expect(restoreSetup(undefined, false).step).toBe('environment');
    expect(restoreSetup({step:'invalid'},false)).toEqual(initialSetup());
    const directory = mkdtempSync(join(tmpdir(), 'attendance-setup-legacy-'));
    try {
      writeFileSync(join(directory,'state.json'),JSON.stringify({version:1,courses:[{id:'legacy'}],logs:[],session:null}));
      expect(new Store(directory).data.setup.dismissed).toBe(true);
    } finally { rmSync(directory,{recursive:true,force:true}); }
  });
  it('rejects skipped environment, unverified login, missing courses and premature completion', () => {
    expect(() => advanceSetup(initialSetup(), 'next', {...facts,environment:false})).toThrow('检查环境');
    const login = advanceSetup(initialSetup(), 'next', facts);
    expect(() => advanceSetup(login, 'next', {...facts,login:false})).toThrow('登录尚未确认');
    const course = advanceSetup(login, 'next', facts);
    expect(() => advanceSetup(course, 'next', {...facts,courses:0})).toThrow('保存至少');
    expect(() => advanceSetup(course,'finish',facts)).toThrow('当前配置');
    const complete={...course,step:'complete' as const};
    expect(() => advanceSetup(complete,'finish',{...facts,login:false})).toThrow('登录尚未确认');
    expect(advanceSetup(course,'back',facts).step).toBe('login');
  });
});
