export type AnswerMode = 'auto-a' | 'notify';
export interface RemoteCourse { remoteId: string; name: string; url: string; }
export interface CourseConfig extends RemoteCourse {
  id: string;
  locationName?: string;
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
export interface SessionQuestion {
  key: string; title: string; kind: QuestionSnapshot['kind']; mode: AnswerMode;
  firstSeenAt: number; lastSeenAt: number; closedAt?: number; attemptedAt?: number; confirmedAt?: number;
}
export interface SessionSummary {
  id: string; courseId: string; courseName: string; startedAt: number; endedAt: number; plannedEndsAt: number;
  reason: 'manual' | 'expired' | 'interrupted'; attendance: PageSnapshot['attendance']; attendanceConfirmedAt?: number;
  observedQuestionCount: number; confirmedAnswerCount: number; pendingAttemptCount: number; unconfirmedQuestionCount: number;
  hadInterruptions: boolean; questions: SessionQuestion[];
}
export interface SessionState {
  id: string;
  course: CourseConfig;
  startedAt: number;
  endsAt: number;
  status: SessionStatus;
  lastCheckedAt?: number;
  lastSuccessfulCheckAt?: number;
  attendanceConfirmedAt?: number;
  issue?: 'browser' | 'network' | 'page' | 'course' | 'join' | 'answer';
  attendance: PageSnapshot['attendance'];
  question?: QuestionSnapshot;
  questions?: Record<string, SessionQuestion>;
  hadInterruptions?: boolean;
  summary?: SessionSummary;
  handled: Record<string, 'attempted' | 'confirmed'>;
  detail: string;
}
export type LogEvent = 'system' | 'session-started' | 'status-changed' | 'attendance-attempted' | 'attendance-confirmed' | 'question-opened' | 'question-closed' | 'answer-attempted' | 'answer-confirmed' | 'session-extended' | 'session-ended';
export interface LogDetails {
  event?: LogEvent; sessionId?: string; courseId?: string; courseName?: string;
  questionKey?: string; questionTitle?: string; mode?: AnswerMode; status?: SessionStatus;
  result?: 'pending' | 'confirmed' | 'failed' | 'closed'; attemptedAt?: number; confirmedAt?: number;
  previousEndsAt?: number; endsAt?: number;
}
export interface LogEntry extends LogDetails { id: string; at: number; level: 'info' | 'success' | 'warning' | 'error'; message: string; }
export type HelpTarget = 'chrome' | 'data' | 'notifications';
export interface EnvironmentItem {
  id: 'platform' | 'chrome' | 'storage' | 'encryption' | 'browser';
  label: string; status: 'passed' | 'action' | 'unverified'; detail: string; help?: HelpTarget;
}
export interface EnvironmentReport { checkedAt: number; items: EnvironmentItem[]; }
export const environmentReady = (report?:EnvironmentReport) => !!report && report.items.length===5 && report.items.every(item=>item.status==='passed');
export const SETUP_STEPS = ['environment', 'login', 'course', 'notification', 'complete'] as const;
export type SetupStep = typeof SETUP_STEPS[number];
export type SetupAction = 'next' | 'back' | 'dismiss' | 'reopen' | 'finish';
export interface SetupState { step: SetupStep; completedSteps: SetupStep[]; dismissed: boolean; completedAt?: number; }
export interface LoginReport { status: 'waiting' | 'verified' | 'closed' | 'error'; checkedAt: number; detail: string; }
export interface AppState {
  courses: CourseConfig[];
  session: SessionState | null;
  logs: LogEntry[];
  summaries: SessionSummary[];
  classroomOrigin: string;
  browserConnected: boolean;
  demo: boolean;
  notificationError?: string;
  environment?: EnvironmentReport;
  setup?: SetupState;
  loginReport?: LoginReport;
}
export interface AttendanceAPI {
  getState(): Promise<AppState>;
  saveCourse(course: CourseConfig): Promise<AppState>;
  deleteCourse(id: string): Promise<AppState>;
  login(): Promise<void>;
  importCourses(): Promise<RemoteCourse[]>;
  start(id: string): Promise<void>;
  stop(): Promise<void>;
  extend(): Promise<void>;
  showClassroom(): Promise<void>;
  minimizeClassroom(): Promise<void>;
  testNotification(): Promise<void>;
  checkEnvironment(): Promise<EnvironmentReport>;
  openHelp(target: HelpTarget): Promise<void>;
  setupAction(action: SetupAction): Promise<AppState>;
  checkLogin(): Promise<LoginReport>;
  onState(listener: (state: AppState) => void): () => void;
}
export const ACTIVE = (session: SessionState | null): session is SessionState => !!session && !['stopped', 'completed'].includes(session.status);
export const STATUS_LABELS: Record<SessionStatus, string> = {
  starting: '正在连接课堂', waiting: '等待老师开课', monitoring: '监控正常', 'needs-answer': '有题目待作答',
  'needs-login': '需要重新登录', 'window-closed': '课堂窗口已关闭', offline: '正在重连', attention: '需要检查页面', stopped: '已结束', completed: '课程时间已到',
};

export function sessionPresentation(session: SessionState | null) {
  const status = session?.status;
  const tone = status === 'monitoring' ? 'success'
    : status === 'needs-answer' || status === 'needs-login' || status === 'window-closed' || status === 'offline' ? 'warning'
    : status === 'attention' ? 'error' : 'neutral';
  const action = status === 'needs-login' ? '重新登录' : status === 'window-closed' ? '恢复课堂'
    : status === 'offline' ? '立即重试' : session?.issue === 'course' ? '返回监控课程'
    : status === 'attention' ? '检查课堂' : '查看课堂';
  return { label: status ? STATUS_LABELS[status] : '等待开始上课', tone, action };
}
