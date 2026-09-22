export type AnswerMode = 'auto-a' | 'notify';
export interface RemoteCourse { remoteId: string; name: string; url: string; }
export interface CourseConfig extends RemoteCourse {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  durationMinutes: number;
  mode: AnswerMode;
}
export type SessionStatus = 'starting' | 'waiting' | 'monitoring' | 'needs-answer' | 'needs-login' | 'window-closed' | 'offline' | 'attention' | 'stopped' | 'completed';
export interface QuestionSnapshot {
  key: string;
  stable: boolean;
  kind: 'single' | 'other';
  open: boolean;
  answered: boolean;
  selected: boolean;
  hasA: boolean;
  title: string;
}
export interface PageSnapshot {
  state: 'login' | 'waiting' | 'joinable' | 'classroom' | 'offline' | 'unknown';
  courseId?: string;
  attendance: 'unknown' | 'pending' | 'confirmed';
  question?: QuestionSnapshot;
  detail?: string;
}
export interface SessionState {
  id: string;
  course: CourseConfig;
  startedAt: number;
  endsAt: number;
  status: SessionStatus;
  lastCheckedAt?: number;
  attendance: PageSnapshot['attendance'];
  question?: QuestionSnapshot;
  handled: Record<string, 'attempted' | 'confirmed'>;
  detail: string;
}
export interface LogEntry { id: string; at: number; level: 'info' | 'success' | 'warning' | 'error'; message: string; }
export interface AppState {
  courses: CourseConfig[];
  session: SessionState | null;
  logs: LogEntry[];
  browserConnected: boolean;
  demo: boolean;
  notificationError?: string;
}
export interface AttendanceAPI {
  getState(): Promise<AppState>;
  saveCourse(course: CourseConfig): Promise<AppState>;
  deleteCourse(id: string): Promise<AppState>;
  login(): Promise<void>;
  importCourses(): Promise<RemoteCourse[]>;
  start(id: string): Promise<void>;
  stop(): Promise<void>;
  showClassroom(): Promise<void>;
  minimizeClassroom(): Promise<void>;
  testNotification(): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
}
export const ACTIVE = (session: SessionState | null): session is SessionState => !!session && !['stopped', 'completed'].includes(session.status);
export const STATUS_LABELS: Record<SessionStatus, string> = {
  starting: '正在连接课堂', waiting: '等待老师开课', monitoring: '正在监控', 'needs-answer': '有题目待作答',
  'needs-login': '需要重新登录', 'window-closed': '课堂窗口已关闭', offline: '等待网络恢复', attention: '需要检查页面', stopped: '已结束', completed: '课程时间已到',
};
