import React, { useEffect, useRef, useState } from 'react';
import { ACTIVE, environmentReady, SETUP_STEPS, type AppState, type HelpTarget, type SetupAction, type NotificationChoice } from '../shared/types';
import { EnvironmentPanel } from './EnvironmentPanel';
import { NotificationPanel } from './NotificationPanel';
import { notificationResolved } from '../shared/notification-check';

const labels = ['检查环境', '登录账号', '配置课程', '测试提醒', '完成'];
type Props = { state: AppState; busy: string; onAction(action: SetupAction): void; onCheck(): void; onHelp(target: HelpTarget): void; onLogin(): void; onCheckLogin(): void; onReadCourses(): void; onImport(): void; onManual(): void; onTest(): void; onNotificationChoice(choice: NotificationChoice): void; onStart(id: string): void };
export function SetupWizard(props: Props) {
  const { state, busy, onAction, onCheck, onHelp, onLogin, onCheckLogin, onReadCourses, onImport, onManual, onTest, onNotificationChoice, onStart } = props;
  const setup = state.setup!;
  const step = setup.step;
  const index = SETUP_STEPS.indexOf(step);
  const ready = environmentReady(state.environment);
  const [firstCourse, setFirstCourse] = useState(state.courses[0]?.id || '');
  const selectedCourse = state.courses.some(course => course.id === firstCourse) ? firstCourse : state.courses[0]?.id || '';
  const heading = useRef<HTMLHeadingElement>(null);
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    heading.current?.focus();
    if (step === 'course') { latest.current.onReadCourses(); return; }
    if (step !== 'login') return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!latest.current.busy) {
        try {
          const report = await window.attendance.checkLogin();
          if (!stopped && report.status === 'verified' && !latest.current.busy) { latest.current.onAction('next'); return; }
        } catch { /* The explicit check button provides a retry for IPC failures. */ }
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [step]);
  return <section className="setup-wizard" aria-label="首次配置向导">
    <ol className="setup-progress" aria-label="配置进度">{SETUP_STEPS.map((value, i) => <li key={value} aria-current={step === value ? 'step' : undefined} className={step === value ? 'current' : setup.completedSteps.includes(value) ? 'done' : ''}><span>{i + 1}</span>{labels[i]}</li>)}</ol>
    <p className="hint">进度自动保存在这台电脑。关闭窗口或稍后继续，都可以从当前步骤接着配置。</p>
    {(step === 'environment' || !state.environment) && <EnvironmentPanel report={state.environment} busy={busy === 'environment'} onCheck={onCheck} onHelp={onHelp}/>}
    {step === 'login' && <article className="panel setup-card"><h2 ref={heading} tabIndex={-1}>登录你的 iClicker 账号</h2><p>点击下面的按钮，在 Chrome 中登录。学校验证码、双重验证等步骤需要你自己完成。确认课程页面加载后，会自动进入课程配置。</p><button className="primary" disabled={!!busy} onClick={onLogin}>打开登录窗口</button><button className="secondary" disabled={!!busy} onClick={onCheckLogin}>检查登录状态</button><p role="status">{state.loginReport?.detail || '登录尚未验证。打开窗口还不代表登录成功。'}</p></article>}
    {step === 'course' && <article className="panel setup-card"><h2 ref={heading} tabIndex={-1}>添加第一门课</h2><p>从已登录账号读取课程，再填写教室位置、上课时长和答题方式。</p><p role="status">{busy === 'setup-import' ? '正在读取你的课程…' : state.courseImport?.detail || '课程列表尚未读取。'}</p>{state.courseImport?.status === 'courses' && <button className="primary" disabled={!!busy} onClick={onImport}>配置导入课程</button>}<button className="secondary" disabled={!!busy} onClick={onReadCourses}>重新读取课程</button><button className="secondary" disabled={!!busy} onClick={onManual}>手动添加课程</button>{state.courseImport?.status === 'login' && <button className="text-button" disabled={!!busy} onClick={() => onAction('back')}>返回登录</button>}<ul className="setup-courses">{state.courses.map(course => <li key={course.id}>{course.name} · 已保存 · {course.durationMinutes} 分钟</li>)}</ul>{!state.courses.length && <p className="hint">保存课程后才能进入下一步。</p>}</article>}
    {step === 'notification' && <article className="panel setup-card"><h2 ref={heading} tabIndex={-1}>试一下题目提醒</h2><NotificationPanel check={setup.notification} canConfirm={state.notificationCanConfirm} busy={!!busy} onTest={onTest} onChoice={onNotificationChoice} onHelp={() => onHelp('notifications')}/></article>}
    {step === 'complete' && <article className="panel setup-card"><h2 ref={heading} tabIndex={-1}>课程配置已保存</h2><p>完成前会重新核实环境和登录。已保存的课程和提醒确认保留在这台电脑。</p><dl className="setup-summary"><div><dt>电脑环境</dt><dd>{ready ? '检查通过' : '本次尚未检查通过'}</dd></div><div><dt>账号登录</dt><dd>{state.loginReport?.status === 'verified' ? '实际页面已确认登录' : state.loginReport?.detail || '本次尚未确认，完成时会重新检查'}</dd></div><div><dt>课程配置</dt><dd>{state.courses.length ? `${state.courses.length} 门已保存：${state.courses.map(course => course.name).join('、')}` : '尚无已保存课程'}</dd></div><div><dt>题目提醒</dt><dd>{setup.notification?.detail || '尚未确认收到'}{setup.notification?.status === 'failed' && setup.notification.deferred && '（已选择稍后处理）'}</dd></div></dl>{!ready && <p className="field-error">本次环境尚未全部通过，请重新检查后完成。</p>}<label>开始上课的课程<select aria-label="开始上课的课程" value={selectedCourse} onChange={event => setFirstCourse(event.target.value)}>{state.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><button className="primary" disabled={!!busy || !selectedCourse || ACTIVE(state.session)} onClick={() => onStart(selectedCourse)}>完成配置并开始上课</button><button className="secondary" disabled={!!busy} onClick={() => onAction('finish')}>完成配置</button>{ACTIVE(state.session) && <p className="hint">当前已有课堂监控，可以完成配置后返回查看。</p>}</article>}
    <div className="setup-actions">{index > 0 && <button className="secondary" disabled={!!busy} onClick={() => onAction('back')}>上一步</button>}<button className="text-button" disabled={!!busy} onClick={() => onAction('dismiss')}>稍后继续</button>{step !== 'complete' && <button className="primary" disabled={!!busy || step === 'environment' && !ready || step === 'course' && !state.courses.length || step === 'notification' && !notificationResolved(setup.notification)} onClick={() => onAction('next')}>下一步</button>}</div>
  </section>;
}
