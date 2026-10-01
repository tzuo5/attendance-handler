import { describe, expect, it } from 'vitest';
import { beginNotificationTest, notificationEvent, notificationResolved, recordNotificationChoice, restoreNotification, unverifiedNotification } from '../src/shared/notification-check';
import { advanceSetup } from '../src/shared/setup';

describe('notification readiness', () => {
  it('never treats a system show event as a confirmed human receipt', () => {
    const check = beginNotificationTest();
    const shown = notificationEvent(check, check.attemptId!, 'show');
    expect(shown.status).toBe('requested');
    expect(shown.confirmedAt).toBeUndefined();
    expect(notificationResolved(shown)).toBe(false);
    expect(recordNotificationChoice(shown,'received',shown.attemptId).status).toBe('confirmed');
  });
  it('records sending failure and preserves it if explicitly deferred', () => {
    const check = beginNotificationTest();
    const failed = notificationEvent(check,check.attemptId!,'failed');
    expect(failed.status).toBe('failed');
    expect(() => recordNotificationChoice(failed,'received',check.attemptId)).toThrow('新的测试');
    const deferred = recordNotificationChoice(failed,'later');
    expect(deferred.status).toBe('failed');
    expect(deferred.failedAt).toBeDefined();
    expect(notificationResolved(deferred)).toBe(true);
  });
  it('keeps timeout and a user reporting no receipt pending, with an explicit option to defer', () => {
    const check = beginNotificationTest();
    expect(notificationEvent(check,check.attemptId!,'timeout').status).toBe('pending');
    const missing = recordNotificationChoice(check,'not-received',check.attemptId);
    expect(missing.status).toBe('pending');
    expect(notificationResolved(missing)).toBe(false);
    const deferred = recordNotificationChoice(missing,'later');
    expect(notificationResolved(deferred)).toBe(true);
    expect(notificationEvent(deferred,check.attemptId!,'failed')).toMatchObject({status:'failed',deferred:true});
  });
  it('requires a current test request to claim receipt and ignores old test events', () => {
    expect(() => recordNotificationChoice(unverifiedNotification(),'received')).toThrow('新的测试');
    const first = beginNotificationTest();
    const second = beginNotificationTest();
    expect(notificationEvent(second,first.attemptId!,'failed')).toBe(second);
    expect(() => recordNotificationChoice(second,'received',first.attemptId)).toThrow('新的测试');
    expect(restoreNotification(first).status).toBe('pending');
    expect(() => recordNotificationChoice(restoreNotification(first),'received')).toThrow('新的测试');
  });
  it('preserves confirmed receipts across restart and resets confirmation on a new test', () => {
    const check=beginNotificationTest();const confirmed=recordNotificationChoice(check,'received',check.attemptId);
    expect(restoreNotification(confirmed)).toEqual(confirmed);
    expect(notificationEvent(confirmed,check.attemptId!,'timeout')).toBe(confirmed);
    expect(beginNotificationTest().confirmedAt).toBeUndefined();
    expect(restoreNotification({status:'confirmed'}).status).toBe('unverified');
  });
  it('blocks setup completion for an unconfirmed test unless the user explicitly defers', () => {
    const setup={step:'notification' as const,completedSteps:[],dismissed:false};
    const facts={environment:true,login:true,courses:1,notification:false};
    expect(()=>advanceSetup(setup,'next',facts)).toThrow('确认是否收到');
    expect(advanceSetup(setup,'next',{...facts,notification:true}).step).toBe('complete');
  });
});
