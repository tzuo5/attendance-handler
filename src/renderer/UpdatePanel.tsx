import React, { useState } from 'react';
import type { UpdateState } from '../shared/update';

export function UpdatePanel({ update }: { update?: UpdateState }) {
  const [error, setError] = useState('');
  if (!update || update.phase === 'unsupported') return null;
  const downloading = update.phase === 'downloading';
  const installing = update.phase === 'installing' || update.phase === 'ready';
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); } catch { setError('暂时无法更新，请重试或到官网下载。'); }
  };
  return <section className="update-panel" aria-label="应用更新">
    {update.release && <>
      <span className="update-version">新版本 v{update.release.version}</span>
      {downloading ? <>
        <span role="status">正在下载 {Math.floor(update.progress || 0)}%</span>
        <progress aria-label="更新下载进度" value={update.progress || 0} max={100}/>
        <button className="text-button" onClick={() => void run(() => window.attendance.cancelUpdate())}>取消下载</button>
      </> : installing ? <span role="status">正在准备安装并重启…</span> : <button className="primary full" onClick={() => void run(() => update.supported && update.release?.updates ? window.attendance.downloadUpdate() : window.attendance.openUpdatePage())}>{update.supported && update.release.updates ? '下载更新' : '前往官网下载'}</button>}
    </>}
    {!downloading && !installing && <button className="text-button" disabled={update.phase === 'checking'} onClick={() => void run(() => window.attendance.checkForUpdates())}>{update.phase === 'checking' ? '正在检查更新…' : update.phase === 'error' ? '重试检查更新' : '检查更新'}</button>}
    {update.phase === 'current' && <span className="update-detail">已是最新版</span>}
    {(update.detail || error) && <span className="update-detail" role="status">{error || (update.phase === 'error' && !update.release ? '暂时无法检查更新' : update.detail)}</span>}
  </section>;
}
