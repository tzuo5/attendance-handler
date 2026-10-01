import { z } from 'zod';
import { ACTIVE, type SessionState } from './types';

export const SCHEDULE_LATE_GRACE_MS = 10 * 60_000;
const DAY = 86_400_000;
export const SCHEDULE_RUNTIME_HELP = '定时开启需要 App 持续在菜单栏或系统托盘运行。关闭主窗口可以继续运行；退出 App、关机或睡眠期间无法开始，也不会唤醒电脑。';
export const SCHEDULE_TIMING_HELP = '启动或唤醒后，迟到不超过 10 分钟且尚未到原定结束时间时，可补开剩余时间；更晚则跳过。有课堂正在运行或等待恢复时，不会开启另一门课。';

export type ScheduleRecurrence = { kind: 'once'; date: string } | { kind: 'weekly'; weekdays: number[]; startDate: string; endDate?: string };
export interface ScheduleConfig {
  id: string; courseId: string; enabled: boolean; localTime: string; timeZone: string;
  durationMinutes: number; effectiveFrom: number; recurrence: ScheduleRecurrence;
}
export interface ScheduleOccurrence {
  key: string; scheduleId: string; courseId: string; localDate: string; localTime: string; timeZone: string;
  scheduledStart: number | null; endsAt: number | null; resolution: 'exact' | 'earlier' | 'nonexistent';
}

function dateMillis(date: string) { return Date.parse(`${date}T00:00:00Z`); }
export function validLocalDate(date: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) && !/^2100-\d{2}-\d{2}$/.test(date)) return false;
  const millis = dateMillis(date);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === date;
}
export function canonicalTimeZone(zone: string) {
  if (zone !== 'UTC' && !zone.includes('/')) throw new Error('请选择城市时区，例如 America/Chicago；请勿使用 CST 等缩写。');
  try { return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone; }
  catch { throw new Error('无法识别时区，请选择有效的城市时区。'); }
}
const localDateSchema = z.string().refine(validLocalDate);
const scheduleSchema = z.object({
  id: z.string().uuid(), courseId: z.string().uuid(), enabled: z.boolean(),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), timeZone: z.string().min(1).max(100),
  durationMinutes: z.number().int().min(1).max(720),
  effectiveFrom: z.number().finite().int().min(0),
  recurrence: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('once'), date: localDateSchema }),
    z.object({ kind: z.literal('weekly'), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), startDate: localDateSchema, endDate: localDateSchema.optional() }),
  ]),
});
export function validateSchedule(input: unknown, courseIds?: readonly string[]): ScheduleConfig {
  const result = scheduleSchema.safeParse(input);
  if (!result.success) {
    const field = String(result.error.issues[0]?.path[0]);
    const guidance: Record<string, string> = { courseId: '请选择已保存的课程。', localTime: '请填写开始时刻（00:00 到 23:59）。', timeZone: '请选择城市时区。', durationMinutes: '监控时长应为 1 到 720 分钟。', recurrence: '请填写有效日期（2000–2100 年）；每周任务至少选择一天。' };
    throw new Error(guidance[field] || '定时任务配置无效，请检查填写内容。');
  }
  const schedule: ScheduleConfig = { ...result.data, timeZone: canonicalTimeZone(result.data.timeZone) };
  if (courseIds && !courseIds.includes(schedule.courseId)) throw new Error('课程已不存在，请重新选择已保存的课程。');
  if (schedule.recurrence.kind === 'weekly') {
    const repeat = schedule.recurrence;
    repeat.weekdays = [...new Set(repeat.weekdays)].sort((a, b) => a - b);
    if (repeat.endDate && repeat.endDate < repeat.startDate) throw new Error('重复结束日期不能早于开始日期。');
  } else if (occurrenceOnDate(schedule, schedule.recurrence.date)?.resolution === 'nonexistent') {
    throw new Error('夏令时变化使这一天的开始时刻不存在，请选择其他时刻。');
  }
  return schedule;
}

function formatter(zone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
}
function partsAt(format: Intl.DateTimeFormat, millis: number) {
  const parts = Object.fromEntries(format.formatToParts(millis).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, wall: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) };
}
export function dateInTimeZone(millis: number, zone: string) { return partsAt(formatter(zone), millis).date; }
export function addLocalDays(date: string, days: number) {
  if (!validLocalDate(date) || !Number.isInteger(days)) throw new Error('日期无效。');
  return new Date(dateMillis(date) + days * DAY).toISOString().slice(0, 10);
}

// Discover offsets on both sides of a possible transition, then round-trip each
// candidate. No host-zone Date parsing, 24-hour arithmetic on zoned instants, or
// silent normalization of a nonexistent local time.
export function resolveLocalTime(date: string, time: string, zone: string): number[] {
  if (!validLocalDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('开始日期或时刻无效。');
  const format = formatter(canonicalTimeZone(zone));
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3_600_000;
    offsets.add(partsAt(format, sample).wall - sample);
  }
  return [...offsets].map(offset => wall - offset).filter(candidate => {
    const actual = partsAt(format, candidate);
    return actual.date === date && actual.time === time && actual.wall === wall;
  }).sort((a, b) => a - b);
}

export function occurrenceOnDate(schedule: ScheduleConfig, date: string): ScheduleOccurrence | null {
  if (!validLocalDate(date)) throw new Error('日期无效。');
  const repeat = schedule.recurrence;
  if (repeat.kind === 'once' ? repeat.date !== date : date < repeat.startDate || !!repeat.endDate && date > repeat.endDate || !repeat.weekdays.includes(new Date(dateMillis(date)).getUTCDay())) return null;
  const instants = resolveLocalTime(date, schedule.localTime, schedule.timeZone);
  const scheduledStart = instants[0] ?? null;
  return {
    // One instance per local date. Time/zone edits cannot create a second key
    // for the same day's already claimed execution.
    key: `${schedule.id}/${date}`,
    scheduleId: schedule.id, courseId: schedule.courseId, localDate: date, localTime: schedule.localTime, timeZone: schedule.timeZone,
    scheduledStart, endsAt: scheduledStart === null ? null : scheduledStart + schedule.durationMinutes * 60_000,
    resolution: !instants.length ? 'nonexistent' : instants.length > 1 ? 'earlier' : 'exact',
  };
}
export function occurrencesBetween(schedule: ScheduleConfig, firstDate: string, lastDate: string): ScheduleOccurrence[] {
  if (!validLocalDate(firstDate) || !validLocalDate(lastDate) || lastDate < firstDate || dateMillis(lastDate) - dateMillis(firstDate) > 370 * DAY) throw new Error('预览日期范围无效（最多 371 天）。');
  const occurrences: ScheduleOccurrence[] = [];
  for (let date = firstDate; date <= lastDate; date = addLocalDays(date, 1)) {
    const occurrence = occurrenceOnDate(schedule, date);
    if (occurrence) occurrences.push(occurrence);
  }
  return occurrences;
}

export type ScheduleDecision =
  | { kind: 'pending'; reason: 'paused' | 'future'; detail: string }
  | { kind: 'skip'; reason: 'invalid-time' | 'inactive' | 'missed' | 'conflict' | 'course' | 'environment'; detail: string }
  | { kind: 'start'; endsAt: number; late: boolean; detail: string };
export function decideSchedule(schedule: ScheduleConfig, occurrence: ScheduleOccurrence, context: { now: number; courseExists: boolean; environmentReady: boolean; session: SessionState | null }): ScheduleDecision {
  const current = occurrenceOnDate(schedule, occurrence.localDate);
  if (!Number.isFinite(context.now) || !current || occurrence.scheduleId !== schedule.id || occurrence.courseId !== schedule.courseId || occurrence.key !== current.key || occurrence.localTime !== schedule.localTime || occurrence.timeZone !== schedule.timeZone || occurrence.scheduledStart !== current.scheduledStart || occurrence.endsAt !== current.endsAt) throw new Error('定时执行信息已变化，请重新核实当前任务。');
  if (!schedule.enabled) return { kind: 'pending', reason: 'paused', detail: '任务已暂停，不会自动开始。' };
  if (occurrence.scheduledStart === null || occurrence.endsAt === null) {
    const localNow = partsAt(formatter(schedule.timeZone), context.now);
    if (localNow.date < occurrence.localDate || localNow.date === occurrence.localDate && localNow.time < occurrence.localTime) return { kind: 'pending', reason: 'future', detail: '尚未到开始时间。' };
    return { kind: 'skip', reason: 'invalid-time', detail: '夏令时变化使本次开始时刻不存在，已跳过；请调整开始时刻。' };
  }
  if (context.now < occurrence.scheduledStart) return { kind: 'pending', reason: 'future', detail: '尚未到开始时间。' };
  if (occurrence.scheduledStart < schedule.effectiveFrom) return { kind: 'skip', reason: 'inactive', detail: '本次开始时间早于任务生效时间，已跳过；保存或重新启用不会补开之前的计划。' };
  if (context.now - occurrence.scheduledStart > SCHEDULE_LATE_GRACE_MS || context.now >= occurrence.endsAt) return { kind: 'skip', reason: 'missed', detail: '已错过本次开始时间，不会补开；下一次计划仍保留。' };
  if (ACTIVE(context.session) || context.session?.status === 'interrupted') return { kind: 'skip', reason: 'conflict', detail: '已有课堂正在运行或等待恢复，本次定时任务已跳过。' };
  if (!context.courseExists) return { kind: 'skip', reason: 'course', detail: '课程已不存在，本次任务已跳过；请重新配置课程。' };
  if (!context.environmentReady) return { kind: 'skip', reason: 'environment', detail: '运行环境尚未就绪，本次任务已跳过；请在设置中检查并修复。' };
  const late = context.now > occurrence.scheduledStart;
  return { kind: 'start', endsAt: occurrence.endsAt, late, detail: late ? '已补开本次剩余时间，结束时间保持原计划。' : '已到计划时间，开始本次监控。' };
}

export function compareOccurrences(a: ScheduleOccurrence, b: ScheduleOccurrence) {
  return (a.scheduledStart ?? Infinity) - (b.scheduledStart ?? Infinity) || (a.scheduleId < b.scheduleId ? -1 : a.scheduleId > b.scheduleId ? 1 : 0);
}
export function nextOccurrences(schedule: ScheduleConfig, now: number, count = 3): ScheduleOccurrence[] {
  const threshold = Math.max(now, schedule.effectiveFrom);
  const localNow = partsAt(formatter(schedule.timeZone), threshold);
  const repeat = schedule.recurrence;
  const first = repeat.kind === 'once' ? repeat.date : repeat.startDate > localNow.date ? repeat.startDate : localNow.date;
  if (first > '2100-12-31') return [];
  const last = repeat.kind === 'once' ? first : addLocalDays(first, 35) > '2100-12-31' ? '2100-12-31' : addLocalDays(first, 35);
  const result: ScheduleOccurrence[] = [];
  for (let date = first; date <= last; date = addLocalDays(date, 1)) {
    const item = occurrenceOnDate(schedule, date);
    if (item && (item.scheduledStart === null ? item.localDate > localNow.date || item.localDate === localNow.date && item.localTime >= localNow.time : item.scheduledStart >= threshold)) result.push(item);
    if (result.length >= Math.max(1, Math.min(5, count))) break;
  }
  return result;
}
export function formatScheduleTime(millis: number, zone: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(millis);
}

export interface ScheduledRun {
  key: string; scheduleId: string; courseId: string; courseName: string; localDate: string; timeZone: string;
  scheduledStart: number | null; endsAt: number | null; at: number; updatedAt: number;
  status: 'claimed' | 'started' | 'skipped' | 'failed'; detail: string; sessionId?: string;
}
export const scheduledRunSchema = z.object({
  key:z.string().min(1).max(250),scheduleId:z.string().uuid(),courseId:z.string().uuid(),courseName:z.string().max(160),
  localDate:localDateSchema,timeZone:z.string().min(1).max(100).refine(zone=>{try{canonicalTimeZone(zone);return true;}catch{return false;}}),scheduledStart:z.number().finite().nullable(),endsAt:z.number().finite().nullable(),
  at:z.number().finite(),updatedAt:z.number().finite(),status:z.enum(['claimed','started','skipped','failed']),detail:z.string().max(1000),sessionId:z.string().uuid().optional(),
});
