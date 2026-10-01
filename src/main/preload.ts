import { contextBridge, ipcRenderer } from 'electron';
import type { AttendanceAPI, AppState } from '../shared/types';
const api: AttendanceAPI = {
  getState: () => ipcRenderer.invoke('state:get'),
  saveCourse: course => ipcRenderer.invoke('course:save', course),
  deleteCourse: id => ipcRenderer.invoke('course:delete', id),
  login: () => ipcRenderer.invoke('browser:login'),
  importCourses: () => ipcRenderer.invoke('course:import'),
  start: id => ipcRenderer.invoke('session:start', id),
  stop: () => ipcRenderer.invoke('session:stop'),
  extend: () => ipcRenderer.invoke('session:extend'),
  resumeInterrupted: () => ipcRenderer.invoke('session:resume'),
  showClassroom: () => ipcRenderer.invoke('browser:show'),
  minimizeClassroom: () => ipcRenderer.invoke('browser:minimize'),
  returnToBackground: () => ipcRenderer.invoke('browser:background'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  testNotification: () => ipcRenderer.invoke('notification:test'),
  checkEnvironment: () => ipcRenderer.invoke('environment:check'),
  openHelp: target => ipcRenderer.invoke('help:open',target),
  setupAction: action => ipcRenderer.invoke('setup:action', action),
  checkLogin: () => ipcRenderer.invoke('setup:login-check'),
  checkCourseImport: () => ipcRenderer.invoke('setup:course-import'),
  notificationChoice: choice => ipcRenderer.invoke('notification:choice', choice),
  onState: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },
};
contextBridge.exposeInMainWorld('attendance', api);
