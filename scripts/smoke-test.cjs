// Дымовой тест: открывает сайт в настоящем браузере и проходит основные сценарии.
// Сеть RAWG подменена, так что тест не тратит лимит. Запуск: node scripts/smoke-test.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api.rawg.io/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) }));
  await page.route('**/media.rawg.io/**', (r) => r.abort());
  await page.route('**/api.mymemory.translated.net/**', (r) => r.abort());

  const go = async (hash) => { await page.goto('about:blank'); await page.goto(base + 'index.html' + (hash || '')); await page.waitForTimeout(1200); };
  const text = () => page.innerText('body');

  await go();
  check((await text()).includes('путеводник'), 'главная открывается');
  check((await page.$$('.tools button')).length === 4, 'на главной четыре плитки инструментов');

  await page.fill('input', 'ведьмак'); await page.waitForTimeout(450);
  check((await page.$$eval('[role=listbox] li', (l) => l.map((x) => x.innerText).join(' '))).includes('Witcher 3'), 'поиск по-русски находит «Ведьмака»');

  await go('#g/hades');
  check((await text()).toLowerCase().includes('hades'), 'карточка своей игры открывается по ссылке');

  await go('#quiz');
  for (const a of [0, 0, 0, 0, 1, 1, 1]) { await page.click(`[data-qa="${a}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  check((await page.$$('.pick li')).length === 5, 'подбор: после 7 вопросов видно 5 игр');

  await go('#compare/' + encodeURIComponent('Minecraft') + '~' + encodeURIComponent('Terraria'));
  check((await page.$$('.cmpR')).length >= 5, 'сравнение по ссылке заполняется');

  await go('#evening');
  await page.click('[data-ev="1"]'); await page.waitForTimeout(300);
  check((await page.$$('.pick li')).length > 0, '«на вечер»: есть игры на несколько вечеров');
  await page.click('[data-evwho="multi"]'); await page.waitForTimeout(300);
  check((await page.$$('.pick li')).length > 0 || !!(await page.$('#evOut .note2')), '«на вечер»: фильтр «с друзьями» даёт список или понятное сообщение');

  await go('#taste');
  check((await text()).includes('Пока рано судить'), '«вкус» без полки просит отметить игры');
  await page.evaluate(() => localStorage.setItem('gg2:shelf', JSON.stringify({ 'g:sdv': { s: 'played', n: 'Stardew Valley', t: 1 }, 'g:portal': { s: 'played', n: 'Portal 2', t: 2 }, 'g:hades': { s: 'want', n: 'Hades', t: 3 } })));
  await go('#taste');
  check((await page.$$('.pick li')).length === 5, '«вкус» с полкой показывает 5 рекомендаций');

  await go('#guess');
  check((await page.$$('[data-gopt]')).length === 4, '«угадай игру»: у вопроса четыре варианта');
  for (let i = 0; i < 5; i++) { await page.click('[data-gopt="0"]'); await page.waitForTimeout(80); await page.click('[data-gnext]'); await page.waitForTimeout(80); }
  check((await text()).includes('из 5'), '«угадай игру»: после 5 вопросов показан результат');

  await go();
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#themeBtn');
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(before !== after, 'переключатель темы меняет фон');

  check(errors.length === 0, 'в консоли нет ошибок JS' + (errors.length ? ': ' + errors[0] : ''));
  await browser.close(); server.close();
  if (failures.length) { console.error('\nСломалось:\n- ' + failures.join('\n- ')); process.exit(1); }
  console.log('\nВсе сценарии прошли.');
})().catch((e) => { console.error(e); process.exit(1); });
