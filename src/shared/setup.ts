import { SETUP_STEPS, type SetupState, type SetupAction } from './types';

export const initialSetup = (hasCourses = false): SetupState => hasCourses
  ? { step: 'complete', completedSteps: [...SETUP_STEPS], dismissed: true, completedAt: Date.now() }
  : { step: 'environment', completedSteps: [], dismissed: false };

export function restoreSetup(value: unknown, hasCourses: boolean): SetupState {
  if (!value || typeof value !== 'object') return initialSetup(hasCourses);
  const saved = value as Partial<SetupState>;
  if (!SETUP_STEPS.includes(saved.step!) || !Array.isArray(saved.completedSteps)) return initialSetup(hasCourses);
  return { step: saved.step!, completedSteps: saved.completedSteps.filter(step => SETUP_STEPS.includes(step)), dismissed: saved.dismissed === true,
    completedAt: typeof saved.completedAt === 'number' && Number.isFinite(saved.completedAt) ? saved.completedAt : undefined };
}

export function advanceSetup(current: SetupState, action: SetupAction, facts: { environment: boolean; login: boolean; courses: number }): SetupState {
  const next = { ...current, completedSteps: [...current.completedSteps] };
  if (action === 'dismiss') return { ...next, dismissed: true };
  if (action === 'reopen') return { ...next, dismissed: false, step: current.completedAt ? 'environment' : current.step };
  const index = SETUP_STEPS.indexOf(current.step);
  if (action === 'back') return { ...next, step: SETUP_STEPS[Math.max(0, index - 1)] };
  if (action === 'finish' && current.step !== 'complete') throw new Error('请先完成当前配置步骤。');
  if ((current.step === 'environment' || action === 'finish') && !facts.environment) throw new Error('请先重新检查环境，处理“需要处理”的项目。');
  if ((current.step === 'login' || action === 'finish') && !facts.login) throw new Error('登录尚未确认，请打开登录窗口完成学校验证后重试。');
  if ((current.step === 'course' || action === 'finish') && !facts.courses) throw new Error('请先保存至少一门课程。');
  if (action === 'finish') return { ...next, dismissed: true, completedAt: Date.now() };
  if (current.step === 'complete') throw new Error('请点击“完成配置”。');
  if (!next.completedSteps.includes(current.step)) next.completedSteps.push(current.step);
  return { ...next, step: SETUP_STEPS[index + 1], dismissed: false };
}
