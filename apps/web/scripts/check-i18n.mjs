// Vérifie que chaque clé littérale passée à t('...') a une traduction anglaise.
// Usage : node scripts/check-i18n.mjs [chemin...]   (par défaut : src)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
// Évalue un littéral JS ('...', "..." ou `...` sans interpolation) en chaîne.
const unq = (s) => {
  const body = s.slice(1, -1);
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c[0] === 'u') return String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16));
    return c;
  });
};
const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`' + String.raw`(?:[^` + '`' + String.raw`\\$]|\\.)*` + '`';

const dictKeys = new Set();
const dictDir = join(root, 'src', 'i18n', 'en');
for (const f of readdirSync(dictDir)) {
  const src = readFileSync(join(dictDir, f), 'utf8');
  for (const m of src.matchAll(new RegExp(String.raw`^\s*(` + STR + String.raw`)\s*:`, 'gm'))) dictKeys.add(unq(m[1]));
}

const missing = new Map();
let total = 0;
const call = new RegExp(String.raw`(?<![\w.])t\(\s*(` + STR + ')', 'g');
const files = targets
  .flatMap((p) => walk(join(root, p)))
  .filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.includes(join('src', 'i18n')) && !f.endsWith(join('lib', 'i18n.ts')));
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (!/lib\/i18n['"]/.test(src)) continue; // seuls les fichiers branchés sur lib/i18n
  for (const m of src.matchAll(call)) {
    total++;
    const key = unq(m[1]);
    if (!dictKeys.has(key)) {
      if (!missing.has(key)) missing.set(key, relative(root, file));
    }
  }
}
console.log(`${total} appels t(), ${dictKeys.size} clés traduites, ${missing.size} clés sans traduction`);
for (const [k, file] of missing) console.log(`  MANQUE ${JSON.stringify(k)}  <- ${file}`);
process.exit(missing.size ? 1 : 0);
