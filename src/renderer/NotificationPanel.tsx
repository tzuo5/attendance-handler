import React from 'react';
import type { NotificationCheck, NotificationChoice } from '../shared/types';

type Props = { check?: NotificationCheck; canConfirm?: boolean; busy: boolean; onTest(): void; onChoice(choice: NotificationChoice): void; onHelp(): void };
export function NotificationPanel({ check, canConfirm, busy, onTest, onChoice, onHelp }: Props) {
  const confirmed = check?.status === 'confirmed';
  return <section className="notification-check" aria-label="提醒测试">
    <p>需要手动作答时会发送系统提醒，未答且仍开放时每 30 秒再次提醒。先发送一条测试通知，再确认是否看到了它。</p>
    <p className={`notification-result ${confirmed ? 'green-text' : ''}`} role="status">{check?.detail || '提醒尚未测试。'}</p>
    {check?.status === 'failed' && check.deferred && <p className="hint" role="status">已选择稍后处理，可以在这里重新测试。</p>}
    <div className="notification-actions"><button className="primary" disabled={busy} onClick={onTest}>{check?.requestedAt ? '重新发送测试通知' : '发送测试通知'}</button>{canConfirm && <><button className="secondary" disabled={busy} onClick={() => onChoice('received')}>我收到了</button><button className="secondary" disabled={busy} onClick={() => onChoice('not-received')}>没收到</button></>}</div>
    {!confirmed && <div className="notification-help"><p>如果没看到提醒：在系统设置的“通知”中允许 Attendance Handler 通知和声音，再检查勿扰或专注模式。Windows 建议使用安装版，以完成通知注册。</p><button className="text-button" disabled={busy} onClick={onHelp}>打开系统通知设置</button><button className="text-button" disabled={busy} onClick={() => onChoice('later')}>稍后处理提醒</button></div>}
    {confirmed && <small>确认时间：{new Date(check.confirmedAt!).toLocaleString('zh-CN')}。以后可在这里重新测试。</small>}
  </section>;
}
