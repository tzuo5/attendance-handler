import { describe, expect, it } from 'vitest';
import { addLocalDays, canonicalTimeZone, compareOccurrences, dateInTimeZone, decideSchedule, occurrenceOnDate, occurrencesBetween, resolveLocalTime, validateSchedule, type ScheduleConfig } from '../src/shared/schedule';
import type { SessionState } from '../src/shared/types';

const single: ScheduleConfig = { id: '11111111-1111-4111-8111-111111111111', courseId: '22222222-2222-4222-8222-222222222222', enabled: true, localTime: '09:00', timeZone: 'America/Chicago', durationMinutes: 60, effectiveFrom: Date.parse('2026-01-01T00:00:00Z'), recurrence: { kind: 'once', date: '2026-10-01' } };
const weekly: ScheduleConfig = { ...single, recurrence: { kind: 'weekly', startDate: '2026-03-01', endDate: '2026-11-30', weekdays: [0, 4] } };
const planned = occurrenceOnDate(single, '2026-10-01')!;
const context = { now: planned.scheduledStart!, courseExists: true, environmentReady: true, session: null };

describe('schedule configuration and local time rules', () => {
  it('validates course identity, full configuration, ranges and recurrence boundaries', () => {
    expect(validateSchedule(single, [single.courseId])).toEqual(single);
    for (const patch of [{ localTime: '24:00' }, { durationMinutes: 0 }, { durationMinutes: 721 }, { recurrence: { kind: 'once', date: '2026-02-30' } }, { recurrence: { kind: 'weekly', startDate: '2026-10-01', weekdays: [] } }]) expect(() => validateSchedule({ ...single, ...patch })).toThrow();
    expect(() => validateSchedule(single, [])).toThrow('课程已不存在');
    expect(() => validateSchedule({ ...weekly, recurrence: { kind: 'weekly', startDate: '2026-10-02', endDate: '2026-10-01', weekdays: [4] } })).toThrow('结束日期');
  });
  it('canonicalizes city zones and refuses ambiguous abbreviations or numeric offsets', () => {
    expect(canonicalTimeZone('US/Central')).toBe('America/Chicago');
    for (const zone of ['CST', '+08:00', 'Mars/City']) expect(() => canonicalTimeZone(zone)).toThrow('时区');
  });
  it('deduplicates weekdays and uses local calendar dates, inclusive start and end', () => {
    const schedule = validateSchedule({ ...weekly, recurrence: { kind: 'weekly', startDate: '2026-10-01', endDate: '2026-10-08', weekdays: [4, 0, 4] } });
    expect(schedule.recurrence).toMatchObject({ weekdays: [0, 4] });
    expect(occurrencesBetween(schedule, '2026-09-30', '2026-10-10').map(item => item.localDate)).toEqual(['2026-10-01', '2026-10-04', '2026-10-08']);
    expect(occurrenceOnDate(single, '2026-10-02')).toBeNull();
  });
  it('keeps a Chicago task fixed when the computer moves to a different zone', () => {
    expect(planned.scheduledStart).toBe(Date.parse('2026-10-01T14:00:00Z'));
    expect(dateInTimeZone(planned.scheduledStart!, 'Asia/Shanghai')).toBe('2026-10-01');
    expect(resolveLocalTime('2026-10-01', '09:00', 'Asia/Shanghai')).toEqual([Date.parse('2026-10-01T01:00:00Z')]);
  });
  it('rejects a single nonexistent DST time and marks the weekly instance skipped', () => {
    expect(resolveLocalTime('2026-03-08', '02:30', 'America/Chicago')).toEqual([]);
    expect(() => validateSchedule({ ...single, localTime: '02:30', recurrence: { kind: 'once', date: '2026-03-08' } })).toThrow('不存在');
    const schedule = { ...weekly, localTime: '02:30' };
    const occurrence = occurrenceOnDate(schedule, '2026-03-08')!;
    expect(occurrence).toMatchObject({ scheduledStart: null, endsAt: null, resolution: 'nonexistent' });
    expect(decideSchedule(schedule, occurrence, context)).toMatchObject({ kind: 'skip', reason: 'invalid-time' });
    expect(decideSchedule(schedule, occurrence, { ...context, now: Date.parse('2026-03-08T07:00:00Z') })).toMatchObject({ kind: 'pending', reason: 'future' });
  });
  it('chooses the earlier repeated DST time and generates only one stable instance', () => {
    expect(resolveLocalTime('2026-11-01', '01:30', 'America/Chicago')).toEqual([Date.parse('2026-11-01T06:30:00Z'), Date.parse('2026-11-01T07:30:00Z')]);
    const schedule = { ...weekly, localTime: '01:30' };
    const occurrences = occurrencesBetween(schedule, '2026-11-01', '2026-11-01');
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({ scheduledStart: Date.parse('2026-11-01T06:30:00Z'), resolution: 'earlier' });
    expect(occurrenceOnDate(schedule, '2026-11-01')?.key).toBe(occurrences[0].key);
  });
  it('handles half-hour DST transitions and a full skipped local date', () => {
    expect(resolveLocalTime('2026-10-04', '02:15', 'Australia/Lord_Howe')).toEqual([]);
    expect(resolveLocalTime('2011-12-30', '09:00', 'Pacific/Apia')).toEqual([]);
  });
  it('computes elapsed duration across DST and local date arithmetic across leap days', () => {
    const occurrence = occurrenceOnDate({ ...single, localTime: '01:30', durationMinutes: 120, recurrence: { kind: 'once', date: '2026-03-08' } }, '2026-03-08')!;
    expect(occurrence.endsAt! - occurrence.scheduledStart!).toBe(7_200_000);
    expect(occurrence.endsAt).toBe(Date.parse('2026-03-08T09:30:00Z'));
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(() => occurrencesBetween(weekly, '2026-01-01', '2027-02-01')).toThrow('范围');
  });
});

describe('schedule trigger decisions', () => {
  it('does not trigger before start or while paused', () => {
    expect(decideSchedule(single, planned, { ...context, now: context.now - 1 })).toMatchObject({ kind: 'pending', reason: 'future' });
    expect(decideSchedule({ ...single, enabled: false }, planned, context)).toMatchObject({ kind: 'pending', reason: 'paused' });
  });
  it('starts on time, catches up only through ten minutes and preserves the original end', () => {
    expect(decideSchedule(single, planned, context)).toMatchObject({ kind: 'start', late: false, endsAt: planned.endsAt });
    expect(decideSchedule(single, planned, { ...context, now: context.now + 600_000 })).toMatchObject({ kind: 'start', late: true, endsAt: planned.endsAt });
    expect(decideSchedule(single, planned, { ...context, now: context.now + 600_001 })).toMatchObject({ kind: 'skip', reason: 'missed' });
  });
  it('never restarts a task that ended, even within the catch-up grace', () => {
    const short = { ...single, durationMinutes: 5 };
    expect(decideSchedule(short, occurrenceOnDate(short, '2026-10-01')!, { ...context, now: context.now + 300_000 })).toMatchObject({ kind: 'skip', reason: 'missed' });
  });
  it('does not catch up a plan created, edited or re-enabled after that instance began', () => {
    expect(decideSchedule({ ...single, effectiveFrom: context.now + 1 }, planned, { ...context, now: context.now + 60_000 })).toMatchObject({ kind: 'skip', reason: 'inactive' });
  });
  it.each(['monitoring', 'starting', 'needs-login', 'offline', 'window-closed', 'interrupted'] as const)('preserves a %s classroom instead of opening a second one', status => {
    const session = { status } as SessionState;
    expect(decideSchedule(single, planned, { ...context, session })).toMatchObject({ kind: 'skip', reason: 'conflict' });
  });
  it('allows completed sessions but refuses missing courses and an unready environment', () => {
    expect(decideSchedule(single, planned, { ...context, session: { status: 'completed' } as SessionState })).toMatchObject({ kind: 'start' });
    expect(decideSchedule(single, planned, { ...context, courseExists: false })).toMatchObject({ kind: 'skip', reason: 'course' });
    expect(decideSchedule(single, planned, { ...context, environmentReady: false })).toMatchObject({ kind: 'skip', reason: 'environment' });
  });
  it('gives overlapping plans a deterministic start-time then ID order', () => {
    const second = { ...planned, scheduleId: '33333333-3333-4333-8333-333333333333' };
    expect([second, planned].sort(compareOccurrences)[0]).toBe(planned);
    expect(compareOccurrences({ ...second, scheduledStart: context.now - 1 }, planned)).toBeLessThan(0);
  });
  it('keeps same-date execution identity through edits and refuses a stale preview', () => {
    const edited = { ...single, localTime: '10:00', timeZone: 'Asia/Shanghai' };
    expect(occurrenceOnDate(edited, '2026-10-01')?.key).toBe(planned.key);
    expect(() => decideSchedule(edited, planned, context)).toThrow('已变化');
    expect(() => decideSchedule({ ...single, durationMinutes: 90 }, planned, context)).toThrow('已变化');
    expect(() => decideSchedule({ ...single, recurrence: { kind: 'once', date: '2026-10-02' } }, planned, context)).toThrow('已变化');
  });
});
