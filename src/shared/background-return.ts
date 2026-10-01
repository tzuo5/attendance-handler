import type { PageSnapshot } from './types';

// Restarting Chrome discards in-page drafts. Only a recognized current course
// with no unconfirmed open question is safe to move back into headless mode.
export function backgroundReturnIssue(page: PageSnapshot, courseId: string): string | undefined {
  if (page.state === 'login') return '请先完成登录或学校验证，再查看当前课堂。';
  if (page.state === 'offline') return '网络尚未恢复，请保留课堂窗口并稍后重试。';
  if (page.state === 'unknown') return '尚未识别课堂页面，请检查页面后重试；当前窗口已保留。';
  if (page.detail) return `${page.detail} 请处理后再返回后台。`;
  if (page.courseId !== courseId) return '请先点击“查看课堂”返回正在监控的课程。';
  if (page.question?.open && !page.question.answered) return '当前题目尚未收到答案确认。请完成作答并等待网站回执，再返回后台；未提交内容已留在窗口中。';
}
