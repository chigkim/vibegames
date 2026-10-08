// Extracts every released version of Multiplication with Ms. Menna from git history into upgrade-tests/vers/,
// each with the libs it loaded, and lists them oldest first in vers/list.txt ("v12 ac4f7fb").
// Usage: node upgrade-tests/build-versions.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GAME = 'multiplication-ms-menna.html';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'vers');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

fs.rmSync(OUT, { recursive: true, force: true });
const list = [];
const commits = git('log', '--reverse', '--format=%h', '--', GAME).toString().trim().split(/\s+/);
for (const commit of commits) {
  const html = git('show', `${commit}:${GAME}`).toString();
  const version = 'v' + ((html.match(/\bv(\d+) ?(?:-|·|&middot;|Updated)/) || [])[1] || '0');
  // Two commits may share a version number (v16 had two review fixes): the later one gets a "b".
  let name = version;
  while (list.some(l => l.name === name)) name += 'b';
  const dir = path.join(OUT, name);
  fs.mkdirSync(path.join(dir, 'libs'), { recursive: true });
  fs.writeFileSync(path.join(dir, GAME), html);
  for (const [, lib] of html.matchAll(/<script src="\.\/(libs\/[^"]+)"/g)) fs.writeFileSync(path.join(dir, lib), git('show', `${commit}:${lib}`));
  list.push({ name, commit });
}
fs.writeFileSync(path.join(OUT, 'list.txt'), list.map(l => `${l.name} ${l.commit}`).join('\n') + '\n');
console.log(`${list.length} versions in ${OUT}: ${list.map(l => l.name).join(' ')}`);
