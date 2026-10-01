import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../../package.json';
import { ACTIVE, sessionPresentation, type AppState, type CourseConfig, type RemoteCourse, type SetupAction, type NotificationChoice } from '../shared/types';
import './styles.css';
import { Icon } from './Icon';
import { CourseForm } from './CourseForm';
import { SessionSummaryPanel, SummaryHistory } from './SessionSummaryPanel';
import { QuestionPanel } from './QuestionPanel';
import { ActivityLog } from './ActivityLog';
import { EnvironmentPanel } from './EnvironmentPanel';
import { SetupWizard } from './SetupWizard';
import { NotificationPanel } from './NotificationPanel';
import { SCHEDULE_RUNTIME_HELP, SCHEDULE_TIMING_HELP } from '../shared/schedule';

function App() {
  const [state, setState] = useState<AppState>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState<Partial<CourseConfig> | null>(null);
  const [imported, setImported] = useState<RemoteCourse[]>([]);
  const [view, setView] = useState<'courses' | 'settings' | 'logs' | 'setup'>('courses');
  const settings = view === 'settings';
  const logsOpen = view === 'logs';
  const [logScope, setLogScope] = useState('all');
  const [deleting, setDeleting] = useState<string>();
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  useEffect(() => {
    window.attendance.getState().then(state => { setState(state); if (state.setup && !state.setup.completedAt && !state.setup.dismissed) setView('setup'); }).catch(e => setError(String(e)));
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
  const setupAction = (choice: SetupAction) => action('setup', async () => { const updated = await window.attendance.setupAction(choice); setState(updated); if (choice === 'finish' || choice === 'dismiss') setView('courses'); else if (choice === 'reopen') setView('setup'); });
  const notificationChoice = (choice: NotificationChoice) => action('notification-choice', async () => { setState(await window.attendance.notificationChoice(choice)); });
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
        <div className="connection"><span className={`dot ${state.browserConnected ? 'green' : ''}`}/>{state.browserTransitioning ? '正在切换运行方式' : state.browserConnected ? state.browserMode === 'background' ? '后台 Chrome 已连接' : 'Chrome 已连接' : '等待连接 Chrome'}</div>
        <p>会话与课程保存在这台电脑。</p>
        <span className="local-label">{state.demo ? '模拟课堂模式' : 'LOCAL WORKSPACE'} <span>↗</span></span>
      </div>
    </aside>
    <main>
      <header className="page-header"><div><div className="eyebrow">YOUR CLASSROOM, WITHIN REACH</div><h1>{view === 'setup' ? '首次配置' : settings ? '连接与提醒' : logsOpen ? '课堂记录' : '我的课程'}</h1><p>{settings ? '准备好浏览器和通知，就可以开始上课。' : logsOpen ? '查看题目、签到和连接变化的完整过程。' : '课堂窗口随时可见，提醒在需要时到来。'}</p></div><div className="header-actions">{view !== 'setup' && <button className="secondary" onClick={() => action('login', () => window.attendance.login())} disabled={!!busy}><Icon name="browser"/>{busy === 'login' ? '正在连接…' : '登录 iClicker'}</button>}{view === 'courses' && <button className="primary" onClick={() => { setImported([]); setForm({}); }}><Icon name="plus"/>添加课程</button>}</div></header>
      {state.demo && <div className="demo-banner">模拟课堂 · 操作仅作用于本机演示页面，不会提交真实签到或答案。</div>}
      {error && <div className="banner error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
      {toast && <div className="banner success" role="status">{toast}</div>}
      {view === 'courses' && state.setup?.completedAt && state.setup.notification?.status !== 'confirmed' && <div className="banner" role="status">提醒尚未确认。<button className="text-button" onClick={() => setView('settings')}>继续测试提醒</button></div>}
      {state.notificationError && <div className="banner error" role="alert">{state.notificationError}</div>}
      {view !== 'setup' && state.setup && !state.setup.completedAt && <div className="banner">首次配置尚未完成。<button className="text-button" disabled={!!busy} onClick={() => setupAction('reopen')}>继续首次配置</button></div>}
      {view === 'setup' ? <SetupWizard state={state} busy={busy} onAction={setupAction} onCheck={() => action('environment', () => window.attendance.checkEnvironment())} onHelp={target => action('help', () => window.attendance.openHelp(target))} onLogin={() => action('login', () => window.attendance.login())} onCheckLogin={() => action('login-check', () => window.attendance.checkLogin())} onReadCourses={() => action('setup-import', async () => { const report = await window.attendance.checkCourseImport(); setImported(report.courses); })} onImport={() => { setImported(state.courseImport?.courses || []); setForm({}); }} onManual={() => { setImported([]); setForm({}); }} onTest={() => action('notification', () => window.attendance.testNotification())} onNotificationChoice={notificationChoice} onStart={id => action('first-course', async () => { setState(await window.attendance.setupAction('finish')); setView('courses'); await window.attendance.start(id); })}/> : settings ? <section className="settings-grid">
        <article className="panel setting-card wide"><h2>首次配置向导</h2><p>重新检查环境、登录、课程和提醒。已保存的课程会保留。</p><button className="secondary" disabled={!!busy} onClick={() => setupAction('reopen')}>重新打开配置向导</button></article>
        <EnvironmentPanel report={state.environment} busy={busy==='environment'} onCheck={()=>action('environment',()=>window.attendance.checkEnvironment())} onHelp={target=>action('help',()=>window.attendance.openHelp(target))}/>
        <article className="panel setting-card wide"><h2>上课运行方式</h2><p>选择下一次上课如何运行。默认显示课堂窗口；后台模式会隐藏 Chrome 窗口，App 和托盘继续显示监控状态。</p><div className="header-actions"><button className="secondary" aria-pressed={(state.settings?.browserMode || 'visible') === 'visible'} disabled={!!busy} onClick={() => action('browser-mode', async () => { setState(await window.attendance.saveSettings({browserMode:'visible'})); setToast('已保存，下次上课显示课堂窗口'); })}>显示课堂窗口</button><button className="secondary" aria-pressed={state.settings?.browserMode === 'background'} disabled={!!busy} onClick={() => action('browser-mode', async () => { setState(await window.attendance.saveSettings({browserMode:'background'})); setToast('已保存，下次上课使用后台模式'); })}>后台模式（无 Chrome 窗口）</button></div><p className="hint">更改从下次上课生效。本节点击“查看课堂”会打开可操作窗口；处理后点击“返回后台”；未确认的题目会保留窗口，未提交草稿不会自动搬到后台。登录和学校验证需要在窗口中完成。关闭 App 主界面后，可从菜单栏或系统托盘查看状态、恢复课堂和结束监控。</p></article>
        <article className="panel setting-card"><div className="tile-icon"><Icon name="browser" size={26}/></div><h2>专用 Chrome 窗口</h2><p>首次登录时完成学校验证。后续会保留登录状态，你可以随时查看或手动操作课堂页面。</p><button className="primary" disabled={!!busy} onClick={() => action('login', () => window.attendance.login())}>打开登录窗口<Icon name="arrow" size={17}/></button><div className="hint">切换应用、遮挡或最小化窗口，都不影响监控。</div></article>
        <article className="panel setting-card"><div className="tile-icon amber"><Icon name="bell" size={26}/></div><h2>系统题目提醒</h2><NotificationPanel check={state.setup?.notification} canConfirm={state.notificationCanConfirm} busy={!!busy} onTest={() => action('notification', () => window.attendance.testNotification())} onChoice={notificationChoice} onHelp={() => action('help', () => window.attendance.openHelp('notifications'))}/></article>
        <article className="panel setting-card wide"><h2>运行方式</h2><div className="settings-row"><span>页面检查</span><strong>每 5 秒一次</strong></div><div className="settings-row"><span>上课期间</span><strong>阻止闲置睡眠，允许屏幕熄灭</strong></div><div className="settings-row"><span>关闭 App 窗口</span><strong>继续在菜单栏或系统托盘运行</strong></div><div className="settings-row"><span>关闭课堂窗口</span><strong>暂停操作，倒计时继续</strong></div><p className="hint">合盖或手动睡眠时无法检查题目。唤醒后，监控会在剩余课程时间内恢复。</p></article>
        <article className="panel setting-card wide" aria-label="定时开启的运行条件"><h2>定时开启的运行条件</h2><p>{SCHEDULE_RUNTIME_HELP}</p><p>{SCHEDULE_TIMING_HELP}</p><p className="hint">计划固定使用保存的城市时区，旅行后不会随电脑时区自动改时。夏令时跳过的时刻会提示；重复出现的时刻只执行第一次。第一版不提供开机启动，请提前打开 App 并保持电脑清醒。</p><p className="hint">定时配置和自动调度正在分步开发，目前请手动开始上课。</p></article>
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
          <p className="browser-mode" role="status">{state.browserTransitioning ? '正在切换运行方式…' : running ? state.browserMode === 'background' ? '后台模式 · 无 Chrome 窗口' : '课堂窗口模式' : `下次上课：${state.settings?.browserMode === 'background' ? '后台模式' : '显示课堂窗口'}`}</p>
          <p className="session-subtitle">{running ? '本次课堂监控' : idleDetail || '选择一门课程开始今天的课堂'}</p>
          {running && <p className="session-message" role="status">{session.detail}</p>}
          {session?.status === 'interrupted' && <><p className="session-message" role="status">{session.detail} 原定结束：{new Date(session.endsAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</p><button className="primary full" disabled={!!busy} onClick={() => action('resume', () => window.attendance.resumeInterrupted())}>恢复上次课堂</button></>}
          <button className="secondary full" disabled={!!busy} onClick={() => action('show', () => window.attendance.showClassroom())}><Icon name="browser" size={18}/>{busy === 'show' ? '正在连接…' : presentation.action}<Icon name="arrow" size={17}/></button>
          {running && <div className="session-controls">{state.browserMode !== 'background' && <button className="text-button" disabled={!!busy} onClick={() => action('background', () => window.attendance.returnToBackground())} title="确认网站收到答案后关闭课堂窗口，继续本节监控">{busy === 'background' ? '正在返回…' : '返回后台'}</button>}<button className="stop-button" disabled={busy === 'stop'} onClick={() => action('stop', () => window.attendance.stop())}>结束上课</button></div>}
          {running && <div className="end-time"><span>预计结束</span><strong>{new Date(session.endsAt).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</strong><button className="secondary full" disabled={!!busy} onClick={() => action('extend', () => window.attendance.extend())}>{busy === 'extend' ? '正在延长…' : '本次延长 10 分钟'}</button><p>等待开课和恢复期间仍按此时间结束。</p></div>}
          <div className="timer" style={{ '--progress': `${progress}%` } as React.CSSProperties}><div><strong>{running ? `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}` : '--:--'}</strong><span>{running ? '监控剩余时间' : '等待开始上课'}</span></div></div>
          {running && state.browserMode !== 'background' && <button className="text-button" disabled={!!busy} onClick={() => action('minimize', () => window.attendance.minimizeClassroom())}>最小化课堂</button>}
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
