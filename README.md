# DAYMARK — Make every day count.

A local-first, iPhone-first Progressive Web App for daily intentions, honest evening reviews, and automatic carry-forward of unfinished work.

> *Be honest about what you planned. Be honest about what you accomplished. Be intentional about what comes next.*

**Live app:** https://nathanaelhammond1-sketch.github.io/Claude-sesh/

---

## The daily loop

| When | What you do in DAYMARK |
|---|---|
| Morning | Open **Today**, add intentions (title, priority, category, due date, estimate). |
| During the day | Open a task and drag the slider (0–100%). 0% = Not started, 1–99% = In progress, 100% = Completed (automatic). Every change is logged. |
| Evening (8:30 PM default) | **Evening review**: for each task choose Completed / Partially / Not started, set the %, describe what remains, say why, and name the next action. Or skip and come back. |
| Identify & break down | What you write under "What remains unfinished?" is turned into editable subtasks (one per line, or a comma-separated sentence). You approve each one. Optional AI suggestions arrive unchecked. |
| Tomorrow | Unfinished tasks and their open subtasks are carried into the new day automatically — same task, same progress, full history, never duplicated. |

## Screens

- **Today** — greeting, date, “MAKE TODAY COUNT.”, overall % ring, goals / completed / in progress / not started, progress bar, carried-forward section, task cards (title, priority, %, bar, due date, subtasks left, status), outstanding subtasks, coming up, evening-review card, quick-add button.
- **Tasks** — Active / Upcoming / Overdue / Carried forward / Completed / Archived, search (includes subtasks), category & priority filters, sorting.
- **Task details** — completion slider + quick %, mark complete, subtasks (add, edit, delete, check, reorder), description, notes, day-by-day history with each review, full progress-change log, reschedule, archive, abandon, restore, delete.
- **Evening review** — guided, one task at a time, with summary and a link into the journal.
- **Progress** — weekly & monthly completion, completed / partial / carried counts, average daily productivity, most productive day, review streak, written insights, charts (daily completion, completed vs incomplete, 8-week trend, category breakdown, weekday pattern), 30-day overview, consistently-unfinished tasks, recurring obstacles. Every chart has a table view.
- **History** — month calendar; any day shows tasks planned, completion %, carried in/out, completed subtasks that day, unfinished subtasks frozen at the end of the day, evening reviews and the journal entry.
- **Journal** — six reflection prompts plus free writing, autosaved per date, with previous entries.
- **Settings** — name, theme (automatic / light / dark), reminder time & days, morning / overdue / subtask reminders, notifications, calendar reminders, install guide, optional AI assistant, categories, export / import / reset, update check.

---

## Install on your iPhone

1. Open **https://nathanaelhammond1-sketch.github.io/Claude-sesh/** in **Safari**.
2. Tap the **Share** button (square with an up-arrow).
3. Scroll down and tap **Add to Home Screen** → **Add**.
4. Launch DAYMARK from the new Home Screen icon. It opens full-screen and works offline from then on.

> The Home Screen app and Safari keep **separate storage**. Pick one (the Home Screen app is recommended — iOS protects its data better) or move data between them with Export → Import.

## Enable notifications (and what is honestly possible)

1. Install DAYMARK to the Home Screen first (iOS only allows web-app notifications for installed apps, iOS 16.4 or later).
2. Open it from the Home Screen → **Settings → Notifications → Enable notifications** → **Allow**.
3. Tap **Send test notification** to confirm it works.

**Limits, stated plainly:**

- iOS does not give web apps a way to schedule a local notification for a future time. A web app can only show a notification **while it is running** (open, or briefly in the background), or via a **push server**. DAYMARK has no server — by design, so your data never leaves your phone — so it does **not** use push.
- What DAYMARK does: while open, it shows a real system notification at your reminder time (“DAYMARK: Time to review your day. How much did you actually accomplish?”). If you open it after a reminder time, you get an in-app prompt instead — never a fake notification.
- **Reliable alternative (recommended):** **Settings → Notifications → Add to Calendar.** This creates a repeating calendar event at your review time (and morning-planning time, if enabled) on your chosen days with an alert. iPhone Calendar delivers that alert even when DAYMARK is closed, and tapping the event contains a link back to the app. Re-add it if you change the time.
- A future native iOS version (e.g. wrapping this app with Capacitor) could use real local notifications; that is the path if you need guaranteed in-app alerts.

## Back up your data

All data lives only on your device (IndexedDB). Back it up regularly:

1. **Settings → Your data → Export backup (.json).** On iPhone the share sheet opens — choose **Save to Files** (iCloud Drive is a good spot), or AirDrop/email it to yourself.
2. To restore: **Settings → Import / restore backup**, pick the file, confirm. This *replaces* the current data (export first if unsure).
3. DAYMARK reminds you on the Today screen if you've never backed up or your last backup is more than two weeks old.

Your AI API key (if you set one) is never included in backups.

## Updating the app

- New versions deploy automatically when code is pushed (see *Deployment*). Your data is untouched by updates.
- The installed app checks for a new version each time it comes to the foreground. When one is ready you'll see **“A new version of DAYMARK is ready — Update”**. Tap **Update**.
- You can also check manually: **Settings → About → Check for updates**.
- If the app ever seems stuck on an old version: fully close it (swipe up from the app switcher) and reopen it twice.

---

## What genuinely works (verified)

| Feature | Status |
|---|---|
| Create / edit / delete / archive / abandon / restore tasks, for today or future dates | ✅ Works |
| Completion slider, automatic status, progress-history log | ✅ Works |
| Subtasks: add, edit, delete, check, reorder, due date, priority | ✅ Works |
| Evening review with Completed / Partial / Not started / Skip, reasons, next action | ✅ Works |
| Turning your description of remaining work into approved subtasks | ✅ Works (no AI needed) |
| Automatic carry-forward at app open / return to foreground / local midnight — atomic, idempotent, no duplicates, history preserved | ✅ Works |
| Daily snapshots (subtasks frozen at end of each day), history calendar | ✅ Works |
| Analytics & charts, 30-day overview, insights | ✅ Works |
| Journal with autosave and past entries | ✅ Works |
| Light / dark / automatic theme | ✅ Works |
| Offline use after first load; install to Home Screen | ✅ Works |
| Export / import / reset | ✅ Works |
| Calendar (.ics) reminders | ✅ Works — most reliable reminder on iPhone |
| System notifications while the app is running | ✅ Works where the platform allows (installed, iOS 16.4+, permission granted) |
| Notifications when the app is fully closed | ❌ Not possible for a server-less PWA on iOS — use Calendar reminders |
| Optional AI subtask suggestions | ✅ Works with **your own** Anthropic API key; off by default; shows exactly what will be sent and asks before every request |

## Privacy

- No account, no login, no analytics, no server. Everything is stored locally in IndexedDB.
- Nothing is transmitted anywhere unless you turn on the optional AI assistant, enter your own API key, and press **Send** on a preview of the exact text (task title, description, %, your remaining-work notes, reason). That request goes directly from your device to `api.anthropic.com`.

---

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests: data layer, rollover, analytics, backup, reminders, dates
npm run build        # production build to dist/ (generates the service worker)
npm run test:e2e     # end-to-end QA on iPhone viewports (requires Playwright + Chromium)
```

### Architecture

- React 19 + TypeScript + Vite. Hash router (works offline and on a sub-path).
- `src/lib/db.ts` — dependency-free IndexedDB wrapper; multi-record changes run in a single transaction.
- `src/lib/types.ts` — the data model, with separate stores for **master tasks** (`tasks`), **daily task instances** (`entries`, key `date|taskId`), **subtasks**, **daily reviews**, **progress history** (`events`), **journal entries**, and per-day records (`days`).
- `src/lib/repo.ts` — all mutations, rollover, backup/restore.
- `src/lib/analytics.ts` — pure analytics functions.
- `src/sw/sw-template.js` — service worker; the build injects an exact precache list and a versioned cache name.
- Charts are small hand-written SVG components (`src/components/Charts.tsx`) to keep the offline bundle small; the optional Anthropic SDK is loaded only when you request a suggestion.

### Why the rollover can't duplicate tasks

A task's appearance on a day is a `DayEntry` whose key is `"<date>|<taskId>"`. The rollover moves each unfinished task's `scheduledDate` to today and inserts today's entry *only if that key doesn't exist*, inside the same transaction. Running it any number of times produces the same result; earlier days' entries are closed and never modified again.

### Deployment

`.github/workflows/deploy.yml` runs the unit tests, builds, and publishes `dist/` to GitHub Pages on every push to `main` or the development branch. If Pages isn't enabled yet: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**, then re-run the workflow.
