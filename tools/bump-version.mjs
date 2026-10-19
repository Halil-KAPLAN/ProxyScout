// Sürüm numarasını artırır (manifest.json ve package.json birlikte).
// Kullanım: node tools/bump-version.mjs [patch|minor|major|1.2.3]   (varsayılan: patch)
// main dalına gönderildiğinde GitHub iş akışı yeni sürümü görür, paketler ve mağazalara yükler.
import { readFileSync, writeFileSync } from 'node:fs';

const files = ['../extension/manifest.json', '../package.json'].map((f) => new URL(f, import.meta.url));
const manifest = JSON.parse(readFileSync(files[0], 'utf8'));
const [maj, min, pat] = manifest.version.split('.').map(Number);
const arg = process.argv[2] || 'patch';
const next = /^\d+\.\d+\.\d+$/.test(arg)
  ? arg
  : { major: `${maj + 1}.0.0`, minor: `${maj}.${min + 1}.0`, patch: `${maj}.${min}.${pat + 1}` }[arg];
if (!next) {
  console.error('Kullanım: node tools/bump-version.mjs [patch|minor|major|x.y.z]');
  process.exit(2);
}
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  j.version = next;
  writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
console.log(`${manifest.version} → ${next}`);
