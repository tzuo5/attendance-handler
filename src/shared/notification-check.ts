import type { NotificationCheck, NotificationChoice } from './types';

export const unverifiedNotification = (): NotificationCheck => ({ status: 'unverified', detail: '提醒尚未测试。' });
export function beginNotificationTest(): NotificationCheck {
  return { status: 'requested', attemptId: crypto.randomUUID(), requestedAt: Date.now(), detail: '已请求测试提醒，请确认你是否看到了通知。' };
}
export function notificationEvent(current: NotificationCheck, attempt: string, event: 'show' | 'failed' | 'timeout'): NotificationCheck {
  if (current.attemptId !== attempt || !['requested','pending'].includes(current.status)) return current;
  if (current.status === 'pending' && event !== 'failed') return current;
  if (event === 'show') return { ...current, detail: '系统已接受测试提醒，仍需要你确认是否收到。' };
  if (event === 'failed') return { ...current, status: 'failed', failedAt: Date.now(), detail: '系统未能发送测试提醒。请检查通知设置后重新测试。' };
  return { ...current, status: 'pending', detail: '系统未返回展示结果，收到情况尚未确认。可以检查设置后重试。' };
}
export function recordNotificationChoice(current: NotificationCheck, choice: NotificationChoice, activeAttempt?: string): NotificationCheck {
  if (choice === 'received') {
    if (!current.attemptId || current.attemptId !== activeAttempt || !['requested','pending'].includes(current.status)) throw new Error('请先发送新的测试通知，再确认是否收到。');
    return { ...current, status: 'confirmed', confirmedAt: Date.now(), deferred: false, detail: '你已确认收到测试提醒。' };
  }
  if (current.status === 'failed') return { ...current, deferred: choice === 'later' };
  return { ...current, status: 'pending', confirmedAt: undefined, deferred: choice === 'later', detail: choice === 'later' ? '提醒尚未确认，已选择稍后处理。可在连接与提醒中继续测试。' : '你尚未收到测试提醒。请检查通知设置后重新测试。' };
}
export function restoreNotification(value: unknown): NotificationCheck {
  if (!value || typeof value !== 'object') return unverifiedNotification();
  const saved = value as NotificationCheck;
  if (!['unverified','requested','confirmed','pending','failed'].includes(saved.status) || typeof saved.detail !== 'string') return unverifiedNotification();
  if (saved.status === 'confirmed' && typeof saved.confirmedAt !== 'number') return unverifiedNotification();
  return saved.status === 'requested' ? { ...saved, status: 'pending', detail: '上次测试未确认收到，请发送新的测试通知。' } : saved;
}
export const notificationResolved = (check?: NotificationCheck) => check?.status === 'confirmed' || check?.deferred === true;
