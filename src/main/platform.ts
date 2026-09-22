import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const nativeHelperName = process.platform === 'win32' ? 'attendance-native.exe' : 'attendance-native';

export async function launchChrome(profile: string) {
  const candidates = process.platform === 'darwin' ? ['/Applications/Google Chrome.app']
    : process.platform === 'win32' ? [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .filter((root): root is string => !!root).map(root => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      : [];
  let chrome: string | undefined;
  for (const candidate of candidates) {
    try { await access(candidate); chrome = candidate; break; } catch { /* Try the next standard install location. */ }
  }
  if (!chrome) throw new Error(process.platform === 'darwin' ? '未找到 Google Chrome，请先安装到 Applications。' : '未找到 Google Chrome，请先为当前用户或所有用户安装 Google Chrome。');
  const args = [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--no-startup-window', '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
  if (process.platform === 'darwin') {
    await exec('/usr/bin/open', ['-g', '-n', '-a', chrome, '--args', ...args]);
  } else {
    // No shell or console window. The app closes this dedicated process on exit.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(chrome, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
}

export async function activateChrome(helper: string, pid: number) {
  await exec(helper, ['activate', String(pid)], { windowsHide: true, timeout: 5000 });
}
