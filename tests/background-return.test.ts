import { describe, it, expect } from 'vitest';
import { backgroundReturnIssue } from '../src/shared/background-return';
import type { PageSnapshot, QuestionSnapshot } from '../src/shared/types';

const page: PageSnapshot = { state: 'classroom', courseId: 'demo', attendance: 'confirmed' };
const question: QuestionSnapshot = { key: 'q', title: 'Synthetic question', stable: true, kind: 'other', open: true, selected: false, answered: false, hasA: false };
describe('returning to background safely', () => {
  it('requires a known current classroom after login and verification', () => {
    for (const state of ['login', 'offline', 'unknown'] as const) expect(backgroundReturnIssue({ ...page, state }, 'demo')).toBeTruthy();
    expect(backgroundReturnIssue({ ...page, courseId: undefined }, 'demo')).toBeTruthy();
    expect(backgroundReturnIssue(page, 'other')).toBeTruthy();
    expect(backgroundReturnIssue(page, 'demo')).toBeUndefined();
    expect(backgroundReturnIssue({ ...page, state: 'waiting' }, 'demo')).toBeUndefined();
    expect(backgroundReturnIssue({ ...page, detail: '页面有弹窗' }, 'demo')).toMatch(/处理后/);
  });
  it('protects drafts and selected answers until the website confirms receipt', () => {
    expect(backgroundReturnIssue({ ...page, question }, 'demo')).toMatch(/尚未收到答案确认/);
    expect(backgroundReturnIssue({ ...page, question: { ...question, selected: true } }, 'demo')).toBeTruthy();
    expect(backgroundReturnIssue({ ...page, question: { ...question, answered: true } }, 'demo')).toBeUndefined();
    expect(backgroundReturnIssue({ ...page, question: { ...question, open: false } }, 'demo')).toBeUndefined();
  });
});
