import { z } from 'zod';

export const UPDATE_SITE = 'https://tzuo5.github.io/attendance-handler/';
export const UPDATE_TIMEOUT_MS = 3000;
export const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const version = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const releaseUrl = z.string().url().refine(value => value.startsWith('https://github.com/tzuo5/attendance-handler/releases/'));
export const releaseManifestSchema = z.object({
  schemaVersion: z.literal(1), version, publishedAt: z.string().datetime(), releaseUrl,
  downloads: z.object({ mac: releaseUrl, windows: releaseUrl }),
  updates: z.object({ macAppcast: releaseUrl, windowsFeed: releaseUrl }).optional(),
}).strict().superRefine((value, context) => {
  const base = `https://github.com/tzuo5/attendance-handler/releases/download/v${value.version}/`;
  if (value.releaseUrl !== `https://github.com/tzuo5/attendance-handler/releases/tag/v${value.version}` ||
    !Object.values(value.downloads).every(url => url.startsWith(base)) ||
    (value.updates && (value.updates.macAppcast !== `${base}appcast.xml` || value.updates.windowsFeed !== base))) {
    context.addIssue({ code: 'custom', message: 'Release URLs do not match the version' });
  }
});
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error' | 'unsupported';
export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  release?: ReleaseManifest;
  checkedAt?: number;
  progress?: number;
  detail?: string;
  supported: boolean;
}
export function newerVersion(candidate: string, current: string): boolean {
  if (!version.safeParse(candidate).success || !version.safeParse(current).success) return false;
  const a = candidate.split('.').map(BigInt), b = current.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
