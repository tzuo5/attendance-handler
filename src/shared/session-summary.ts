import type { SessionState, SessionSummary } from './types';

export function summarizeSession(session: SessionState, endedAt: number, reason: SessionSummary['reason']): SessionSummary {
  const questions = Object.values(session.questions || {});
  const observed = new Set([...questions.map(q => q.key), ...Object.keys(session.handled)]);
  const confirmed = new Set([...questions.filter(q => q.confirmedAt !== undefined).map(q => q.key), ...Object.keys(session.handled).filter(key => session.handled[key] === 'confirmed')]);
  const attempted = new Set([...questions.filter(q => q.attemptedAt !== undefined).map(q => q.key), ...Object.keys(session.handled).filter(key => session.handled[key] === 'attempted')]);
  return {
    id:session.id, courseId:session.course.id, courseName:session.course.name, startedAt:session.startedAt, endedAt, plannedEndsAt:session.endsAt,
    reason, attendance:session.attendance, attendanceConfirmedAt:session.attendanceConfirmedAt,
    observedQuestionCount:observed.size, confirmedAnswerCount:confirmed.size,
    pendingAttemptCount:[...attempted].filter(key => !confirmed.has(key)).length, unconfirmedQuestionCount:observed.size-confirmed.size,
    hadInterruptions:!!session.hadInterruptions || reason === 'interrupted', questions:structuredClone(questions),
  };
}
