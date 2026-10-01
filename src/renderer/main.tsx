import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../../package.json';
import { ACTIVE, sessionPresentation, type AppState, type CourseConfig, type RemoteCourse } from '../shared/types';
import './styles.css';
import { Icon } from './Icon';
import { CourseForm } from './CourseForm';
import { SessionSummaryPanel, SummaryHistory } from './SessionSummaryPanel';
import { QuestionPanel } from './QuestionPanel';
import { ActivityLog } from './ActivityLog';
import { EnvironmentPanel } from './EnvironmentPanel';

function App() {
  const [state, setState] = useState<AppState>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState<Partial<CourseConfig> | null>(null);
  const [imported, setImported] = useState<RemoteCourse[]>([]);
  const [view, setView] = useState<'courses' | 'settings' | 'logs'>('courses');
  const settings = view === 'settings';
  const logsOpen = view === 'logs';
  const [logScope, setLogScope] = useState('all');
  const [deleting, setDeleting] = useState<string>();
  useEffect(() => {
    window.attendance.getState().then(setState).catch(e => setError(String(e)));
    const unsubscribe = window.attendance.onState(setState);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, []);
  const action = async (name: string, callback: () => Promise<unknown>) => {
    setBusy(name); setError(''); setToast('');
    try { await callback(); } catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { setBusy(''); }
  };
  if (!state) return <div className="loading">正在准备课堂助手…{error && <p>{error}</p>}</div>;
  const session = state.session;
  const idleDetail = session?.detail;
  const latestSummary = session?.summary || state.summaries?.[0];
  const viewSessionLogs = (id:string) => { setLogScope(id); setView('logs'); };
  const running = ACTIVE(session);
  const presentation = sessionPresentation(session);
  const remaining = running ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 0;
  const progress = running ? Math.min(100, Math.max(0, 100 * (now - session.startedAt) / (session.endsAt - session.startedAt))) : 0;
  const importCourses = () => action('import', async () => {
    const courses = await window.attendance.importCourses(); setImported(courses); setForm({});
  });
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">a<span>h</span></div><div>Attendance<span>课堂助手</span></div></div>
      <div className="nav-label">工作空间</div>
      <button className={`nav-item ${view === 'courses' ? 'selected' : ''}`} onClick={() => setView('courses')}><Icon name="book"/>我的课程<span className="count">{state.courses.length}</span></button>
      <button className={`nav-item ${settings ? 'selected' : ''}`} onClick={() => setView('settings')}><Icon name="settings"/>连接与提醒</button>
      <button className={`nav-item ${logsOpen ? 'selected' : ''}`} onClick={() => setView('logs')}><Icon name="clock"/>课堂记录</button>
      <div className="sidebar-bottom">
        <div className="connection"><span className={`dot ${state.browserConnected ? 'green' : ''}`}/>{state.browserConnected ? 'Chrome 已连接' : '等待连接 Chrome'}</div>
        <p>会话与课程保存在这台电脑。</p>
        <span className="local-label">{state.demo ? '模拟课堂模式' : 'LOCAL WORKSPACE'} <span>↗</span></span>
      </div>
    </aside>
    <main>
      <header className="page-header"><div><div className="eyebrow">YOUR CLASSROOM, WITHIN REACH</div><h1>{settings ? '连接与提醒' : logsOpen ? '课堂记录' : '我的课程'}</h1><p>{settings ? '准备好浏览器和通知，就可以开始上课。' : logsOpen ? '查看题目、签到和连接变化的完整过程。' : '课堂窗口随时可见，提醒在需要时到来。'}</p></div><div className="header-actions"><button className="secondary" onClick={() => action('login', () => window.attendance.login())} disabled={!!busy}><Icon name="browser"/>{busy === 'login' ? '正在连接…' : '登录 iClicker'}</button>{!settings && !logsOpen && <button className="primary" onClick={() => { setImported([]); setForm({}); }}><Icon name="plus"/>添加课程</button>}</div></header>
      {state.demo && <div className="demo-banner">模拟课堂 · 操作仅作用于本机演示页面，不会提交真实签到或答案。</div>}
      {error && <div className="banner error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
      {toast && <div className="banner success" role="status">{toast}</div>}
      {state.notificationError && <div className="banner error" role="alert">{state.notificationError}</div>}
      {settings ? <section className="settings-grid">
        <EnvironmentPanel report={state.environment} busy={busy==='environment'} onCheck={()=>action('environment',()=>window.attendance.checkEnvironment())} onHelp={target=>action('help',()=>window.attendance.openHelp(target))}/>
        <article className="panel setting-card"><div className="tile-icon"><Icon name="browser" size={26}/></div><h2>专用 Chrome 窗口</h2><p>首次登录时完成学校验证。后续会保留登录状态，你可以随时查看或手动操作课堂页面。</p><button className="primary" disabled={!!busy} onClick={() => action('login', () => window.attendance.login())}>打开登录窗口<Icon name="arrow" size={17}/></button><div className="hint">切换应用、遮挡或最小化窗口，都不影响监控。</div></article>
        <article className="panel setting-card"><div className="tile-icon amber"><Icon name="bell" size={26}/></div><h2>系统题目提醒</h2><p>需要手动答题时立即提醒。题目未作答且仍开放时，每 30 秒再次提醒；点击通知返回课堂。</p><button className="secondary" onClick={() => action('notification', async () => { await window.attendance.testNotification(); setToast('已请求发送测试通知，请在系统通知中确认。'); })}>发送测试通知<Icon name="arrow" size={17}/></button><div className="hint">请在 系统通知设置中允许 Attendance Handler 通知和声音。</div></article>
        <article className="panel setting-card wide"><h2>运行方式</h2><div className="settings-row"><span>页面检查</span><strong>每 5 秒一次</strong></div><div className="settings-row"><span>上课期间</span><strong>阻止闲置睡眠，允许屏幕熄灭</strong></div><div className="settings-row"><span>关闭 App 窗口</span><strong>继续在菜单栏或系统托盘运行</strong></div><div className="settings-row"><span>关闭课堂窗口</span><strong>暂停操作，倒计时继续</strong></div><p className="hint">合盖或手动睡眠时无法检查题目。唤醒后，监控会在剩余课程时间内恢复。</p></article>
      </section> : logsOpen ? <><SummaryHistory summaries={state.summaries || []} onViewLogs={viewSessionLogs} onOpen={() => action('show', () => window.attendance.showClassroom())}/><ActivityLog logs={state.logs} sessionId={session?.id} scope={logScope} onScopeChange={setLogScope}/></> : <div className="content-grid">
        <section className="courses-section"><div className="section-heading"><h2>课程列表 <span>{state.courses.length.toString().padStart(2, '0')}</span></h2><button className="text-button" disabled={!!busy || running} onClick={importCourses}>{busy === 'import' ? '正在读取…' : '从 iClicker 导入'} <span>↗</span></button></div>
          {state.courses.length ? <div className="course-list">{state.courses.map((course, i) => <article className={`course-card ${running && session.course.id === course.id ? 'active' : ''}`} key={course.id}>
            <div className="course-top"><div className={`course-symbol color-${i % 3}`}><Icon name="book" size={23}/></div><button className="edit-button" aria-label={`编辑 ${course.name}`} onClick={() => { setImported([]); setForm(course); }} disabled={running && session.course.id === course.id}>编辑</button></div>
            <h3>{course.name}</h3><div className={`mode-badge ${course.mode === 'notify' ? 'amber' : ''}`}>{course.mode === 'auto-a' ? <span className="letter-a">A</span> : <Icon name="bell" size={13}/>} {course.mode === 'auto-a' ? '自动选择 A' : '提醒手动作答'}</div>
            <div className="course-meta"><span><Icon name="clock" size={15}/>{course.durationMinutes} 分钟</span><span title="坐标仅在编辑课程时显示"><Icon name="pin" size={15}/>{course.locationName || '位置已设置'}</span></div>
            <div className="course-footer"><button className={`start-button ${running && session.course.id === course.id ? 'in-session' : ''}`} disabled={running || !!busy} onClick={() => action('start', () => window.attendance.start(course.id))}>{running && session.course.id === course.id ? <><span className={`dot ${presentation.tone}`}/>{presentation.label}</> : <><Icon name="play" size={16}/>开始上课</>}</button>{deleting === course.id ? <button className="delete-confirm" onClick={() => action('delete', async () => { setState(await window.attendance.deleteCourse(course.id)); setDeleting(undefined); })}>确认删除</button> : <button className="delete-button" aria-label={`删除 ${course.name}`} disabled={running && session.course.id === course.id} onClick={() => setDeleting(course.id)}>删除</button>}</div>
          </article>)}</div> : <div className="empty-courses"><div className="empty-art"><Icon name="book" size={48}/></div><h3>把第一门课放进来</h3><p>登录 iClicker 后导入课程，<br/>设置位置、时长和答题方式。</p><button className="primary" onClick={importCourses} disabled={!!busy}>导入我的课程<Icon name="arrow" size={16}/></button><button className="text-button" onClick={() => setForm({})}>或手动添加课程</button></div>}
          <div className="quiet-note"><Icon name="check" size={17}/><p>监控只作用于你开始的那门课。你可以随时查看课堂或结束监控。</p></div>
        </section>
        <aside className="session-column"><section className={`panel session-panel status-${presentation.tone}`}>
          <div className="panel-label"><span className={`dot ${presentation.tone}`}/>{presentation.label}</div>
          <h2>{session ? session.course.name : '准备好，再开始'}</h2>
          <p className="session-subtitle">{running ? '本次课堂监控' : idleDetail || '选择一门课程开始今天的课堂'}</p>
          {running && <p className="session-message" role="status">{session.detail}</p>}
          <button className="secondary full" disabled={!!busy} onClick={() => action('show', () => window.attendance.showClassroom())}><Icon name="browser" size={18}/>{busy === 'show' ? '正在连接…' : presentation.action}<Icon name="arrow" size={17}/></button>
          {running && <div className="session-controls"><button className="text-button" disabled={!!busy} onClick={() => action('minimize', () => window.attendance.minimizeClassroom())}>最小化课堂</button><button className="stop-button" disabled={busy === 'stop'} onClick={() => action('stop', () => window.attendance.stop())}>结束上课</button></div>}
          {running && <div className="end-time"><span>预计结束</span><strong>{new Date(session.endsAt).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</strong><button className="secondary full" disabled={!!busy} onClick={() => action('extend', () => window.attendance.extend())}>{busy === 'extend' ? '正在延长…' : '本次延长 10 分钟'}</button><p>等待开课和恢复期间仍按此时间结束。</p></div>}
          <div className="timer" style={{ '--progress': `${progress}%` } as React.CSSProperties}><div><strong>{running ? `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}` : '--:--'}</strong><span>{running ? '监控剩余时间' : '等待开始上课'}</span></div></div>
          {running && <QuestionPanel session={session} busy={!!busy} onOpen={() => action('show', () => window.attendance.showClassroom())}/>}
          <div className="session-details"><div><span>本节签到</span><strong className={session?.attendance === 'confirmed' ? 'green-text' : ''}>{session?.attendance === 'confirmed' ? '已确认签到' : session?.attendance === 'pending' ? '等待确认' : '尚未确认'}</strong></div>
          {session?.attendanceConfirmedAt && <div><span>签到确认时间</span><strong>{new Date(session.attendanceConfirmedAt).toLocaleTimeString('zh-CN')}</strong></div>}
          <div><span>最后成功检查</span><strong>{session?.lastSuccessfulCheckAt ? `${Math.max(0, Math.floor((now - session.lastSuccessfulCheckAt) / 1000))} 秒前` : '尚未成功检查'}</strong></div></div>
        </section>
          {!running && latestSummary && <SessionSummaryPanel summary={latestSummary} onViewLogs={viewSessionLogs} onOpen={() => action('show', () => window.attendance.showClassroom())}/>}
          <section className="panel activity-panel"><div className="section-heading"><h2>最近动态</h2><button className="text-button" onClick={() => setView('logs')}>全部记录 ↗</button></div>{state.logs.length ? <ol>{state.logs.slice(0, 5).map(entry => <li key={entry.id}><span className={`event-dot ${entry.level}`}/><div><p>{entry.message}</p><time>{new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div></li>)}</ol> : <p className="empty-log">签到、题目与连接状态会记录在这里。</p>}</section>
        </aside>
      </div>}
      <footer className="page-footer"><span>ATTENDANCE HANDLER</span><span>保持窗口可见，保持课堂连接。</span><span>v{version}</span></footer>
    </main>
    {form !== null && <CourseForm initial={form} imported={imported} courses={state.courses} origin={state.classroomOrigin} onClose={() => setForm(null)} onSave={async course => { const updated = await window.attendance.saveCourse(course); setState(updated); setForm(null); setToast('课程已保存'); }} onImport={async () => { const courses = await window.attendance.importCourses(); setImported(courses); }}/>
    }
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
