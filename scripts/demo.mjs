import { createMockClassroom } from './mock-classroom.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const mock = await createMockClassroom(43891);
console.log(`模拟课堂已启动：${mock.origin}`);
const child = spawn('node_modules/.bin/electron', ['.'], { stdio: 'inherit', env: { ...process.env, ATTENDANCE_DEMO: '1', ATTENDANCE_ORIGIN: mock.origin, ATTENDANCE_DATA_DIR: resolve('.demo-data') } });
child.on('exit', async code => { await mock.close(); process.exit(code || 0); });
process.on('SIGINT', () => child.kill('SIGTERM'));
