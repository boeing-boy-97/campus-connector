import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.firebase', 'hosting');
const studentBuild = resolve(root, 'apps', 'student', 'dist');
const adminBuild = resolve(root, 'apps', 'admin', 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'admin'), { recursive: true });
await cp(studentBuild, output, { recursive: true });
await cp(adminBuild, resolve(output, 'admin'), { recursive: true });

console.log(`Prepared Firebase Hosting output at ${output}`);
