import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../../package.json';
import { ACTIVE, STATUS_LABELS, type AppState, type CourseConfig, type RemoteCourse } from '../shared/types';
import './styles.css';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    book: <><path d="M4 5h6a3 3 0 0 1 3 3v12a4 4 0 0 0-4-2H4z"/><path d="M20 5h-4a3 3 0 0 0-3 3v12a4 4 0 0 1 4-2h3z"/></>,
    play: <path d="m9 5 11 7-11 7z"/>, plus: <path d="M12 5v14M5 12h14"/>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3z"/><path d="M10 21h4"/></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.1M10 6.5h.1"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>, check: <path d="m5 12 4 4 10-10"/>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0"/><circle cx="12" cy="10" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, settings: <><path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.book}</svg>;
}
function App() {
  const [state, setState] = useState<AppState>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState<Partial<CourseConfig> | null>(null);
  const [imported, setImported] = useState<RemoteCourse[]>([]);
  const [settings, setSettings] = useState(false);
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
  const running = ACTIVE(session);
  const remaining = running ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 0;
  const progress = running ? Math.min(100, Math.max(0, 100 * (now - session.startedAt) / (session.endsAt - session.startedAt))) : 0;
  const importCourses = () => action('import', async () => {
    const courses = await window.attendance.importCourses(); setImported(courses); setForm({});
  });
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">a<span>h</span></div><div>Attendance<span>课堂助手</span></div></div>
      <div className="nav-label">工作空间</div>
      <button className={`nav-item ${!settings ? 'selected' : ''}`} onClick={() => setSettings(false)}><Icon name="book"/>我的课程<span className="count">{state.courses.length}</span></button>
      <button className={`nav-item ${settings ? 'selected' : ''}`} onClick={() => setSettings(true)}><Icon name="settings"/>连接与提醒</button>
      <div className="sidebar-bottom">
        <div className="connection"><span className={`dot ${state.browserConnected ? 'green' : ''}`}/>{state.browserConnected ? 'Chrome 已连接' : '等待连接 Chrome'}</div>
        <p>会话与课程保存在这台电脑。</p>
        <span className="local-label">{state.demo ? '模拟课堂模式' : 'LOCAL WORKSPACE'} <span>↗</span></span>
      </div>
    </aside>
    <main>
      <header className="page-header"><div><div className="eyebrow">YOUR CLASSROOM, WITHIN REACH</div><h1>{settings ? '连接与提醒' : '我的课程'}</h1><p>{settings ? '准备好浏览器和通知，就可以开始上课。' : '课堂窗口随时可见，提醒在需要时到来。'}</p></div><div className="header-actions"><button className="secondary" onClick={() => action('login', () => window.attendance.login())} disabled={!!busy}><Icon name="browser"/>{busy === 'login' ? '正在连接…' : '登录 iClicker'}</button>{!settings && <button className="primary" onClick={() => { setImported([]); setForm({}); }}><Icon name="plus"/>添加课程</button>}</div></header>
      {state.demo && <div className="demo-banner">模拟课堂 · 操作仅作用于本机演示页面，不会提交真实签到或答案。</div>}
      {error && <div className="banner error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}
      {toast && <div className="banner success" role="status">{toast}</div>}
      {state.notificationError && <div className="banner error" role="alert">{state.notificationError}</div>}
      {settings ? <section className="settings-grid">
        <article className="panel setting-card"><div className="tile-icon"><Icon name="browser" size={26}/></div><h2>专用 Chrome 窗口</h2><p>首次登录时完成学校验证。后续会保留登录状态，你可以随时查看或手动操作课堂页面。</p><button className="primary" disabled={!!busy} onClick={() => action('login', () => window.attendance.login())}>打开登录窗口<Icon name="arrow" size={17}/></button><div className="hint">切换应用、遮挡或最小化窗口，都不影响监控。</div></article>
        <article className="panel setting-card"><div className="tile-icon amber"><Icon name="bell" size={26}/></div><h2>系统题目提醒</h2><p>需要手动答题时立即提醒。题目未作答且仍开放时，每 30 秒再次提醒；点击通知返回课堂。</p><button className="secondary" onClick={() => action('notification', async () => { await window.attendance.testNotification(); setToast('已请求发送测试通知，请在系统通知中确认。'); })}>发送测试通知<Icon name="arrow" size={17}/></button><div className="hint">请在 系统通知设置中允许 Attendance Handler 通知和声音。</div></article>
        <article className="panel setting-card wide"><h2>运行方式</h2><div className="settings-row"><span>页面检查</span><strong>每 5 秒一次</strong></div><div className="settings-row"><span>上课期间</span><strong>阻止闲置睡眠，允许屏幕熄灭</strong></div><div className="settings-row"><span>关闭 App 窗口</span><strong>继续在菜单栏或系统托盘运行</strong></div><div className="settings-row"><span>关闭课堂窗口</span><strong>暂停操作，倒计时继续</strong></div><p className="hint">合盖或手动睡眠时无法检查题目。唤醒后，监控会在剩余课程时间内恢复。</p></article>
      </section> : <div className="content-grid">
        <section className="courses-section"><div className="section-heading"><h2>课程列表 <span>{state.courses.length.toString().padStart(2, '0')}</span></h2><button className="text-button" disabled={!!busy || running} onClick={importCourses}>{busy === 'import' ? '正在读取…' : '从 iClicker 导入'} <span>↗</span></button></div>
          {state.courses.length ? <div className="course-list">{state.courses.map((course, i) => <article className={`course-card ${running && session.course.id === course.id ? 'active' : ''}`} key={course.id}>
            <div className="course-top"><div className={`course-symbol color-${i % 3}`}><Icon name="book" size={23}/></div><button className="edit-button" aria-label={`编辑 ${course.name}`} onClick={() => { setImported([]); setForm(course); }} disabled={running && session.course.id === course.id}>编辑</button></div>
            <h3>{course.name}</h3><div className={`mode-badge ${course.mode === 'notify' ? 'amber' : ''}`}>{course.mode === 'auto-a' ? <span className="letter-a">A</span> : <Icon name="bell" size={13}/>} {course.mode === 'auto-a' ? '自动选择 A' : '提醒手动作答'}</div>
            <div className="course-meta"><span><Icon name="clock" size={15}/>{course.durationMinutes} 分钟</span><span title="坐标仅在编辑课程时显示"><Icon name="pin" size={15}/>位置已设置</span></div>
            <div className="course-footer"><button className={`start-button ${running && session.course.id === course.id ? 'in-session' : ''}`} disabled={running || !!busy} onClick={() => action('start', () => window.attendance.start(course.id))}>{running && session.course.id === course.id ? <><span className="dot green"/>上课中</> : <><Icon name="play" size={16}/>开始上课</>}</button>{deleting === course.id ? <button className="delete-confirm" onClick={() => action('delete', async () => { setState(await window.attendance.deleteCourse(course.id)); setDeleting(undefined); })}>确认删除</button> : <button className="delete-button" aria-label={`删除 ${course.name}`} disabled={running && session.course.id === course.id} onClick={() => setDeleting(course.id)}>删除</button>}</div>
          </article>)}</div> : <div className="empty-courses"><div className="empty-art"><Icon name="book" size={48}/></div><h3>把第一门课放进来</h3><p>登录 iClicker 后导入课程，<br/>设置位置、时长和答题方式。</p><button className="primary" onClick={importCourses} disabled={!!busy}>导入我的课程<Icon name="arrow" size={16}/></button><button className="text-button" onClick={() => setForm({})}>或手动添加课程</button></div>}
          <div className="quiet-note"><Icon name="check" size={17}/><p>监控只作用于你开始的那门课。你可以随时查看课堂或结束监控。</p></div>
        </section>
        <aside className="session-column"><section className={`panel session-panel ${running ? 'running' : ''}`}><div className="panel-label"><span className={`dot ${running ? 'green' : ''}`}/>{running ? 'LIVE SESSION' : 'CLASSROOM STATUS'}</div><h2>{running ? session.course.name : '准备好，再开始'}</h2><p className="session-subtitle">{session ? STATUS_LABELS[session.status] : '选择一门课程开始今天的课堂'}</p><div className="timer" style={{ '--progress': `${progress}%` } as React.CSSProperties}><div><strong>{running ? `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}` : '--:--'}</strong><span>{running ? '课程剩余时间' : '等待开始上课'}</span></div></div><div className="session-details"><div><span>签到状态</span><strong className={session?.attendance === 'confirmed' ? 'green-text' : ''}>{session?.attendance === 'confirmed' ? '已确认签到' : session?.attendance === 'pending' ? '等待确认' : '尚未确认'}</strong></div><div><span>最近检查</span><strong>{session?.lastCheckedAt ? `${Math.max(0, Math.floor((now - session.lastCheckedAt) / 1000))} 秒前` : '—'}</strong></div></div>{running && <p className="session-message" role="status">{session.detail}</p>}<button className="secondary full" disabled={busy === 'show'} onClick={() => action('show', () => window.attendance.showClassroom())}><Icon name="browser" size={18}/>查看课堂<Icon name="arrow" size={17}/></button>{running && <div className="session-controls"><button className="text-button" onClick={() => action('minimize', () => window.attendance.minimizeClassroom())}>最小化课堂</button><button className="stop-button" disabled={busy === 'stop'} onClick={() => action('stop', () => window.attendance.stop())}>结束上课</button></div>}</section>
          <section className="panel activity-panel"><div className="section-heading"><h2>最近动态</h2><span className="small-label">本机记录</span></div>{state.logs.length ? <ol>{state.logs.slice(0, 5).map(entry => <li key={entry.id}><span className={`event-dot ${entry.level}`}/><div><p>{entry.message}</p><time>{new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div></li>)}</ol> : <p className="empty-log">签到、题目与连接状态会记录在这里。</p>}</section>
        </aside>
      </div>}
      <footer className="page-footer"><span>ATTENDANCE HANDLER</span><span>保持窗口可见，保持课堂连接。</span><span>v{version}</span></footer>
    </main>
    {form !== null && <CourseForm initial={form} imported={imported} demo={state.demo} onClose={() => setForm(null)} onSave={async course => { const updated = await window.attendance.saveCourse(course); setState(updated); setForm(null); }} onImport={async () => { const courses = await window.attendance.importCourses(); setImported(courses); }}/>
    }
  </div>;
}

function CourseForm({ initial, imported, demo, onClose, onSave, onImport }: { initial: Partial<CourseConfig>; imported: RemoteCourse[]; demo: boolean; onClose(): void; onSave(course: CourseConfig): Promise<void>; onImport(): Promise<void> }) {
  const [name, setName] = useState(initial.name || '');
  const [url, setUrl] = useState(initial.url || '');
  const [lat, setLat] = useState(initial.latitude?.toString() || '');
  const [lon, setLon] = useState(initial.longitude?.toString() || '');
  const [duration, setDuration] = useState(initial.durationMinutes || 50);
  const [mode, setMode] = useState(initial.mode || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const parsed = new URL(url); const remoteId = `${parsed.pathname}${parsed.hash}`.match(/\/course\/([A-Za-z0-9_-]+)/)?.[1];
      if (!remoteId) throw new Error('请从 iClicker 课程页面复制链接，链接需要包含 /course/课程标识。');
      if (!lat.trim() || !lon.trim()) throw new Error('请填写经度和纬度。');
      if (mode !== 'auto-a' && mode !== 'notify') throw new Error('请选择答题方式。');
      await onSave({ id: initial.id || crypto.randomUUID(), remoteId, name, url, latitude: Number(lat), longitude: Number(lon), accuracy: initial.accuracy || 10, durationMinutes: duration, mode });
    } catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="form-title"><div className="modal-header"><div><div className="eyebrow">COURSE DETAILS</div><h2 id="form-title">{initial.id ? '编辑课程' : '添加课程'}</h2></div><button className="icon-button" aria-label="关闭" onClick={onClose}><Icon name="close"/></button></div><form onSubmit={submit}>
    {!initial.id && <div className="import-row">{imported.length > 0 ? <label>选择已加入的课程<select defaultValue="" onChange={e => { const course = imported.find(c => c.remoteId === e.target.value); if (course) { setName(course.name); setUrl(course.url); } }}><option value="" disabled>选择 iClicker 课程</option>{imported.map(c => <option value={c.remoteId} key={c.remoteId}>{c.name}</option>)}</select></label> : <button type="button" className="secondary full" onClick={async () => { setSaving(true); try { await onImport(); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } }} disabled={saving}><Icon name="browser" size={16}/>从已登录的 iClicker 读取课程</button>}</div>}
    <label>课程名称<input autoFocus required maxLength={160} placeholder="请输入课程名称" value={name} onChange={e => setName(e.target.value)}/></label>
    <label>iClicker 课程链接<input required type="url" placeholder={demo ? 'http://127.0.0.1:43891/#/course/demo/overview' : 'https://student.iclicker.com/#/course/…/overview'} value={url} onChange={e => setUrl(e.target.value)}/></label>
    <div className="form-grid"><label>纬度 Latitude<input required type="number" step="any" min={-90} max={90} placeholder="请输入纬度" value={lat} onChange={e => setLat(e.target.value)}/></label><label>经度 Longitude<input required type="number" step="any" min={-180} max={180} placeholder="请输入经度" value={lon} onChange={e => setLon(e.target.value)}/></label></div>
    <p className="field-hint">填写你在 Chrome Sensors 中使用的坐标。</p>
    <div className="form-grid"><label>课程时长（分钟）<input required type="number" min={1} max={720} value={duration} onChange={e => setDuration(Number(e.target.value))}/></label><label>答题方式<select required value={mode} onChange={e => setMode(e.target.value)}><option value="" disabled>请选择</option><option value="auto-a">不计正确率 · 自动选 A</option><option value="notify">计正确率 · 提醒我答题</option></select></label></div>
    <div className="form-note"><Icon name="bell" size={17}/><span>{mode === 'auto-a' ? '单选题自动选择 A；遇到其他题型时提醒你处理。' : '新题出现时提醒，未作答则每 30 秒再次提醒。'}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit" className="primary" disabled={saving}>{saving ? '正在保存…' : '保存课程'}</button></div>
  </form></section></div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
