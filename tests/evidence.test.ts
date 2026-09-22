import { describe, it, expect } from 'vitest';
import { EvidenceTracker } from '../src/main/iclicker';
import { validateCourse } from '../src/shared/validation';
describe('passive iClicker evidence', () => {
  it('extracts only usable course records and ignores auth responses', () => {
    const tracker = new EvidenceTracker('https://student.iclicker.com');
    tracker.observeResponse('/student/courses', { activeCourses: [{ courseId: 'c1', name: 'Physics' }], archivedCourses: [{ courseId: 'c2', name: 'Old', archived: true }] });
    tracker.observeResponse('/auth/login', { courseId: 'secret', name: 'never' });
    expect([...tracker.courses.keys()]).toEqual(['c1']);
  });
  it('keeps stable IDs for successive identical questions and handles closure', () => {
    const tracker = new EvidenceTracker('https://student.iclicker.com');
    tracker.observeFrame(JSON.stringify({ event: 'question', data: JSON.stringify({ meetingId: 'm', activityId: 'a', questionId: '1' }) }));
    expect(tracker.question).toEqual({ key: 'm:a:1', ended: false });
    tracker.observeFrame(JSON.stringify({ event: 'endQuestion', data: { questionId: '1' } }));
    expect(tracker.question?.ended).toBe(true);
    tracker.observeFrame(JSON.stringify({ event: 'question', data: { meetingId: 'm', activityId: 'a', questionId: '2' } }));
    expect(tracker.question).toEqual({ key: 'm:a:2', ended: false });
  });
  it('rejects external URLs and mismatched course identities', () => {
    const course = { id: '11111111-1111-4111-8111-111111111111', remoteId: 'c1', name: 'Class', latitude: 0, longitude: 0, accuracy: 10, mode: 'auto-a', durationMinutes: 50 };
    expect(() => validateCourse({ ...course, url: 'https://evil.test/#/course/c1' }, 'https://student.iclicker.com')).toThrow();
    expect(() => validateCourse({ ...course, url: 'https://student.iclicker.com/#/course/c2' }, 'https://student.iclicker.com')).toThrow();
    expect(validateCourse({ ...course, url: 'https://student.iclicker.com/#/course/c1/overview' }, 'https://student.iclicker.com').remoteId).toBe('c1');
  });
});
