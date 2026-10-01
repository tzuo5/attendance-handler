import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CourseConfig, RemoteCourse } from '../shared/types';
import { parseCoordinatePair } from '../shared/course-form';
import { validateCourse } from '../shared/validation';
import { Icon } from './Icon';

type Props = { initial:Partial<CourseConfig>; imported:RemoteCourse[]; courses:CourseConfig[]; origin:string; onClose():void; onSave(course:CourseConfig):Promise<void>; onImport():Promise<void> };
export function CourseForm({initial,imported,courses,origin,onClose,onSave,onImport}:Props) {
  const [name,setName]=useState(initial.name || '');
  const [url,setUrl]=useState(initial.url || '');
  const [lat,setLat]=useState(initial.latitude?.toString() || '');
  const [lon,setLon]=useState(initial.longitude?.toString() || '');
  const [locationName,setLocationName]=useState(initial.locationName || '');
  const [accuracy,setAccuracy]=useState(initial.accuracy || 10);
  const [coordinates,setCoordinates]=useState('');
  const [duration,setDuration]=useState(String(initial.durationMinutes || 50));
  const [customDuration,setCustomDuration]=useState(!['50','75','90'].includes(String(initial.durationMinutes || 50)));
  const [mode,setMode]=useState(initial.mode || '');
  const [remoteId,setRemoteId]=useState('');
  const [showDetails,setShowDetails]=useState(!initial.id && !imported.length);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const dialog=useRef<HTMLElement>(null);
  const nameInput=useRef<HTMLInputElement>(null);
  const visibleInputs=()=>[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(element=>element.getClientRects().length>0 && (element.tagName==='SUMMARY' || !element.closest('details:not([open])')));
  useLayoutEffect(()=>{
    const previous=document.activeElement as HTMLElement;
    const elements=visibleInputs();
    (elements.includes(nameInput.current!) ? nameInput.current : elements.find(element=>element.tagName==='SELECT') || elements[0])?.focus();
    return ()=>{if(previous?.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{
    if(initial.id || remoteId || !imported.length)return;
    const first=imported.find(course=>!courses.some(existing=>existing.remoteId===course.remoteId));
    if(first){setRemoteId(first.remoteId);setName(first.name);setUrl(first.url);setShowDetails(false);}
  },[imported,initial.id,remoteId,courses]);
  useEffect(()=>{
    const field=Object.keys(errors)[0];
    if(field)document.getElementById(`course-${field}`)?.focus();
  },[errors,showDetails]);
  const fieldError=(field:string)=>errors[field] && <span className="field-error" id={`error-${field}`} role="alert">{errors[field]}</span>;
  const labels:Record<string,string>={name:'课程名称',url:'iClicker 课程链接',latitude:'纬度 Latitude',longitude:'经度 Longitude',coordinates:'粘贴坐标（纬度，经度）',duration:'课程时长（分钟）'};
  const fieldProps=(field:string)=>({'aria-label':labels[field],id:`course-${field}`,'aria-invalid':!!errors[field],'aria-describedby':errors[field]?`error-${field}`:undefined});
  const applyCoordinates=()=>{
    try {const point=parseCoordinatePair(coordinates);setLat(String(point.latitude));setLon(String(point.longitude));setErrors({});}
    catch(e){setErrors({coordinates:(e as Error).message});}
  };
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setError('');
    const invalid:Record<string,string>={};
    let parsed:URL|undefined;let id='';
    try {parsed=new URL(url);id=`${parsed.pathname}${parsed.hash}`.match(/\/course\/([A-Za-z0-9_-]+)/)?.[1] || '';}
    catch {invalid.url='请填写有效的 iClicker 课程链接。';}
    if(parsed && (parsed.origin!==origin || !id))invalid.url='请使用当前 iClicker 的课程链接，或重新导入课程。';
    if(!name.trim())invalid.name='请填写课程名称。';
    if(!lat.trim() || !Number.isFinite(Number(lat)) || Number(lat)<-90 || Number(lat)>90)invalid.latitude='请填写 -90 到 90 之间的纬度。';
    if(!lon.trim() || !Number.isFinite(Number(lon)) || Number(lon)<-180 || Number(lon)>180)invalid.longitude='请填写 -180 到 180 之间的经度。';
    if(!Number.isInteger(Number(duration)) || Number(duration)<1 || Number(duration)>720)invalid.duration='课程时长应为 1 到 720 之间的整数。';
    if(mode!=='auto-a' && mode!=='notify')invalid.mode='请选择答题方式。';
    if(courses.some(course=>course.remoteId===id && course.id!==initial.id) && (!initial.id || initial.remoteId!==id))invalid.url='这门课已经添加，请在课程列表中编辑原有课程。';
    setErrors(invalid);
    if(Object.keys(invalid).length){if(invalid.name || invalid.url)setShowDetails(true);return;}
    setSaving(true);
    try {
      const course=validateCourse({id:initial.id || crypto.randomUUID(),remoteId:id,name,url,latitude:Number(lat),longitude:Number(lon),locationName,accuracy,durationMinutes:Number(duration),mode},origin);
      await onSave(course);
    }catch(e){setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}
    finally{setSaving(false);}
  };
  const locations=[...new Map(courses.filter(course=>course.locationName).map(course=>[`${course.locationName}:${course.latitude}:${course.longitude}`,course])).values()];
  return <div className="modal-backdrop"><section className="modal panel" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="form-title" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();if(!saving)onClose();}
    if(event.key==='Tab'){const elements=visibleInputs();const first=elements[0],last=elements.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
  }}><div className="modal-header"><div><div className="eyebrow">COURSE DETAILS</div><h2 id="form-title">{initial.id?'编辑课程':'添加课程'}</h2></div><button className="icon-button" aria-label="关闭" disabled={saving} onClick={onClose}><Icon name="close"/></button></div>
  <form onSubmit={submit} noValidate><fieldset disabled={saving} className="course-fields">
    {!initial.id && <div className="import-row">{imported.length ? <><label>选择已加入的课程<select aria-label="选择已加入的课程" value={remoteId} onChange={e=>{const course=imported.find(c=>c.remoteId===e.target.value);if(course){setRemoteId(course.remoteId);setName(course.name);setUrl(course.url);setShowDetails(false);setErrors({});}}}><option value="" disabled>选择课程</option>{imported.map(course=><option value={course.remoteId} key={course.remoteId} disabled={courses.some(existing=>existing.remoteId===course.remoteId)}>{course.name}{courses.some(existing=>existing.remoteId===course.remoteId)?'（已添加）':''}</option>)}</select></label>{imported.every(course=>courses.some(existing=>existing.remoteId===course.remoteId)) && <p className="field-hint">导入的课程已全部添加，可以返回课程列表编辑。</p>}</> : <button type="button" className="secondary full" onClick={async()=>{setSaving(true);setError('');try{await onImport();}catch(e){setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}finally{setSaving(false);}}}><Icon name="browser" size={16}/>从 iClicker 导入课程</button>}</div>}
    <details className="course-details" open={showDetails} onToggle={event=>setShowDetails(event.currentTarget.open)}><summary>{name && url ? `${name} · 名称与链接` : '手动填写课程名称与链接'}</summary>
      <label>课程名称<input {...fieldProps('name')} ref={nameInput} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="请输入课程名称"/>{fieldError('name')}</label>
      <label>iClicker 课程链接<input {...fieldProps('url')} type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder={`${origin}/#/course/…/overview`}/>{fieldError('url')}</label>
    </details>
    {locations.length>0 && <label>复用已保存的教室<select aria-label="复用已保存的教室" defaultValue="" onChange={e=>{const course=locations.find(c=>c.id===e.target.value);if(course){setLat(String(course.latitude));setLon(String(course.longitude));setLocationName(course.locationName || '');setAccuracy(course.accuracy);}}}><option value="">选择教室，或在下面填写新位置</option>{locations.map(course=><option key={course.id} value={course.id}>{course.locationName} · {course.name}</option>)}</select></label>}
    <label>教室名称（可选）<input maxLength={120} value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder="填写后可在其他课程中复用位置"/></label>
    <label>粘贴坐标（纬度，经度）<div className="coordinate-paste"><input {...fieldProps('coordinates')} value={coordinates} onChange={e=>setCoordinates(e.target.value)} placeholder="粘贴两个坐标，用逗号或空格分隔"/><button type="button" className="secondary" onClick={applyCoordinates}>填入坐标</button></div>{fieldError('coordinates')}</label>
    <div className="form-grid"><label>纬度 Latitude<input {...fieldProps('latitude')} type="number" step="any" value={lat} onChange={e=>setLat(e.target.value)}/>{fieldError('latitude')}</label><label>经度 Longitude<input {...fieldProps('longitude')} type="number" step="any" value={lon} onChange={e=>setLon(e.target.value)}/>{fieldError('longitude')}</label></div>
    <p className="field-hint">填写你确认过的课堂位置。课程列表会隐藏坐标。</p>
    <div className="form-grid"><label>常用时长<select aria-label="常用时长" value={customDuration?'custom':duration} onChange={e=>{setCustomDuration(e.target.value==='custom');if(e.target.value!=='custom')setDuration(e.target.value);else document.getElementById('course-duration')?.focus();}}><option value="50">50 分钟</option><option value="75">75 分钟</option><option value="90">90 分钟</option><option value="custom">自定义时长</option></select></label><label>课程时长（分钟）<input {...fieldProps('duration')} type="number" value={duration} onChange={e=>{setDuration(e.target.value);setCustomDuration(!['50','75','90'].includes(e.target.value));}}/>{fieldError('duration')}</label></div>
    <fieldset className="answer-choices"><legend id="course-mode" tabIndex={-1}>答题方式</legend><label><input type="radio" name="answer-mode" aria-label="自动选择 A" checked={mode==='auto-a'} onChange={()=>setMode('auto-a')}/><span><strong>自动选择 A</strong><small>适用于只计参与的课程；其他题型会提醒你处理。</small></span></label><label><input type="radio" name="answer-mode" aria-label="提醒我手动作答" checked={mode==='notify'} onChange={()=>setMode('notify')}/><span><strong>提醒我手动作答</strong><small>适用于计正确率的课程；未作答时每 30 秒提醒。</small></span></label>{fieldError('mode')}</fieldset>
  </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={onClose}>取消</button><button type="submit" className="primary" disabled={saving}>{saving?'正在保存…':'保存课程'}</button></div></form></section></div>;
}
