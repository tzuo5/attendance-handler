import React from 'react';
import { environmentReady, SETUP_STEPS, type AppState, type HelpTarget, type SetupAction } from '../shared/types';
import { EnvironmentPanel } from './EnvironmentPanel';

const labels = ['检查环境', '登录账号', '配置课程', '测试提醒', '完成'];
type Props = { state: AppState; busy: string; onAction(action: SetupAction): void; onCheck(): void; onHelp(target: HelpTarget): void; onLogin(): void; onCheckLogin(): void; onImport(): void; onManual(): void; onTest(): void };
export function SetupWizard({ state, busy, onAction, onCheck, onHelp, onLogin, onCheckLogin, onImport, onManual, onTest }: Props) {
  const setup = state.setup!;
  const step = setup.step;
  const index = SETUP_STEPS.indexOf(step);
  const ready = environmentReady(state.environment);
  return <section className="setup-wizard" aria-label="首次配置向导">
    <ol className="setup-progress" aria-label="配置进度">{SETUP_STEPS.map((value, i) => <li key={value} aria-current={step === value ? 'step' : undefined} className={step === value ? 'current' : setup.completedSteps.includes(value) ? 'done' : ''}><span>{i + 1}</span>{labels[i]}</li>)}</ol>
    <p className="hint">进度自动保存在这台电脑。关闭窗口或稍后继续，都可以从当前步骤接着配置。</p>
    {(step === 'environment' || !state.environment) && <EnvironmentPanel report={state.environment} busy={busy === 'environment'} onCheck={onCheck} onHelp={onHelp}/>}
    {step === 'login' && <article className="panel setup-card"><h2>登录你的 iClicker 账号</h2><p>点击下面的按钮，在 Chrome 中登录。学校验证码、双重验证等步骤需要你自己完成，然后回到课堂助手。</p><button className="primary" disabled={!!busy} onClick={onLogin}>打开登录窗口</button><button className="secondary" disabled={!!busy} onClick={onCheckLogin}>检查登录状态</button><p role="status">{state.loginReport?.detail || '登录尚未验证。打开窗口还不代表登录成功。'}</p></article>}
    {step === 'course' && <article className="panel setup-card"><h2>添加第一门课</h2><p>从已登录账号读取课程，再填写教室位置、上课时长和答题方式。</p><button className="primary" disabled={!!busy} onClick={onImport}>导入并配置课程</button><button className="secondary" disabled={!!busy} onClick={onManual}>手动添加课程</button><ul className="setup-courses">{state.courses.map(course => <li key={course.id}>{course.name} · 已保存 · {course.durationMinutes} 分钟</li>)}</ul>{!state.courses.length && <p className="hint">保存课程后才能进入下一步。</p>}</article>}
    {step === 'notification' && <article className="panel setup-card"><h2>试一下题目提醒</h2><p>发送一条系统通知，查看这台电脑能否提醒你处理新题目。</p><button className="primary" disabled={!!busy} onClick={onTest}>发送测试通知</button><p className="hint">可以先配置课程，稍后在连接与提醒页确认通知是否正常。</p></article>}
    {step === 'complete' && <article className="panel setup-card"><h2>课程配置已保存</h2><p>已保存 {state.courses.length} 门课程。完成后可以在课程页开始上课，提醒目前仍需确认。</p>{!ready && <p className="field-error">本次环境尚未全部通过，请重新检查后完成。</p>}<button className="primary" disabled={!!busy} onClick={() => onAction('finish')}>完成配置</button></article>}
    <div className="setup-actions">{index > 0 && <button className="secondary" disabled={!!busy} onClick={() => onAction('back')}>上一步</button>}<button className="text-button" disabled={!!busy} onClick={() => onAction('dismiss')}>稍后继续</button>{step !== 'complete' && <button className="primary" disabled={!!busy || step === 'environment' && !ready || step === 'course' && !state.courses.length} onClick={() => onAction('next')}>{step === 'notification' ? '稍后确认提醒，继续' : '下一步'}</button>}</div>
  </section>;
}
