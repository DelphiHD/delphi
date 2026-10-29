# Delphi Dashboard: Spec

Draft 2026-10-29, approved by Kaycee. Nothing here is built yet. When she has
approved it, this page is the definition of done: every line works from her
phone, signed in, from anywhere, and is ticked off here as it does.

## Principles

- **Nothing lives only on the Mac.** Every number, log and list is in the cloud
  database. The Mac may still do work, but it is never the only place to see it.
- **One dashboard, behind her sign-in** (email and password, as now), built for
  the phone first and the laptop second.
- **Failures and cost are never hidden.** Every failed or retried attempt is
  counted, with what it cost.
- **Every button works from anywhere.** A button asks for a job; a cloud job (or
  the Mac, while it is still needed) does it; the page shows it running and done.
- **Nothing from the Mac dashboard is dropped or swapped** without her yes.

## 1. Health strip (top of every page)

One line per scheduled job and check, always visible whichever tab is open:
green, amber or red, when it last ran, and the one-line reason when it is not
green. A job that has not run on time is red, even if it never "failed".

Covers: morning transit, client reads, Evening Echoes, library sync, morning
check, chart publishing, report writing.

## 2. Executive view

Big numbers with a trend line. Red/amber/green comes later, once Kaycee has
seen the numbers and set the thresholds herself.

| Number | From |
|---|---|
| Paying clients (this month, all time) | bookings and Stripe |
| Revenue (this month, last month, trend) | Stripe |
| Sessions booked, upcoming | cal.com |
| Sign-ups and conversion to paid | the funnel |
| Reports delivered, and on time | report runs |
| Cost: per report, per client, this month, by product (reports, transit, Echoes) | every AI call, including failed attempts |
| Report quality: passed first time, needed a hand-touch | report checks |
| Charts opened, and by whom | chart visits |
| Open problems (client reports and system failures) | problem reports and checks |
| System health | the health strip, summarized |

## 3. Project management

**Things it holds:**
- **Projects:** name, goal, status, priority, target date, owner, progress.
- **Tasks:** title, project, status (backlog, next, doing, waiting, done),
  priority, owner (Kaycee or an agent), due date, depends on, notes,
  links (commit, chart, doc), created and done dates.
- **Decisions:** what, why, who decided, date, linked task. Replaces scrolling
  `docs/DECISIONS.md` to find one.
- **Risks and issues:** what, impact, owner, status. Failures from the checks can
  open one automatically.

**Views:**
- Board by status (drag on the laptop, tap to move on the phone).
- List with filter and sort.
- Due soon and overdue.
- Blocked: tasks waiting on another task or on Kaycee.
- Timeline by project.

**How agents use it:** every new chat reads the board at the start instead of a
pasted status file, and records what it did on the task it worked. An agent
proposes; Kaycee approves anything structural, as now.

**Starting content:** imported from `docs/launch-plan.json`, `docs/DECISIONS.md`
and today's sweep list.

## 4. Operations (everything the Mac dashboard has today)

| Mac dashboard | Online |
|---|---|
| Add a Client (birth details in, chart, reports, link and Notion row out) | same form, runs as a cloud job |
| Status: Today, Running now, Runs, Deliveries, Recent reports | same, live |
| Failures: every issue the checks found, excerpt on tap | same |
| Daily Transit Reports, with links | same (already partly online) |
| Funnel: accounts, clients and the gap | same |
| Launch: phases, items, decided, still open, where everything lives | folds into Project management |
| Changes: what we changed, charts published, rollback | same |
| Metrics: Delivery, Cost, Quality, What is failing validation, The roster | same, cost including failed attempts |
| Buttons: Run, Rerun, Clear finished, Sync one database, Sync now | same, each asks to confirm and shows the job running |

**Already online, kept exactly as they work now** (built after the Mac
dashboard, so the Mac one never had them):

| Online today | What it does |
|---|---|
| Header | when charts were last rebuilt, which version of the site is running |
| Number tiles | open problem reports, people, signed up, accounts, live links, public figures, sandbox |
| Find box and sortable tables | find anyone, tap a heading to sort |
| Everyone | every chart, its link, tier, funnel, email; archive and delete; My Chart kept at the top in its own colour, asks first; the chart's data as a page to save |
| New chart | name, birth date, time and place (place lookup as you type), email, tier, how they got here, event name, who can see it; makes and publishes the chart with no questions asked, or opens the one that already exists |
| Reports | problems sent from a chart page with Report A Problem: who sent it, what, picture, device, page errors; status, notes and resolution; show or hide closed ones |
| Visits | which charts are opened, on phone, tablet or computer, which views are used, last opened (your own chart left out) |
| Status | the morning check's results with the fix for each failure |
| Transits | each day's transit report, with its link and markdown |
| Changes | what changed in the system, every chart published, rollback kept or not |
| Accounts | who has an account, since when, which charts they can see, whether they are your client, make admin |
| Decided | what was decided and when |
| Launch | the launch plan by phase, with status and notes |

Before anything is built, the online dashboard is checked again against this
table, so a feature added between now and then is not lost.

## 5. Data that moves off the Mac

| Today, on the Mac | Moves to |
|---|---|
| Report runs, attempts, deliveries, failures (`.cache/reports/*.jsonl`) | database tables |
| Running jobs (`.cache/client-jobs.json`) | database table |
| Client roster (`scripts/client-roster.ts`) | database table (the file stays as a backup until she says) |
| Change log | database table |
| Launch plan (`docs/launch-plan.json`) | Project management |
| Scheduled job logs (`~/Library/Logs`) | each job writes its result to the database |
| The finished report files | storage, beside the chart pages |

## 6. Build order

Each phase ends with Kaycee using it on her phone, not with an agent saying so.

1. **Data to the cloud:** the tables above, written by the existing scripts
   alongside what they write now. Nothing removed.
2. **Health strip and Operations parity:** the Mac dashboard's views, online.
3. **Buttons as cloud jobs:** Add a Client, rerun, sync.
4. **Executive view.**
5. **Project management.**

## Kaycee's answers (2026-10-29)

1. **Who signs in:** Kaycee only. Tennyson does not work on Delphi and gets no
   access.
2. **Red/amber/green thresholds:** set after she has seen the built views. Until
   then each number shows its trend with no colour, rather than colours an agent
   made up.
3. **Scope:** Delphi only. Never her contract PM work.
4. **Nothing is dropped** from either dashboard. Everything added to the online
   one since it launched (New chart above all, so making a chart never means a
   chat full of questions) carries over unchanged.

5. **Revenue:** Stripe only, for now.
