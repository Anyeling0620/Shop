// 把 dist 发布到 web-app 静态目录。只清构建产物，保留 img/ 与老页面。
// web-app 若从 target/classes 运行，同时同步一份，否则线上仍读到旧副本。
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
// 默认 ../web-app；可选参数覆盖（worktree 里跑时要指向主仓库的真实静态目录）
const staticDir = process.argv[2] ? resolve(process.argv[2])
  : join(root, '..', 'web-app', 'src', 'main', 'resources', 'static');
const classesStatic = staticDir.replace(/src[\\/]main[\\/]resources[\\/]static$/, 'target/classes/static');

if (!existsSync(dist)) {
  console.error('dist 不存在，先执行 node build.mjs');
  process.exit(1);
}

// 只清自己的产物；img/、bootstrap/、js/、layer/ 与老 *.html 一律不碰。
const OWNED = ['assets', 'index.html', 'list', 'product', 'cart', 'order', 'seckill', 'login', 'page'];
for (const name of OWNED) {
  rmSync(join(staticDir, name), { recursive: true, force: true });
}
mkdirSync(staticDir, { recursive: true });
cpSync(dist, staticDir, { recursive: true });

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    n += statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

const summary = `deploy: ${countFiles(dist)} files -> ${staticDir}`;

if (classesStatic !== staticDir && existsSync(classesStatic)) {
  for (const name of OWNED) {
    rmSync(join(classesStatic, name), { recursive: true, force: true });
  }
  cpSync(dist, classesStatic, { recursive: true });
  console.log(summary);
  console.log(`deploy: synced -> ${classesStatic}`);
} else {
  console.log(summary);
}
