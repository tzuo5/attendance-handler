import React from 'react';
import type { SessionState } from '../shared/types';

export function QuestionPanel({ session, busy, onOpen }: { session: SessionState; busy: boolean; onOpen(): void }) {
  const current = session.question;
  const record = current ? session.questions?.[current.key] : Object.values(session.questions || {}).sort((a,b) => b.lastSeenAt-a.lastSeenAt)[0];
  if (!current && !record) return <div className="question-panel empty"><p>等待新题目。发现题目后会显示作答与确认状态。</p></div>;
  const key = current?.key || record?.key || '';
  const confirmed = !!record?.confirmedAt || !!current?.answered || session.handled[key] === 'confirmed';
  const attempted = !!record?.attemptedAt || session.handled[key] === 'attempted';
  const closed = current ? !current.open : !!record?.closedAt;
  const interrupted = ['offline','needs-login','window-closed','attention'].includes(session.status);
  const label = confirmed ? '答案已确认收到' : closed ? attempted ? '题目已关闭，尝试尚未确认' : '题目已关闭，未观察到答案确认'
    : attempted ? '已尝试，等待确认' : current?.selected ? '页面已有选择，尚未确认' : current ? '待作答' : '尚未观察到答案确认';
  const time = (at: number) => new Date(at).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return <section className={`question-panel ${confirmed ? 'confirmed' : 'pending'}`} aria-label="题目反馈">
    <div className="question-caption">{current ? '当前题目' : interrupted ? '历史题目 · 恢复后核实当前课堂' : '最近题目'} · {(current?.kind || record?.kind) === 'single' ? '单选题' : '需手动处理的题型'}</div>
    <h3>{current?.title || record?.title}</h3>
    <strong className="question-result" role="status">{label}</strong>
    <div className="question-times">{record?.firstSeenAt && <span>发现 {time(record.firstSeenAt)}</span>}{record?.attemptedAt && <span>尝试 {time(record.attemptedAt)}</span>}{record?.confirmedAt && <span>确认 {time(record.confirmedAt)}</span>}</div>
    {current?.open && !confirmed && <button className="primary full" disabled={busy} onClick={onOpen}>{attempted || current.selected ? '查看提交结果' : '前往作答'}</button>}
  </section>;
}
