// Делает для каждой известной игры маленькую страницу g/<id>/index.html с превью для мессенджеров.
// Страница сразу перекидывает человека в приложение; боты соцсетей JavaScript не выполняют и читают только мета-теги.
// Запуск: node scripts/build-pages.mjs  (читает data.json и index.html, сеть не нужна)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const SITE = (process.env.SITE_URL || 'https://artemglebov654-lang.github.io/game-guide/').replace(/\/?$/, '/');
const html = readFileSync('index.html', 'utf8');
const data = JSON.parse(readFileSync('data.json', 'utf8'));

const unq = (s, q) => (q === '"' ? JSON.parse('"' + s + '"') : s.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

// Описания своих игр (ABOUT) и популярных (NOTES)
const aboutOwn = {};
const blk = html.slice(html.indexOf('var ABOUT = {'));
for (const m of blk.slice(0, blk.indexOf('};')).matchAll(/^\s+(\w+): '((?:[^'\\]|\\.)*)'/gm)) aboutOwn[m[1]] = unq(m[2], "'");
const aboutNote = {};
for (const m of html.matchAll(/\{ n: "((?:[^"\\]|\\.)*)", t: "[^"]*", k: \[[^\]]*\],(?: y: "\d+",)? about: "((?:[^"\\]|\\.)*)"/g)) aboutNote[norm(unq(m[1], '"'))] = unq(m[2], '"');

const OWN = {};
for (const m of html.matchAll(/\{ id: '(\w+)'[^\n]*?title: ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'),/g)) OWN[m[1]] = unq(m[2].slice(1, -1), m[2][0]);
const NOART = new Set([...html.matchAll(/\{ id: '(\w+)'[^\n]*?noArt: true/g)].map((m) => m[1]));

const games = new Map(); // rawgId -> { name, img, desc, hash }
const add = (id, name, img, desc, hash) => { if (id && name && !games.has(id)) games.set(id, { name, img, desc, hash }); };
for (const [own, rec] of Object.entries(data.games || {})) {
  add(rec.id, OWN[own] || own, NOART.has(own) ? '' : rec.img, aboutOwn[own] || '', '#g/' + own);
}
const lists = [...Object.values(data.curated || {}), data.catalog || [], data.fresh || []];
for (const l of lists) for (const r of l) add(r.id, r.name, r.background_image, aboutNote[norm(r.name)] || '', '#r/' + r.id);

rmSync('g', { recursive: true, force: true });
for (const [id, g] of games) {
  const title = g.name + ' · Путеводник по играм';
  const desc = cut(g.desc || 'Время прохождения, настроение, кому игра зайдёт и на что она похожа.', 180);
  const img = g.img ? g.img.replace('/media/', '/media/resize/1280/-/') : '';
  const url = SITE + 'g/' + id + '/';
  mkdirSync('g/' + id, { recursive: true });
  writeFileSync('g/' + id + '/index.html', `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Путеводник по играм">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">${img ? `\n<meta property="og:image" content="${esc(img)}">\n<meta name="twitter:card" content="summary_large_image">` : '\n<meta name="twitter:card" content="summary">'}
<meta http-equiv="refresh" content="0; url=../../${g.hash}">
<script>location.replace('../../${g.hash}');</script>
</head><body style="background:#0d0d0f;color:#ebebe8;font-family:sans-serif;padding:2rem"><a style="color:inherit" href="../../${g.hash}">${esc(g.name)}: открыть в путеводнике</a></body></html>
`);
}
data.pages = Object.fromEntries([...games].map(([id, g]) => [id, 1]));
writeFileSync('data.json', JSON.stringify(data));
console.log('pages written:', games.size);
