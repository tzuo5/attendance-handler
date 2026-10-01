import React from 'react';
import type { EnvironmentReport, HelpTarget } from '../shared/types';

export function EnvironmentPanel({report,busy,onCheck,onHelp}:{report?:EnvironmentReport;busy:boolean;onCheck():void;onHelp(target:HelpTarget):void}){
  return <section className="panel environment-panel" aria-label="环境检查"><div className="section-heading"><h2>环境检查</h2><button className="secondary" disabled={busy} onClick={onCheck}>{busy?'正在检查…':report?'重新检查':'开始检查'}</button></div>
    <p>检查这台电脑是否准备好上课。专用浏览器使用单独的资料，不会更改你的日常 Chrome。</p>
    {report?<><ul>{report.items.map(item=><li key={item.id} className={`check-${item.status}`}><div><strong>{item.label}</strong><span>{item.status==='passed'?'通过':item.status==='action'?'需要处理':'尚未验证'}</span></div><p>{item.detail}</p>{item.help&&<button className="text-button" onClick={()=>onHelp(item.help!)}>{item.help==='chrome'?'下载 Chrome':'打开数据文件夹'}</button>}</li>)}</ul><small>上次检查：{new Date(report.checkedAt).toLocaleString('zh-CN')}</small></>:<p className="hint">尚未验证。点击“开始检查”即可查看需要准备什么。</p>}
  </section>;
}
