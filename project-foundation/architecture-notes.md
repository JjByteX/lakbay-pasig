# architecture-notes.md

---
## AI RULES, READ FULLY BEFORE ANY ACTION
---

1. Read this entire file before proposing any structure, modifying
   any file, or debugging anything.
2. Project scale drives everything. Read the Scale field first.
   Do not propose a structure that exceeds what the scale requires.
3. Before touching any file, identify all files connected to it.
   This map is your reference. If a connection is not listed here,
   find it before proceeding. Do not assume it is isolated.
4. If the structure evolves during the build → update this file.
   An outdated map is worse than no map.
5. Never create folders or layers that the current scale does not
   justify. Do not over-architect small projects. Do not under-
   structure large ones.

---
## SCALE, READ THIS FIRST
---

**Project Scale:**
[x] Medium, multiple features, growing complexity, needs modularity

**Scale Guidelines the AI must follow:**

Small → near-flat structure. Minimal subfolders. Group only what
        genuinely needs grouping. No layers for their own sake.

Medium → feature-based grouping. Each feature owns its files.
         Shared utilities in one place. Clear separation of concerns
         without over-engineering.

Large → fully modular. Domain-driven. Each module is independently
        navigable. Explicit dependency boundaries. Documented entry
        points for every major section.

---
## PROJECT REFERENCE
---

**Project Type:**
Progressive Web App

**Tech Stack:**
- Frontend: React with TypeScript, built with Vite
- UI Components: shadcn/ui with Tailwind CSS
- Backend and Database: Supabase, built on PostgreSQL
- Auth: Supabase Auth, email verification only
- Hosting: Hostinger Node.js hosting, deployed through GitHub integration, connected to Supabase through Hostinger's built in database connector
- Other: role based access through Supabase row level security, matching the Guest, Registered User, Vendor, and CATO Staff roles defined in navigation-and-access-control.md and admin-panel-spec.md

Reasoning: the data model is relational, Places, Trails, Businesses, and Staff permissions all link to each other. PostgreSQL fits this better than a NoSQL database. Supabase adds row level security that maps directly onto the four user roles already defined. shadcn/ui requires TypeScript in its standard setup path, which also adds type safety across the connected data model for a team of three.

**Entry Points:**
What are the main files or modules everything else flows from?
(e.g. main.js, App.tsx, index.py, routes/index.ts)

**Folder Structure:**
Paste or describe the current structure here.
AI: if this is empty at project start → propose a structure based
on the Scale field above, explain each folder's purpose, and wait
for human approval before creating anything.

**Module / Feature Map:**
List the main modules or features and what each one is responsible for.
- Home → recently verified content, CATO announcements, program updates
- Discover → search and map lookup for places and businesses, verification labels shown on every result
- Trails → trail catalog, trail detail with sequenced stops, Discovery content unlock, trail completion and credentials
- Saved → saved places, saved trails, completed trails, earned credentials
- Profile → account info, preferences, vendor mode toggle entry point
- Vendor Mode → business listing creation, listing tiers (Basic, Featured), item and price management, vendor dashboard metrics
- CATO Admin Panel → sidebar sections for Places, Businesses, Events and Announcements, Trails, Staff, each gated by Staff or Admin role
- Auth → Supabase Auth, email verification, role assignment for Guest, Registered User, Vendor, CATO Staff

**Key Dependencies Between Files:**
Which files depend on which? What breaks if X changes?
(This is the map the AI uses before touching anything)
- [file/module] → depends on → [file/module]
- [file/module] → depends on → [file/module]

**What Must Never Be Touched Without Human Approval:**
(e.g. auth logic, payment flows, database schema, config files)

**Known Fragile Areas:**
Areas of the codebase that have caused bugs before or require
extra care when modified.

---
## STRUCTURE CHANGE LOG
---
AI: when the structure changes during the build, log it here.

| Date | Change | Reason |
|------|--------|--------|
|      |        |        |

---
