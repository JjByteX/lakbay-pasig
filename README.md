# Lakbay Pasig

Tourism Office backed platform for Pasig heritage sites, businesses, and guided routes. PWA, verified by CATO, built around sequenced location based storytelling.

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

**6. Set up your .env**
Copy `.env.example`, rename the copy to `.env`, open it with Notepad. Paste the two values printed in step 5:

```
VITE_SUPABASE_URL=<API URL from step 5>
VITE_SUPABASE_ANON_KEY=<anon key from step 5>
```

Save and close.

**7. Run it**

```bash
npm run dev
```

Open the link it prints, usually http://localhost:5173. Press Ctrl+C in Git Bash to stop.

**Next time**
Open Docker Desktop, wait for running. Open Git Bash, `cd` into the folder. Run `npm run db:start`, then `npm run dev`.

**If it breaks**
- Won't start, mentions docker: Docker Desktop isn't open. Open it, wait, retry.
- No data or login broken: check `.env` matches `npm run db:status`.
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

First run pulls Docker images and takes a few minutes. It also applies every migration in `supabase/migrations/` in order. When it finishes, it prints local URLs and keys.

Copy `.env.example` to `.env` and fill in the printed values:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=<the "API URL" value>
VITE_SUPABASE_ANON_KEY=<the "anon key" value>
```

These are local only, they never touch the real hosted project.

```bash
npm run dev
```

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
- App can't connect or shows blank data: check `.env` has the local values from `npm run db:status`, not the hosted project's.
- Schema looks wrong: run `npm run db:reset` to rebuild from the migration files.

`supabase start` only touches local Docker containers, it cannot reach the real hosted project. Pushing to the real project only happens in CI on merge to `main`, using credentials nobody's local machine has.

## Status

Auth and roles, core data models, and the CATO Admin Panel (Dashboard, Places, Businesses) are built. Next up is step 4, Events & Announcements, Trails, and Staff. See `build-order.md` for the full list.
