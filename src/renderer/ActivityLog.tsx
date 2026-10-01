import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry, LogEvent } from '../shared/types';

const EVENT_LABELS: Record<LogEvent, string> = {
  system:'运行信息', 'session-started':'开始监控', 'status-changed':'状态变化',
  'attendance-attempted':'尝试签到', 'attendance-confirmed':'签到已确认', 'question-opened':'发现题目', 'question-closed':'题目关闭',
  'answer-attempted':'尝试作答', 'answer-confirmed':'答案已确认', 'session-extended':'延长监控', 'session-ended':'结束监控',
};
const LEVEL_LABELS = { info:'信息', success:'成功', warning:'需要注意', error:'错误' };
const time = (at: number) => new Date(at).toLocaleString('zh-CN', { year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' });

export function ActivityLog({ logs, sessionId, scope, onScopeChange }: { logs: LogEntry[]; sessionId?: string; scope: string; onScopeChange(scope:string):void }) {
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [newCount, setNewCount] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef({ height:0, first:'', filter:'' });
  const sessions = useMemo(() => [...new Map(logs.filter(e => e.sessionId).map(e => [e.sessionId!, { name:e.courseName || '课堂',at:e.at }])).entries()], [logs]);
  const entries = useMemo(() => logs.filter(e => (scope === 'all' || e.sessionId === (scope === 'current' ? sessionId : scope))
    && (level === 'all' || e.level === level) && (!search.trim() || `${e.courseName || ''} ${e.questionTitle || ''} ${e.message}`.toLowerCase().includes(search.trim().toLowerCase()))), [logs,scope,level,search,sessionId]);
  const filter = `${scope}:${level}:${search}:${sessionId}`;
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const added = entries.findIndex(e => e.id === previous.current.first);
    if (previous.current.filter !== filter) { element.scrollTop = 0; setNewCount(0); }
    else if (added > 0 && element.scrollTop > 16) {
      element.scrollTop += element.scrollHeight - previous.current.height;
      setNewCount(count => count + added);
    } else if (added > 0) { element.scrollTop = 0; }
    previous.current = {height:element.scrollHeight,first:entries[0]?.id || '',filter};
  }, [entries,filter]);
  return <section className="panel log-panel">
    <div className="section-heading"><h2>课堂事件记录</h2><span className="small-label">本机保留最近 2000 条事件</span></div>
    <div className="log-filters">
      <label>课堂<select aria-label="课堂" value={scope} onChange={e => onScopeChange(e.target.value)}><option value="all">全部课堂</option>{scope !== 'all' && scope !== 'current' && !sessions.some(([id])=>id===scope) && <option value={scope}>历史课堂（详细日志已清理）</option>}{sessionId && <option value="current">本次课堂</option>}{sessions.map(([id,session]) => <option value={id} key={id}>{session.name} · {time(session.at)}</option>)}</select></label>
      <label>事件级别<select aria-label="事件级别" value={level} onChange={e => setLevel(e.target.value)}><option value="all">全部级别</option>{Object.entries(LEVEL_LABELS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>搜索记录<input type="search" placeholder="课程、题目或信息" value={search} onChange={e => setSearch(e.target.value)}/></label>
    </div>
    <div className="log-heading"><span>{entries.length} 条记录 · 最新事件在前</span>{newCount > 0 && <button className="text-button" onClick={() => { list.current?.scrollTo({top:0}); setNewCount(0); }}>查看 {newCount} 条新事件</button>}</div>
    <div className="log-list" ref={list} onScroll={() => { if ((list.current?.scrollTop || 0) <= 16) setNewCount(0); }}>
      {entries.length ? entries.map(entry => <article className={`log-entry level-${entry.level}`} key={entry.id}>
        <div className="log-entry-top"><strong>{entry.event ? EVENT_LABELS[entry.event] : '历史记录'}</strong><span className="log-level">{LEVEL_LABELS[entry.level]}</span><time dateTime={new Date(entry.at).toISOString()}>{time(entry.at)}</time></div>
        {entry.courseName && <p className="log-course">{entry.courseName}{entry.mode && ` · ${entry.mode === 'auto-a' ? '自动选择 A' : '提醒手动作答'}`}</p>}
        {entry.questionTitle && <h3 className="log-question">{entry.questionTitle}</h3>}
        <p className="log-message">{entry.message}</p>
        {(entry.attemptedAt || entry.confirmedAt || entry.endsAt) && <div className="log-times">{entry.attemptedAt && <span>尝试：{time(entry.attemptedAt)}</span>}{entry.confirmedAt && <span>确认：{time(entry.confirmedAt)}</span>}{entry.endsAt && <span>预计结束：{time(entry.endsAt)}</span>}</div>}
        {entry.questionKey && <details className="log-identifiers"><summary>题目记录标识</summary><code>{entry.questionKey}</code></details>}
      </article>) : <p className="empty-log">没有符合筛选条件的记录。</p>}
    </div>
  </section>;
}
