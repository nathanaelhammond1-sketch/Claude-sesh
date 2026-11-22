// End-to-end QA for DAYMARK against the production build, on iPhone-sized viewports.
// Usage: npm run build && npm run test:e2e
// Uses the Playwright + Chromium available on the machine (no install step).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(`${process.env.NODE_PATH ?? ''}/playwright`);
}
const { chromium, devices } = pw;

const PORT = 4180;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
function assert(c, msg) {
  if (!c) throw new Error(msg);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && (clearTimeout(t), resolve()));
});

const DAY1 = new Date('2026-11-16T10:00:00'); // Monday, local time
const DAY1_EVENING = new Date('2026-11-16T20:45:00');
const DAY2 = new Date('2026-11-17T08:30:00');

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], timezoneId: 'America/New_York' });
  let page = await ctx.newPage();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  };
  watch(page);
  await page.clock.setFixedTime(DAY1);
  await page.goto(BASE);
  await page.waitForSelector('.hero');

  const dbDump = (p = page) =>
    p.evaluate(
      () =>
        new Promise((res, rej) => {
          const r = indexedDB.open('daymark');
          r.onsuccess = () => {
            const db = r.result;
            const names = ['tasks', 'entries', 'subtasks', 'reviews', 'events', 'journal'];
            const tx = db.transaction(names, 'readonly');
            const out = {};
            let n = names.length;
            for (const s of names) {
              const q = tx.objectStore(s).getAll();
              q.onsuccess = () => {
                out[s] = q.result;
                if (--n === 0) {
                  db.close();
                  res(out);
                }
              };
            }
          };
          r.onerror = () => rej(r.error);
        }),
    );

  async function addTask(title, priority) {
    await page.click('button.fab');
    await page.fill('input.title-input', title);
    await page.click(`.sheet .segmented button:has-text("${priority}")`);
    await page.click('.sheet button[type=submit]');
    await page.waitForSelector('.sheet', { state: 'detached' });
  }
  const openTask = async (title) => {
    await page.click(`.task-card:has-text("${title}")`);
    await page.waitForSelector('.slider');
  };

  console.log('\nDAYMARK end-to-end QA (iPhone 14, America/New_York)\n');

  await step('1. User creates a new task', async () => {
    await addTask('Complete business proposal', 'High');
    await addTask('Gym session', 'Medium');
    await addTask('Read 30 pages', 'Low');
    assert((await page.locator('.task-card').count()) === 3, 'expected 3 task cards');
    const t = await page.locator('.hero-stat').first().innerText();
    assert(t.includes('3'), `hero goal count wrong: ${t}`);
    await page.screenshot({ path: `${SHOTS}01-today.png` });
  });

  await step('2. User updates its completion percentage', async () => {
    await openTask('Complete business proposal');
    await page.click('.quick-pcts button:has-text("50%")');
    await page.waitForFunction(() => document.querySelector('.ring-label b')?.textContent === '50%');
    const db = await dbDump();
    const t = db.tasks.find((x) => x.title === 'Complete business proposal');
    assert(t.progress === 50, `progress is ${t.progress}`);
    assert(db.events.some((e) => e.taskId === t.id && e.from === 0 && e.to === 50), 'progress history event missing');
    await page.screenshot({ path: `${SHOTS}02-detail.png` });
    await page.click('button.back');
  });

  await step('3. User completes a task', async () => {
    await openTask('Gym session');
    await page.click('button:has-text("Mark complete")');
    await page.waitForSelector('.pill.green:has-text("Completed")');
    const db = await dbDump();
    const t = db.tasks.find((x) => x.title === 'Gym session');
    assert(t.progress === 100 && t.completedAt, 'task not completed');
    await page.click('button.back');
    await page.waitForSelector('.hero');
    const stats = await page.locator('.hero-stats').innerText();
    assert(/1\s*Completed/.test(stats), `hero stats: ${stats}`);
  });

  await step('4. User partially completes a task in the evening review', async () => {
    await page.clock.setFixedTime(DAY1_EVENING);
    await page.goto(`${BASE}#/review`);
    await page.click('button:has-text("Review 3 tasks")');
    // order: unreviewed tasks in plan order
    for (let i = 0; i < 3; i++) {
      const title = await page.locator('.card >> div[style*="font-serif"]').first().innerText();
      if (title.includes('Complete business proposal')) {
        await page.click('button.outcome:has-text("Partially")');
        await page.click('.quick-pcts button:has-text("75%")');
        await page.fill('textarea[aria-label="What remains unfinished"]', '- Finish financial projections\n- Review executive summary\n- Add competitor analysis');
        await page.waitForSelector('.suggestion >> nth=2');
        await page.click('.chip:has-text("Ran out of time")');
        await page.fill('input[placeholder="The very next physical step"]', 'Open the projections spreadsheet');
        await page.screenshot({ path: `${SHOTS}04-review-partial.png`, fullPage: true });
      } else if (title.includes('Gym')) {
        await page.click('button.outcome:has-text("Completed")');
      } else {
        await page.click('button.outcome:has-text("Not started")');
        await page.click('.chip:has-text("Low energy")');
      }
      await page.click('button:has-text("Save &")');
      await page.waitForTimeout(250);
    }
    await page.waitForSelector('text=of plan');
    await page.screenshot({ path: `${SHOTS}04b-review-summary.png` });
    const db = await dbDump();
    const t = db.tasks.find((x) => x.title === 'Complete business proposal');
    assert(t.progress === 75, `progress ${t.progress}`);
    assert(db.reviews.length === 3, `reviews ${db.reviews.length}`);
    await page.click('button:has-text("Finish review")');
  });

  await step('5. User creates remaining subtasks (from their own words)', async () => {
    const db = await dbDump();
    const t = db.tasks.find((x) => x.title === 'Complete business proposal');
    const subs = db.subtasks.filter((s) => s.taskId === t.id).map((s) => s.title);
    assert(JSON.stringify(subs.sort()) === JSON.stringify(['Add competitor analysis', 'Finish financial projections', 'Review executive summary']), `subtasks: ${subs}`);
    await page.goto(`${BASE}#/task/${t.id}`);
    await page.waitForSelector('.subtask');
    await page.fill('input[aria-label="New subtask"]', 'Send to client');
    await page.click('form.list-item button:has-text("Add")');
    await page.waitForSelector('.subtask:has-text("Send to client")');
  });

  await step('6. User checks off individual subtasks', async () => {
    await page.click('.subtask:has-text("Review executive summary") button.check');
    await page.waitForSelector('.subtask:has-text("Review executive summary") button.check[aria-checked="true"]');
    // reorder: move "Send to client" up
    await page.click('.subtask:has-text("Send to client") button[aria-label="Move up"]');
    await page.waitForTimeout(200);
    const db = await dbDump();
    const s = db.subtasks.find((x) => x.title === 'Review executive summary');
    assert(s.done && s.completedOn === '2026-11-16', 'subtask not completed');
    await page.screenshot({ path: `${SHOTS}06-subtasks.png`, fullPage: true });
  });

  await step('7–8. Close the app and reopen it — all data remains saved', async () => {
    await page.goto(`${BASE}#/journal`);
    await page.fill('textarea >> nth=3', 'Plan fewer, bigger tasks.');
    await page.waitForSelector('.saved-ind:has-text("Saved")');
    await page.close();
    page = await ctx.newPage();
    watch(page);
    await page.clock.setFixedTime(DAY1_EVENING);
    await page.goto(BASE);
    await page.waitForSelector('.hero');
    const db = await dbDump();
    assert(db.tasks.length === 3 && db.subtasks.length === 4 && db.reviews.length === 3 && db.journal.length === 1, `after reopen: ${db.tasks.length} tasks, ${db.subtasks.length} subtasks, ${db.reviews.length} reviews, ${db.journal.length} journal`);
    assert((await page.locator('.task-card').count()) === 3, 'cards missing after reopen');
  });

  let dataAfterDay2;
  await step('9. Unfinished tasks carry forward correctly to the next day', async () => {
    await page.close();
    page = await ctx.newPage();
    watch(page);
    await page.clock.setFixedTime(DAY2);
    await page.goto(BASE);
    await page.waitForSelector('#h-carried');
    const carried = await page.locator('section:has(#h-carried) .task-card').allInnerTexts();
    assert(carried.length === 2, `carried cards: ${carried.length}`);
    assert(carried.some((c) => c.includes('Complete business proposal') && c.includes('75%') && c.includes('3 of 4 subtasks left')), `carried card text: ${carried.join(' | ')}`);
    await page.screenshot({ path: `${SHOTS}09-day2.png` });
    dataAfterDay2 = await dbDump();
    const t = dataAfterDay2.tasks.find((x) => x.title === 'Complete business proposal');
    assert(t.scheduledDate === '2026-11-17' && t.originDate === '2026-11-16' && t.carryCount === 1, 'task metadata after carry');
  });

  await step('10. Completed tasks remain in historical records', async () => {
    await page.goto(`${BASE}#/history/2026-11-16`);
    await page.waitForSelector('#h-planned');
    const txt = await page.locator('section:has(#h-planned)').innerText();
    assert(txt.includes('Gym session') && txt.includes('Completed'), 'completed task missing from history');
    assert(txt.includes('Partially completed') && txt.includes('Ran out of time'), 'review missing from history');
    const page2 = await page.locator('main').innerText();
    assert(page2.includes('Unfinished at end of day') && page2.includes('Finish financial projections'), 'unfinished subtask snapshot missing');
    assert(page2.includes('Completed this day') && page2.includes('Review executive summary'), 'completed subtask missing');
    assert(page2.includes('Carried to the next day'), 'carried-out list missing');
    await page.screenshot({ path: `${SHOTS}10-history.png`, fullPage: true });
  });

  await step('11. The same task is not duplicated during rollover', async () => {
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForSelector('.app');
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    }
    await page.waitForTimeout(400);
    const db = await dbDump();
    assert(db.tasks.length === 3, `tasks ${db.tasks.length}`);
    const ids = db.entries.map((e) => e.id);
    assert(new Set(ids).size === ids.length, 'duplicate entry ids');
    const day2 = db.entries.filter((e) => e.date === '2026-11-17');
    assert(day2.length === 2, `day-2 entries ${day2.length}`);
    const perTaskDay = new Set(db.entries.map((e) => `${e.taskId}|${e.date}`));
    assert(perTaskDay.size === db.entries.length, 'task appears twice on one day');
    // Monday's record is unchanged by Tuesday's carry.
    const mon = db.entries.find((e) => e.date === '2026-11-16' && e.titleSnapshot === 'Complete business proposal');
    assert(mon.endProgress === 75 && mon.closed, 'Monday snapshot altered');
  });

  await step('12. Daily review records are saved', async () => {
    const db = await dbDump();
    const r = db.reviews.find((x) => x.outcome === 'partial');
    assert(r && r.progress === 75 && r.reasons.includes('Ran out of time') && r.nextAction === 'Open the projections spreadsheet' && r.createdSubtaskIds.length === 3, 'partial review incomplete');
    assert(db.reviews.some((x) => x.outcome === 'not_started' && x.reasons.includes('Low energy')), 'not-started review missing');
  });

  await step('13. Analytics calculate correctly', async () => {
    // Day 1: 75 + 100 + 0 => 58%. Day 2 (so far): 75 + 0 => 38%. Week avg = round((58+38)/2) = 48%.
    await page.goto(`${BASE}#/progress`);
    await page.waitForSelector('.stat');
    const stats = await page.locator('.stat-grid').innerText();
    assert(stats.includes('48%') && /48%\s*Weekly completion/.test(stats), `weekly stat: ${stats.slice(0, 200)}`);
    assert(/1\s*Tasks completed/.test(stats), 'completed count');
    assert(/2\s*Carried forward/.test(stats), 'carried count');
    await page.click('.chart-head:has-text("Daily completion") .table-toggle');
    const table = await page.locator('table.data-table').first().innerText();
    assert(table.includes('58%') && table.includes('38%'), `daily table: ${table}`);
    await page.screenshot({ path: `${SHOTS}13-progress.png`, fullPage: true });
  });

  await step('Backup export → reset → import restores everything', async () => {
    const before = await dbDump();
    await page.goto(`${BASE}#/settings`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
    const path = await dl.path();
    const json = JSON.parse(readFileSync(path, 'utf8'));
    assert(json.app === 'daymark' && json.data.tasks.length === 3, 'bad backup');
    await page.click('button:has-text("Reset all data")');
    await page.fill('.dialog input', 'RESET');
    await page.click('.dialog button:has-text("Erase everything")');
    await page.waitForTimeout(300);
    assert((await dbDump()).tasks.length === 0, 'reset failed');
    await page.setInputFiles('input[type=file]', path);
    await page.click('.dialog button:has-text("Replace my data")');
    await page.waitForTimeout(500);
    const after = await dbDump();
    assert(after.tasks.length === before.tasks.length && after.entries.length === before.entries.length && after.reviews.length === before.reviews.length && after.journal.length === 1, 'restore mismatch');
  });

  await step('Calendar reminder file is generated', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Add to Calendar")')]);
    const ics = readFileSync(await dl.path(), 'utf8');
    assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('RRULE:FREQ=WEEKLY') && ics.includes('T203000'), 'bad ics');
  });

  await step('14. Works on iPhone screen sizes (SE → Pro Max), light and dark', async () => {
    for (const name of ['iPhone SE', 'iPhone 14', 'iPhone 14 Pro Max']) {
      for (const scheme of ['light', 'dark']) {
        const c = await browser.newContext({ ...devices[name], colorScheme: scheme, deviceScaleFactor: 2 });
        const p = await c.newPage();
        watch(p);
        await p.clock.setFixedTime(DAY1);
        await p.goto(BASE);
        await p.waitForSelector('.hero');
        await p.click('button.fab');
        await p.fill('input.title-input', 'A fairly long task title to check wrapping on small screens');
        await p.click('.sheet button[type=submit]');
        await p.waitForSelector('.task-card');
        for (const r of ['today', 'tasks', 'progress', 'journal', 'settings', 'review']) {
          await p.goto(`${BASE}#/${r}`);
          await p.waitForTimeout(150);
          const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          assert(over <= 0, `${name}/${scheme}/${r}: horizontal overflow ${over}px`);
        }
        if (name === 'iPhone SE' || scheme === 'dark') {
          await p.goto(`${BASE}#/today`);
          await p.waitForTimeout(300);
          await p.screenshot({ path: `${SHOTS}14-${name.replace(/\s/g, '')}-${scheme}.png` });
        }
        await c.close();
      }
    }
  });

  await step('15. Offline access works after first load', async () => {
    const c = await browser.newContext({ ...devices['iPhone 14'] });
    const p = await c.newPage();
    watch(p);
    await p.goto(BASE);
    await p.waitForSelector('.hero');
    await p.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await p.reload(); // now controlled by the service worker
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
    await p.click('button.fab');
    await p.fill('input.title-input', 'Offline-safe task');
    await p.click('.sheet button[type=submit]');
    await p.waitForSelector('.task-card');
    await c.setOffline(true);
    await p.reload();
    await p.waitForSelector('.task-card:has-text("Offline-safe task")', { timeout: 10000 });
    await p.goto(`${BASE}#/progress`);
    await p.waitForSelector('.stat');
    await c.setOffline(false);
    await c.close();
  });

  await step('No runtime errors in the console', async () => {
    assert(errors.length === 0, errors.join('\n'));
  });
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ' — FAILURES above' : ''}\nScreenshots: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
