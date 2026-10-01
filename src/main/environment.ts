import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvironmentItem, EnvironmentReport } from '../shared/types';

export interface EnvironmentDependencies {
  supported():boolean;
  chrome():Promise<string|undefined>;
  writable():Promise<void>;
  encryption():boolean;
  connect():Promise<void>;
}
export async function checkEnvironment(deps:EnvironmentDependencies):Promise<EnvironmentReport> {
  const items:EnvironmentItem[]=[];
  const supported=deps.supported();
  items.push({id:'platform',label:'系统版本',status:supported?'passed':'action',detail:supported?'当前系统可以运行课堂助手。':'请使用 macOS 13 或更新版本，或 Windows 10/11 的 64 位版本。'});
  let chrome=false;
  try{chrome=!!await deps.chrome();}catch{}
  items.push({id:'chrome',label:'Google Chrome',status:chrome?'passed':'action',detail:chrome?'已找到 Google Chrome。':'请先安装 Google Chrome。Mac 上请放进“应用程序”文件夹，Windows 上请为当前用户或所有用户安装。',help:chrome?undefined:'chrome'});
  let writable=false;
  try{await deps.writable();writable=true;}catch{}
  items.push({id:'storage',label:'本机数据保存',status:writable?'passed':'action',detail:writable?'课程和配置可以保存在这台电脑。':'无法保存课程。请检查磁盘剩余空间，以及数据文件夹的读写权限，然后重新检查。',help:writable?undefined:'data'});
  let encryption=false;
  try{encryption=deps.encryption();}catch{}
  items.push({id:'encryption',label:'登录状态的安全保存',status:encryption?'passed':'action',detail:encryption?'系统支持加密保存。Mac 首次保存时可能需要在系统提示中授权；本项尚未验证实际登录状态的保存。':'系统安全存储不可用。请使用自己的系统账户，解锁系统钥匙串或重启电脑后再检查。'});
  if(!supported || !chrome || !writable)items.push({id:'browser',label:'专用课堂浏览器',status:'unverified',detail:'先处理上面的问题，再检查课堂浏览器的连接。'});
  else{
    try{await deps.connect();items.push({id:'browser',label:'专用课堂浏览器',status:'passed',detail:'专用浏览器已连接，日常 Chrome 资料不受影响。'});}
    catch{items.push({id:'browser',label:'专用课堂浏览器',status:'action',detail:'暂时无法连接。关闭课堂助手的专用 Chrome 窗口后重新检查；日常 Chrome 可以继续使用。'});}
  }
  return{checkedAt:Date.now(),items};
}
export async function checkDataWritable(directory:string){
  const temporary=await mkdtemp(join(directory,'.environment-check-'));
  try{await writeFile(join(temporary,'probe'),'check',{mode:0o600});}
  finally{await rm(temporary,{recursive:true,force:true});}
}
