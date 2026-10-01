import { z } from 'zod';
export const courseSchema = z.object({
  id: z.string().uuid(), remoteId: z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(160), url: z.string().url(),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  locationName: z.string().trim().max(120).optional(),
  accuracy: z.number().finite().min(1).max(10000).default(10),
  durationMinutes: z.number().int().min(1).max(720), mode: z.enum(['auto-a', 'notify']),
});
export function validateCourse(input: unknown, origin: string) {
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0]);
    const messages: Record<string,string> = {name:'请填写课程名称（最多 160 个字）。',url:'请填写有效的 iClicker 课程链接。',remoteId:'无法识别课程，请重新导入或检查课程链接。',latitude:'纬度应在 -90 到 90 之间。',longitude:'经度应在 -180 到 180 之间。',durationMinutes:'课程时长应为 1 到 720 之间的整数。',mode:'请选择答题方式。',locationName:'教室名称最多 120 个字。',accuracy:'位置精度应在 1 到 10000 米之间。'};
    throw new Error(messages[field] || '课程配置无法保存，请检查填写内容。');
  }
  const course = parsed.data;
  const url = new URL(course.url);
  if (url.origin !== origin || ![url.pathname, url.hash.replace(/^#/, '')].some(p => new RegExp(`^/course/${course.remoteId}(?:/|$)`).test(p))) {
    throw new Error('课程链接必须指向当前 iClicker 课程。请重新导入课程。');
  }
  return course;
}
