import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe,it,expect,vi } from 'vitest';
import { checkEnvironment,checkDataWritable,type EnvironmentDependencies } from '../src/main/environment';
import { environmentReady } from '../src/shared/types';

const dependencies=():EnvironmentDependencies=>({supported:()=>true,chrome:async()=>'/mock/Chrome',writable:async()=>{},encryption:()=>true,connect:vi.fn(async()=>{})});
describe('environment readiness',()=>{
  it('checks a dedicated connection and describes encryption availability without claiming a saved login',async()=>{
    const deps=dependencies();const report=await checkEnvironment(deps);
    expect(environmentReady(report)).toBe(true);expect(deps.connect).toHaveBeenCalledOnce();
    expect(report.items.find(item=>item.id==='encryption')?.detail).toContain('尚未验证实际登录');
  });
  it.each(['platform','chrome','storage'] as const)('does not launch a browser when %s needs repair',async field=>{
    const deps=dependencies();if(field==='platform')deps.supported=()=>false;
    if(field==='chrome')deps.chrome=async()=>undefined;
    if(field==='storage')deps.writable=async()=>{throw new Error('unwritable');};
    const report=await checkEnvironment(deps);
    expect(report.items.find(item=>item.id===field)?.status).toBe('action');
    expect(report.items.find(item=>item.id==='browser')?.status).toBe('unverified');
    expect(deps.connect).not.toHaveBeenCalled();expect(environmentReady(report)).toBe(false);
  });
  it('reports encryption and connection failures and allows a fresh check after repair',async()=>{
    const deps=dependencies();deps.encryption=()=>false;deps.connect=async()=>{throw new Error('cannot connect');};
    const report=await checkEnvironment(deps);
    expect(report.items.filter(item=>item.status==='action').map(item=>item.id)).toEqual(['encryption','browser']);
    expect(environmentReady(await checkEnvironment(dependencies()))).toBe(true);
  });
  it('tests a real directory without overwriting data or leaving a probe behind',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'attendance-environment-'));
    try{await writeFile(join(directory,'state.json'),'original');await checkDataWritable(directory);
      expect(await readFile(join(directory,'state.json'),'utf8')).toBe('original');
      expect(await readdir(directory)).toEqual(['state.json']);
    }finally{await rm(directory,{recursive:true,force:true});}
  });
});
