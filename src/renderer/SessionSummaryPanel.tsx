import React, { useState } from 'react';
import type { SessionSummary } from '../shared/types';

const time = (at:number) => new Date(at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const reasons = { manual:'已手动结束',expired:'已到期结束',interrupted:'上次监控中断' };
export function SessionSummaryPanel({ summary, onViewLogs, onOpen }: { summary:SessionSummary; onViewLogs(id:string):void; onOpen():void }) {
  return <section className="panel summary-panel" aria-label="结束摘要">
    <div className="section-heading"><h2>结束摘要</h2><span className="small-label">{reasons[summary.reason]}</span></div>
    <h3>{summary.courseName}</h3><p className="summary-time">{time(summary.startedAt)} → {time(summary.endedAt)}</p>
    <dl><div><dt>签到</dt><dd>{summary.attendance === 'confirmed' ? '已确认签到' : '尚未确认签到'}</dd></div>{summary.attendanceConfirmedAt && <div><dt>签到确认时间</dt><dd>{time(summary.attendanceConfirmedAt)}</dd></div>}<div><dt>已观察题目</dt><dd>{summary.observedQuestionCount}</dd></div><div><dt>答案已确认</dt><dd>{summary.confirmedAnswerCount}</dd></div><div><dt>尝试尚未确认</dt><dd>{summary.pendingAttemptCount}</dd></div><div><dt>未观察到答案确认</dt><dd>{summary.unconfirmedQuestionCount}</dd></div></dl>
    <p className="summary-note">{summary.reason === 'interrupted' ? '中断时的结束时间为最后一次记录时间。' : ''}{summary.hadInterruptions ? '监控曾中断，期间可能有题目未被记录。' : '统计基于本机观察到的题目和网站回执。'}</p>
    <div className="summary-actions"><button className="secondary" onClick={() => onViewLogs(summary.id)}>本节日志</button><button className="text-button" onClick={onOpen}>查看课堂</button></div>
  </section>;
}
export function SummaryHistory({ summaries, onViewLogs, onOpen }: { summaries:SessionSummary[]; onViewLogs(id:string):void; onOpen():void }) {
  const [id,setId] = useState('');
  const selected = summaries.find(summary => summary.id === id) || summaries[0];
  if (!selected) return null;
  return <div className="summary-history"><label>课堂历史（最近 100 节）<select aria-label="课堂历史" value={selected.id} onChange={e=>setId(e.target.value)}>{summaries.map(summary=><option key={summary.id} value={summary.id}>{summary.courseName} · {time(summary.startedAt)}</option>)}</select></label><SessionSummaryPanel summary={selected} onViewLogs={onViewLogs} onOpen={onOpen}/></div>;
}
