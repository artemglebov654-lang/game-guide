// Раз в сутки собирает data.json для главной страницы, чтобы она не тратила лимит RAWG.
// Запуск: node scripts/build-data.mjs  (ключ берётся из RAWG_KEY или из index.html)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const KEY = process.env.RAWG_KEY || (html.match(/RAWG_KEY = '([a-f0-9]+)'/) || [])[1];
if (!KEY) throw new Error('RAWG key not found');
const API = 'https://api.rawg.io/api';

const GAMES = [
  { id: 'tlou', title: 'The Last of Us Part I' }, { id: 'hk', title: 'Hollow Knight' },
  { id: 'bg3', title: "Baldur's Gate 3", useShot: 0 }, { id: 'sdv', title: 'Stardew Valley' },
  { id: 'elden', title: 'Elden Ring' }, { id: 'disco', title: 'Disco Elysium' },
  { id: 'hades', title: 'Hades' }, { id: 'portal', title: 'Portal 2' }
];
const CUR = {
  all: ['Counter-Strike 2', 'Dota 2', 'Grand Theft Auto V', 'The Witcher 3: Wild Hunt', 'Red Dead Redemption 2', 'Fortnite', 'VALORANT', 'Minecraft', 'Cyberpunk 2077', 'League of Legends', 'God of War 2018', 'Apex Legends'],
  story: ['The Witcher 3: Wild Hunt', 'Red Dead Redemption 2', 'God of War 2018', 'Cyberpunk 2077', 'Horizon Zero Dawn', "Marvel's Spider-Man", 'Death Stranding', "Uncharted 4: A Thief's End", 'BioShock Infinite', 'Life is Strange', 'Detroit: Become Human', 'Mass Effect 2', 'Control', 'Metro Exodus', 'Ghost of Tsushima', 'Persona 5 Royal'],
  comp: ['Counter-Strike 2', 'Dota 2', 'VALORANT', 'League of Legends', 'Fortnite', 'Apex Legends', 'Overwatch 2', 'Rocket League', 'PUBG: BATTLEGROUNDS', "Tom Clancy's Rainbow Six Siege", 'Call of Duty: Warzone', 'Team Fortress 2', 'Street Fighter 6']
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function jget(path, params = {}) {
  const u = new URL(API + path);
  u.searchParams.set('key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  await sleep(150);
  return r.json();
}
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function pick(results, title) {
  const n = norm(title);
  return results.find((r) => norm(r.name) === n) || results.find((r) => norm(r.name).startsWith(n)) || results[0];
}
const slim = (r) => ({ id: r.id, name: r.name, released: r.released, background_image: r.background_image, genre: r.genres && r.genres[0] ? r.genres[0].name : '' });

const old = existsSync('data.json') ? JSON.parse(readFileSync('data.json', 'utf8')) : {};
const data = { updated: new Date().toISOString(), games: {}, curated: {}, catalog: null };

for (const g of GAMES) {
  try {
    const d = await jget('/games', { search: g.title, search_precise: 'true', page_size: 5 });
    const r = pick(d.results || [], g.title);
    if (!r) throw new Error('no match');
    const rec = { id: r.id, img: r.background_image || '', slug: r.slug };
    if (g.useShot !== undefined) {
      const sh = await jget(`/games/${r.id}/screenshots`, { page_size: 4 });
      const im = (sh.results || [])[g.useShot];
      if (im && im.image) rec.img = im.image;
    }
    data.games[g.id] = rec;
  } catch (e) { console.warn('game', g.id, e.message); if (old.games && old.games[g.id]) data.games[g.id] = old.games[g.id]; }
}
for (const [key, names] of Object.entries(CUR)) {
  const list = [];
  for (const name of names) {
    try {
      const d = await jget('/games', { search: name, search_precise: 'true', page_size: 5 });
      const r = pick(d.results || [], name);
      if (r && !list.some((x) => x.id === r.id)) list.push(slim(r));
    } catch (e) { console.warn('curated', name, e.message); }
  }
  data.curated[key] = list.length ? list : (old.curated && old.curated[key]) || [];
}
try {
  const d = await jget('/games', { ordering: '-added', page_size: 24, page: 1 });
  data.catalog = (d.results || []).map(slim);
} catch (e) { console.warn('catalog', e.message); data.catalog = old.catalog || null; }

const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
try {
  const d = await jget('/games', { dates: `${iso(90)},${iso(0)}`, ordering: '-added', page_size: 24, page: 1 });
  data.fresh = (d.results || []).map(slim);
} catch (e) { console.warn('fresh', e.message); data.fresh = old.fresh || null; }

// Цены: CheapShark (бесплатно, без ключа). Берём только точное совпадение названия, чтобы не показать цену чужой игры.
data.prices = {};
const names = [...new Set([...GAMES.map((g) => g.title), ...Object.values(CUR).flat()])];
const PRICE_ALIAS = { 'God of War 2018': 'God of War', 'VALORANT': '' };
for (const name of names) {
  const q = name in PRICE_ALIAS ? PRICE_ALIAS[name] : name;
  if (!q) continue;
  try {
    const r = await fetch('https://www.cheapshark.com/api/1.0/games?limit=10&title=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('status ' + r.status);
    const list = await r.json();
    const hit = (Array.isArray(list) ? list : []).find((x) => norm(x.external || '') === norm(q));
    if (hit && hit.cheapest && hit.cheapestDealID) data.prices[norm(name)] = { p: String(hit.cheapest), d: hit.cheapestDealID };
    await sleep(300);
  } catch (e) { console.warn('price', name, e.message); }
}
if (!Object.keys(data.prices).length && old.prices) data.prices = old.prices;

writeFileSync('data.json', JSON.stringify(data));
console.log('data.json written:', Object.keys(data.games).length, 'games,', Object.values(data.curated).reduce((a, l) => a + l.length, 0), 'curated');
