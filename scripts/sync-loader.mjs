import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.argv[2] || path.join(project, '../Wanderhaym-Loader-Kit'));
const destination = path.join(project, 'static/wanderhaym-loader');
const version = await readFile(path.join(source, 'VERSION.txt'), 'utf8');
if (!version.includes('Version: 1.0.2')) throw new Error('Update the integration version before importing another Loader Kit release.');
const names = ['wanderhaym-loader.js', 'wanderhaym-loader.css', 'LICENSE', 'VERSION.txt', 'README.md'];
const frames = (await readdir(path.join(source, 'assets'))).filter((name) => /\.(webp|wav)$/.test(name));
if (frames.length !== 12) throw new Error('Expected all 12 approved media files');
names.push(...frames.map((name) => 'assets/' + name));
for (const name of names) {
  const target = path.join(destination, name);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(source, name), target);
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  if (hash(await readFile(target)) !== hash(await readFile(path.join(source, name)))) throw new Error('Copy mismatch: ' + name);
}
console.log(`Loader 1.0.2: ${names.length} files synchronized and SHA-256 verified.`);
