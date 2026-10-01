import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ReleaseManifest } from '../shared/update';
import type { UpdateAdapter } from './updater';

export function supportsUpdates(platform: string, resources: string, executable: string): boolean {
  if (platform === 'win32') return existsSync(join(dirname(executable), 'Uninstall Attendance Handler.exe'));
  if (platform !== 'darwin') return false;
  const bundle = dirname(dirname(resources));
  try {
    accessSync(dirname(bundle), constants.W_OK);
    return !bundle.includes('/AppTranslocation/') && !bundle.startsWith('/Volumes/') && existsSync(join(resources, 'Attendance Updater.app/Contents/MacOS/attendance-updater'));
  } catch { return false; }
}

export class WindowsUpdateAdapter implements UpdateAdapter {
  constructor(private readonly testFeed?: string) {}
  private updater?: import('electron-updater').NsisUpdater;
  private cancellation?: import('builder-util-runtime').CancellationToken;
  async download(release: ReleaseManifest, progress: (percent: number) => void, signal: AbortSignal) {
    const { NsisUpdater } = await import('electron-updater');
    const { CancellationToken } = await import('builder-util-runtime');
    if (signal.aborted) throw new Error('已取消下载。');
    this.updater = new NsisUpdater({ provider: 'generic', url: this.testFeed || release.updates!.windowsFeed });
    this.updater.disableDifferentialDownload = true;
    this.updater.autoDownload = false; this.updater.autoInstallOnAppQuit = false; this.updater.allowDowngrade = false;
    const trace = (...values: unknown[]) => process.stderr.write('update-test: ' + values.map(String).join(' ') + '\n');
    this.updater.logger = this.testFeed ? { info: trace, warn: trace, error: trace, debug: trace } : null;
    // Errors are handled by the awaited methods, without an unhandled EventEmitter error.
    this.updater.on('error', () => {});
    this.updater.on('download-progress', value => progress(value.percent));
    this.cancellation = new CancellationToken();
    const cancel = () => this.cancellation?.cancel(); signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await this.updater.checkForUpdates();
      if (signal.aborted) throw new Error('已取消下载。');
      if (result?.updateInfo.version !== release.version) throw new Error('更新版本信息发生变化，请重新检查更新。');
      await this.updater.downloadUpdate(this.cancellation);
      if (signal.aborted) throw new Error('已取消下载。');
    } finally { signal.removeEventListener('abort', cancel); }
  }
  async install() {
    if (!this.updater) throw new Error('更新尚未下载。');
    const updater = this.updater;
    await new Promise<void>((resolve, reject) => {
      const error = () => { clearTimeout(timer); reject(new Error('无法启动更新安装程序，请重试。')); };
      const timer = setTimeout(() => { updater.removeListener('error', error); reject(new Error('更新安装程序启动超时。')); }, 10000);
      updater.once('error', error);
      void import('electron').then(({ autoUpdater }) => {
        autoUpdater.once('before-quit-for-update', () => { clearTimeout(timer); updater.removeListener('error', error); resolve(); });
        updater.quitAndInstall(true, true);
      }).catch(error);
    });
  }
  cancel() { this.cancellation?.cancel(); }
}

export class MacUpdateAdapter implements UpdateAdapter {
  private child?: ChildProcessWithoutNullStreams;
  private ready = false;
  private rejectDownload?: (error: Error) => void;
  private rejectInstall?: (error: Error) => void;
  private resolveInstall?: () => void;
  constructor(private readonly resources: string, private readonly testFeed?: string) {}
  async download(release: ReleaseManifest, progress: (percent: number) => void, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error('已取消下载。');
    this.cancel(); this.ready = false;
    const executable = join(this.resources, 'Attendance Updater.app/Contents/MacOS/attendance-updater');
    const bundle = dirname(dirname(this.resources));
    const child = spawn(executable, [bundle, this.testFeed ? this.testFeed + 'appcast.xml' : release.updates!.macAppcast, release.version], { stdio: ['pipe', 'pipe', 'pipe'], env: this.testFeed ? { ...process.env, ATTENDANCE_UPDATE_TEST: '1' } : process.env });
    this.child = child;
    // Native errors can exit before the controller sends its cancel command.
    // An EPIPE on this stream must not become an Electron fatal-error dialog.
    child.stdin.on('error', () => {
      if (this.child !== child) return;
      const error = new Error('无法与 macOS 更新辅助程序通信，请重试。');
      this.rejectDownload?.(error); this.rejectInstall?.(error);
    });
    // Sparkle diagnostics may include local paths. Only structured status enters AppState.
    if (this.testFeed) child.stderr.on('data', bytes => process.stderr.write('update-test: ' + bytes.toString()));
    else child.stderr.resume();
    return new Promise((resolve, reject) => {
      this.rejectDownload = reject;
      const cancel = () => this.cancel(); signal.addEventListener('abort', cancel, { once: true });
      const finish = () => { signal.removeEventListener('abort', cancel); this.rejectDownload = undefined; };
      createInterface({ input: child.stdout }).on('line', line => {
        if (this.child !== child || line.length > 8192) return;
        try {
          const event = JSON.parse(line);
          if (event.event === 'progress' && Number.isFinite(event.percent)) progress(event.percent);
          else if (event.event === 'ready') { this.ready = true; finish(); resolve(); }
          else if (event.event === 'installing') { this.resolveInstall?.(); this.resolveInstall = undefined; this.rejectInstall = undefined; child.unref(); }
          else if (event.event === 'error') {
            const error = new Error('macOS 更新失败，请检查网络、安装位置或系统权限后重试。');
            finish(); reject(error); this.rejectInstall?.(error);
          }
        } catch { /* Ignore non-protocol diagnostics. */ }
      });
      child.on('error', () => { finish(); reject(new Error('无法启动 macOS 更新辅助程序。')); });
      child.on('exit', code => {
        finish();
        if (this.child === child) {
          this.child = undefined;
          if (!this.ready || code !== 0) reject(new Error('macOS 更新未完成，请重试。'));
          this.rejectInstall?.(new Error('macOS 更新安装未完成，请重试。'));
          this.rejectInstall = undefined;
        }
      });
    });
  }
  async install() {
    if (!this.child || !this.ready) throw new Error('更新尚未准备完成。');
    const child = this.child;
    await new Promise<void>((resolve, reject) => {
      this.resolveInstall = resolve; this.rejectInstall = reject;
      child.stdin.write('install\n', error => { if (error) reject(new Error('无法交接更新安装。')); });
    });
  }
  cancel() {
    this.rejectDownload?.(new Error('已取消下载。')); this.rejectDownload = undefined;
    this.rejectInstall?.(new Error('已取消安装。')); this.rejectInstall = undefined;
    if (this.child) {
      const child = this.child; child.stdin.write('cancel\n', () => {}); this.child = undefined;
      // Let the native driver cancel Sparkle's staged installer before exiting.
      child.unref();
    }
    this.ready = false;
  }
}
