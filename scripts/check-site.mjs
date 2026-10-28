// Страж сайта: проверяет, что ничего не сломалось. Запуск: node scripts/check-site.mjs
// Локально работает без сети; с флагом --net дополнительно проверяет, что картинки по ссылкам из data.json живы.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const problems = [];
const bad = (m) => problems.push(m);
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const html = readFileSync('index.html', 'utf8');

// 1. Синтаксис скрипта
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const main = scripts.sort((a, b) => b.length - a.length)[0] || '';
const tmp = join(mkdtempSync(join(tmpdir(), 'gg-')), 'main.js');
writeFileSync(tmp, main);
try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); } catch (e) { bad('Ошибка синтаксиса в JS: ' + String(e.stderr).split('\n').slice(0, 4).join(' ')); }

// 2. Данные
if (!existsSync('data.json')) bad('Нет data.json');
const data = existsSync('data.json') ? JSON.parse(readFileSync('data.json', 'utf8')) : {};
const ownCount = Object.keys(data.games || {}).length;
if (ownCount < 8) bad(`В data.json только ${ownCount} из 8 своих игр`);
for (const k of ['all', 'story', 'comp']) if (!(data.curated && data.curated[k] && data.curated[k].length)) bad(`Список «${k}» пуст`);
if (!data.catalog || !data.catalog.length) bad('Каталог пуст');
if (!data.fresh || !data.fresh.length) bad('Нет раздела «Новинки»');
const ageH = (Date.now() - new Date(data.updated || 0)) / 36e5;
if (!(ageH < 60)) bad(`data.json не обновлялся ${Math.round(ageH)} ч: ночной скрипт мог сломаться`);
const nPrices = Object.keys(data.prices || {}).length;
if (nPrices < 5) bad(`Цен собрано всего ${nPrices}: проверь CheapShark`);

// 3. Согласованность заметок: NOTES, FEEL, RU и названия из RAWG
const notes = [...html.matchAll(/\{ n: "((?:[^"\\]|\\.)*)", t: "[^"]*", k: \[([^\]]*)\]/g)].map((m) => ({ n: JSON.parse('"' + m[1] + '"'), k: [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]) }));
const section = (name) => { const i = html.indexOf('var ' + name + ' = {'); return i < 0 ? '' : html.slice(i, html.indexOf('\n  };', i)); };
const keysOf = (sec) => new Set([...sec.matchAll(/^\s+"((?:[^"\\]|\\.)*)": \[/gm)].map((m) => m[1]));
const feel = keysOf(section('FEEL')), ru = keysOf(section('RU'));
if (notes.length < 30) bad(`Заметок найдено ${notes.length}: разбор NOTES мог сломаться`);
for (const t of notes) {
  if (!feel.has(t.n)) bad(`Нет строки «время и настроение» для «${t.n}»`);
  if (!ru.has(t.n)) bad(`Нет русских названий для «${t.n}»`);
}
const seen = new Set();
const names = [...Object.values(data.curated || {}).flat(), ...(data.catalog || []), ...(data.fresh || [])].map((r) => norm(r.name));
for (const t of notes) {
  seen.add(t.n);
  if (names.length && !t.k.some((k) => names.includes(k))) bad(`«${t.n}»: название из RAWG не совпало ни с одним ключом, заметка может не показываться`);
}

// 4. Страницы превью
if (data.pages) {
  const miss = Object.keys(data.pages).filter((id) => !existsSync(`g/${id}/index.html`));
  if (miss.length) bad(`Нет страниц g/<id>/ для ${miss.length} игр (например ${miss[0]})`);
}
if (!existsSync('sitemap.xml')) bad('Нет sitemap.xml');

// 5. Живы ли картинки (только с --net)
if (process.argv.includes('--net')) {
  const imgs = [...new Set([...Object.values(data.games || {}).map((g) => g.img), ...(data.catalog || []).slice(0, 10).map((r) => r.background_image)])].filter(Boolean).slice(0, 20);
  let dead = 0;
  for (const u of imgs) { try { const r = await fetch(u, { method: 'HEAD' }); if (!r.ok) dead++; } catch { dead++; } }
  if (dead > 3) bad(`Не открываются ${dead} из ${imgs.length} проверенных картинок`);
}

if (problems.length) { console.error('Найдены проблемы:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`Всё в порядке: ${notes.length} заметок, ${ownCount} своих игр, ${nPrices} цен, ${Object.keys(data.pages || {}).length} страниц.`);
