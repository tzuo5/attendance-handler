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
  showClassroom: () => ipcRenderer.invoke('browser:show'),
  minimizeClassroom: () => ipcRenderer.invoke('browser:minimize'),
  testNotification: () => ipcRenderer.invoke('notification:test'),
  onState: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },
};
contextBridge.exposeInMainWorld('attendance', api);
