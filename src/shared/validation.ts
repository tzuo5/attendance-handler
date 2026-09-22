import { z } from 'zod';
export const courseSchema = z.object({
  id: z.string().uuid(), remoteId: z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(160), url: z.string().url(),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(1).max(10000).default(10),
  durationMinutes: z.number().int().min(1).max(720), mode: z.enum(['auto-a', 'notify']),
});
export function validateCourse(input: unknown, origin: string) {
  const course = courseSchema.parse(input);
  const url = new URL(course.url);
  if (url.origin !== origin || ![url.pathname, url.hash.replace(/^#/, '')].some(p => new RegExp(`^/course/${course.remoteId}(?:/|$)`).test(p))) {
    throw new Error('课程链接必须指向当前 iClicker 课程。请重新导入课程。');
  }
  return course;
}
