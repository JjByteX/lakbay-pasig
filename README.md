# Lakbay Pasig

Tourism Office backed platform for Pasig heritage sites, businesses, and guided routes. PWA, built around sequenced location based storytelling.

## Docs

- `project-foundation/` — project brief, constraints, architecture notes, decision log. Read these first.
- `docs/` — feature specs: data model, vendor mode, admin panel, nav and access control.
- `build-order.md` — what to build, in order.
- `theme-reference.css` — brand color tokens for shadcn.

## Stack

React + TypeScript + Vite, shadcn/ui + Tailwind, Supabase (PostgreSQL), Hostinger hosting. Full reasoning in `project-foundation/architecture-notes.md`.

## Local Setup (Windows, no experience needed)

This runs everything on your own PC. Follow the steps in order.

**1. Install Git**
Go to https://git-scm.com/downloads/win, download, run it, click Next until done.

**2. Install Node.js**
Go to https://nodejs.org, download the LTS version, run it, click Next until done.

**3. Install Docker Desktop**
Go to https://www.docker.com/products/docker-desktop, download, run it. Accept WSL 2 if asked. Restart your PC after. Open Docker Desktop and wait until it says running. Keep it open the whole time you work on this project.

**4. Get the code**
Open Start menu, type Git Bash, open it. Paste the `git clone ...` link your team gave you, press Enter. Type `cd lakbay-pasig`, press Enter.

**5. Install and start**

```bash
npm install
npm run db:start
```

First time takes a few minutes. Wait for it to finish and print some URLs and keys, don't close the window.

**6. Run it**

```bash
npm run dev:demo
```

`.env.demo.local` already has the local dev URL and key filled in, no copying or editing needed. Open the link it prints, usually http://localhost:5173. Press Ctrl+C in Git Bash to stop.

**Next time**
Open Docker Desktop, wait for running. Open Git Bash, `cd` into the folder. Run `npm run db:start`, then `npm run dev:demo`.

**If it breaks**
- Won't start, mentions docker: Docker Desktop isn't open. Open it, wait, retry.
- No data or login broken: make sure you ran `npm run dev:demo`, not plain `npm run dev`.
- Still broken: run `npm run db:nuke`, then try again.
- Nothing here helps: send a screenshot to whoever set this up.

This only touches your own PC, never the real site.

---

## Local Setup (reference, for anyone comfortable with a terminal)

Needs: Node.js 22, Docker running.

```bash
npm install
npm run db:start
```

First run pulls Docker images and takes a few minutes. It also applies every migration in `supabase/migrations/` in order and seeds demo data (see Demo Data below). When it finishes, it prints local URLs and keys — these match what's already in `.env.demo.local`, no copying needed.

```bash
npm run dev:demo
```

This runs against the local Docker stack only, it never touches the real hosted project. See Local vs Hosted below for switching to the hosted project instead.

**Local services**

| Service | URL |
|---|---|
| API | http://localhost:54321 |
| Studio (DB dashboard) | http://localhost:54323 |
| Inbucket (catches test emails) | http://localhost:54324 |

Auth uses email verification. Use Inbucket to read those emails locally, no real inbox needed.

**Commands**

```bash
npm run db:start   # start local Supabase
npm run db:stop    # stop it
npm run db:status  # show URLs and keys again
npm run db:reset   # wipe local DB, reapply all migrations from scratch
npm run db:nuke    # Start Clean: wipe everything, containers and volumes, then rebuild
```

Run `db:reset` after pulling new migration files. Never edit a migration already merged to main, add a new one instead.

**Writing a new migration**

```bash
npx supabase migration new <name>
```

This creates an empty file in `supabase/migrations/`. Write your SQL in it, then run:

```bash
npm run db:reset
```

This reapplies every migration in order, including your new one, on top of a fresh database. If it applies clean, it will apply clean for everyone else too.

**Start Clean**

```bash
npm run db:nuke
```

Deletes the local database entirely and rebuilds it from scratch off the migration files, no cached state left over. Use this if the local DB feels broken in a way `db:reset` did not fix, or before testing a migration you are not sure about. Local data only, cannot touch the hosted project.

**If something breaks**

- `db:start` fails immediately: Docker is not running, open Docker Desktop and retry.
- Port already in use: run `npm run db:stop`, or find and stop whatever else is using 54321 to 54324.
- App can't connect or shows blank data: make sure you ran `npm run dev:demo` (not `dev:hosted` or plain `dev`). If `.env.demo.local`'s values are stale, refresh them from `npm run db:status`.
- Schema looks wrong: run `npm run db:reset` to rebuild from the migration files.

`supabase start` only touches local Docker containers, it cannot reach the real hosted project. Pushing to the real project only happens in CI on merge to `main`, using credentials nobody's local machine has.

## Local vs Hosted

This project can point at either the local Docker Supabase stack (demo data, safe to break, see below) or the real hosted project (real data, real signups). Two env files control which:

- `.env.demo.local` — local Docker stack, already filled in with the fixed local dev URL/key. Works out of the box after `npm run db:start`. Login accounts are in Demo Data below.
- `.env.hosted.local` — the real hosted project. Get the URL/key from Supabase Dashboard → Project Settings → API, or ask whoever manages the hosted project. A working copy may already be in this repo checkout if someone set it up before; if not, fill it in yourself.

Both are gitignored (matched by the existing `*.local` rule), never committed.

```bash
npm run dev:demo     # local Docker stack, demo accounts
npm run dev:hosted   # real hosted project, real accounts
```

Plain `npm run dev` has no env file of its own on purpose — it'll fail to connect until you pick one of the two above, so you can't accidentally end up on the wrong project without noticing.

To change which URL/key `dev:hosted` uses, edit `.env.hosted.local` directly. To refresh `dev:demo`'s values (e.g. after `db:nuke` regenerates local keys, which is rare but possible), run `npx supabase status -o env` and copy `API_URL` into `VITE_SUPABASE_URL` and `ANON_KEY` into `VITE_SUPABASE_ANON_KEY` in `.env.demo.local`.

## Demo Data

`supabase/seed.sql` is applied automatically by `npm run db:start` (first run) and `npm run db:reset` on the local Docker stack. It's dev-only — never runs against the hosted project, so it's safe to keep in the repo. No sign-up needed: log in as any account below.

**Password for every account:** `Demo!Password123`

| Role | Login | Notes |
|---|---|---|
| Admin | `admin1@lakbay-demo.local` | CATO Officer In Charge |
| Admin | `admin2@lakbay-demo.local` | Assistant Department Head |
| Staff | `staff.places@lakbay-demo.local` | Places permission only |
| Staff | `staff.business@lakbay-demo.local` | Business review permission only |
| Staff | `staff.events@lakbay-demo.local` | **Inactive** — use to test the forced-signout path |
| Staff | `staff.new@lakbay-demo.local` | No permissions assigned — tests the empty "no sections" state |
| Resident | `resident1@lakbay-demo.local` – `resident6@lakbay-demo.local` | Registered users, no business |
| Vendor | `vendor1@lakbay-demo.local` – `vendor6@lakbay-demo.local` | Residents with a business (vendor mode) — mixed ages and verification states |

Guest needs no login, it's just the signed-out state.

Data also covers places, businesses (with items/photos/flags/review log), routes and trails, events, trail credentials, and personal records (saved places/routes, completed routes, earned credentials) across every status value the app checks for, so admin lists, filters, and badges have something real to render.

**Reseed without a full reset** (keeps containers up, just re-runs the seed file):

```bash
npx supabase db reset --local
```

(This is the same thing `npm run db:reset` runs — either works.)

## Status

Auth and roles, core data models, and the CATO Admin Panel (Dashboard, Places, Businesses) are built. Next up is step 4, Events & Announcements, Trails, and Staff. See `build-order.md` for the full list.
