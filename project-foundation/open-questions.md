# open-questions.md

---
## AI RULES — READ FULLY BEFORE ANY ACTION
---

1. Read this file at the start of every session and at every
   major milestone.
2. Section 1 questions are hard blockers. Do not write any code
   or make any structural decision until all Section 1 questions
   are answered by the human.
3. Section 2 questions are active blockers. Do not pass the
   milestone they are tagged to without resolving them first.
4. When uncertain mid-build → do not guess. Add a question to
   Section 2 with its milestone tag, flag it to the human, and
   wait for an answer before continuing.
5. When a question is answered → move it to the Resolved log
   at the bottom. Never delete questions — resolved ones become
   part of the project's decision history.
6. Never answer your own questions with assumptions. If a question
   is here, it means a human decision is required.

---
## SECTION 1 — BEFORE STARTING
---
These must all be answered before any code is written.
If any are blank → stop and ask.

| # | Question | Answer |
|---|----------|--------|
| 1 |          |        |
| 2 |          |        |
| 3 |          |        |

---
## SECTION 2 — ACTIVE DURING BUILD
---
Questions that surfaced mid-project.
Each question is tagged to the milestone where it must be resolved.

| # | Question | Milestone | Answered? |
|---|----------|-----------|-----------|

---
## HOW TO ADD A QUESTION (AI instructions)
---

When you hit uncertainty mid-build:
1. Stop what you are doing
2. Write the question clearly and specifically —
   not "what should I do here?" but "should the user
   profile data be fetched on login or on page load,
   given that X and Y are both affected by this choice?"
3. Tag it to the nearest upcoming milestone
4. Tell the human: "I've added a question to open-questions.md
   before I can continue. See question #[N]."
5. Wait for the answer before proceeding

---
## RESOLVED QUESTIONS
---
Answered questions live here permanently as part of project history.

| # | Question | Answer | Resolved At |
|---|----------|--------|-------------|
| 1 | admin-dashboard.tsx's "Recent activity" feed queried place_reviews with no reviewed_type filter, mislabeling discovery_content ("Trail Content") reviews as "a place" since migration 0014 widened the table. | Query now runs twice, once per reviewed_type ('place', 'discovery_content'), each mapped to its correct section label. See architecture-notes.md's changelog. | Post-6.1 fix |
| 2 | Photos are real files (30, Google Drive export), not placeholder URLs. Serve from `public/` or upload to Supabase Storage? | Supabase Storage — human wants something demoable in production, not just local dev. | Content population round 1 |
| 3 | Does include-all-photos cover the 4 non-photo brand assets (2 logos, duplicate promo poster, founder portrait)? | Yes, included as rows in `business_photos`. | Content population round 1 |
| 4 | Three Sisters' Restaurant of Pasig: submitted contact info (10 East Capitol Dr.) doesn't match what the storefront photo suggests. Use as submitted or correct it? | Correct it. Verified via web search: their own Instagram (most recent) lists the current address as 136 West Capitol Drive, Brgy. Kapitolyo, Pasig, phone (02) 631-9247 / +63 917 636 2134. Older sources (2013-2020) confirm 8/10 East Capitol Dr. was the prior location before a documented move to West Capitol; the submitted address was the outdated one. Phone number carried over unchanged, consistent across old and new listings. | Content population round 2, verified via web search |
| 5 | NEW_DATA.md's 3 event categories (Cultural & Heritage, Youth & Education, Arts & Culture) don't match the 5 seeded `event_categories` rows. Map to existing categories or add new ones? | Add new. `event_categories` gets 3 new rows (Cultural & Heritage, Youth & Education, Arts & Culture) rather than force-fitting into workshop/festival/heritage walk/program enrollment/general announcement. | Content population round 2 |
| 6 | Should each seeded photo row carry a caption/alt text? Neither `place_photos` nor `business_photos` has a caption column today, so this would need a schema change. | No. Stays as-is, no new column, no captions. Rows keep only `photo_url`/`sort_order` (plus `photo_type` on places). | Content population round 3 |
| 7 | "Pasig Creative Arts Academy: Summer Youth Workshops" names "Youth Development Center" as its location, not among the 4 submitted Places. Add it as a new Place, or leave `related_place_id` null? | Add it. New Place, category Cultural Site, address F. Legaspi St., Rainforest Park, Barangay Maybunga, Pasig City. Historical fields (background, significance, year built, source) left minimal/not applicable since it's a modern civic facility, not a heritage structure. | Content population round 3 |
| 8 | Real Places/Businesses/Events are ready to seed, but no real Routes/Trails data has been submitted yet. The sample Routes/route_stops/discovery_content/trail_credentials all reference sample Place/Business rows being removed. Also, sample completed_routes/user_credentials/saved_routes/saved_places reference those same sample route/place IDs. Proposed: drop all Routes/Trails and dependent personal-record rows for now (empty until real Trail data arrives), rather than inventing placeholder trails over real content or leaving stale references. Confirm, or hold off content population until Trail data is ready? | Drop them. All sample/fake data being replaced anyway; leave routes, route_stops, discovery_content, trail_credentials, completed_routes, user_credentials, saved_routes, saved_places empty until real Trail data is submitted. | Content population round 4 (seed.sql rewrite) |

---
