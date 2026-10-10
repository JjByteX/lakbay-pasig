# help-faq-plan.md

Status: Phases 1 to 3 (residents), Phase 4 (admin), and Phase 5 (search) built, not yet run.

## Goal

A Help & FAQ page, opened from the profile menu, that answers the most common questions in one place. Works for guests and signed in users. Staff and admins get their own version inside the admin panel.

## Decided

- Own page at `/help`, not a modal. The list is long and scrolls. ux-ui-guidelines.md keeps modals for content that fits one viewport. Settings stays a modal because it is a short form.
- Public. No sign in needed. Guests have a profile menu too, so it appears there.
- Inside `PublicShell`, same as Profile. Not a tab, not in `SEARCH_VISIBLE_PATHS`, no bottom nav highlight.
- One label, "Help & FAQ", for the menu item and the page title. No subtitle that repeats it.
- Icon: Phosphor `Question`, left of the label, like the other menu items.
- Copy lives in `src/lib/help-content.ts`: topics, each with questions and plain text answers. Numbers (unlock radius, trail and stop limits) come from the code's own constants.
- Collapsible rows use native `<details>`. There is no accordion in `components/ui`, so this adds no dependency. The list is `src/components/help-topic-list.tsx`, shared by both pages.
- Residents get `/help`. Staff and admins get `/admin/help`, with its own copy (see Admin).
- English only.
- CATO contact is shared: `src/lib/cato-contact.ts` holds name, email, phone, and Facebook. `landing.tsx`, `privacy.tsx`, and the Help page import it. The street address stays in `landing.tsx` and `privacy.tsx`, the only pages that print it.

## Menu (Phase 2)

Signed in: Profile, Settings, Help & FAQ, Staff/Admin View, Home Page, then Sign out.

Guest: Home Page, Help & FAQ, Sign in.

| File | Change |
| --- | --- |
| `public-shell.tsx` `AccountMenu` | Add item to the guest and signed in branches (mobile). |
| `public-sidebar.tsx` | Add item to the signed in dropdown. Add a row to the guest footer (desktop). |

## Page

- `PageContainer width="form"`, same as Profile.
- Title "Help & FAQ" via `usePageTitle`.
- Topic headings, with collapsed question rows under each.
- Bottom block "Still need help?": CATO name, email, phone, Facebook, and a link to `/privacy`.

## Content

20 questions in 8 topics.

- **Getting started:** What is Lakbay Pasig. Do I need an account. What the status labels mean.
- **Discover:** Why location. Directions. Voice search.
- **Trails:** How a trail works. Why a stop is locked. Scan a QR code. Credential. Do a trail again. Your trails.
- **Saved:** What I can save. Hide a suggestion.
- **Account:** Change details. Dark mode and text size. Delete account.
- **Businesses:** List my business. Featured.
- **Report a problem:** Who to tell. Points to CATO until a report action exists (build-order step 10).

Typed label names in answers (Start trail, Restart trail, Directions, Not interested, List your business) must change with the screens.

## Phases

1. **Page.** `help-content.ts`, `help.tsx`, the `/help` route. Contact file already shared. Reachable by URL.
2. **Menu.** Add the item to the mobile and desktop profile menus, signed in and guest.
3. **Docs.** `navigation-and-access-control.md` lists `/help` as public. `build-order.md` adds the step. `decision-log.md` adds the entry.
4. **Admin.** Shared list component, `/admin/help`, admin copy, menu item, and the docs for it.
5. **Search.** A search box at the top of the shared list, so both pages get it. See Search.

## Admin (Phase 4)

- Route `/admin/help`, inside the admin shell, so staff are not pulled out to the resident app. No `requiredPermission`: every staff account sees it, same as the Dashboard and Settings.
- Menu: Help & FAQ after Settings in the admin account menu (bottom of the sidebar). It also closes the phone sidebar sheet, like the Search row.
- Not a sidebar row. Settings is not one either, and the Tools list stays for work sections.
- Header is `AdminPageHeader`, the same as other admin pages. Body size is `text-sm` (the list's `dense` option). The page scrolls, since it is not in `admin.tsx`'s bounded list.
- Copy in `src/lib/admin-help-content.ts`, 22 questions in 5 topics: Getting around, Reviewing, Content, Admins only, Your account.
- No contact block. Staff are CATO, so the answers send them to an Admin.
- Same upkeep as the resident copy: section, button, and permission names are typed text.

## Search (Phase 5)

- The box lives in `src/components/help-topic-list.tsx`, above the topics, so the resident and admin pages both get it with no change to either page file. The matching is `src/lib/help-search.ts`.
- Filters as you type, no button and no debounce: the copy is a few dozen strings in memory.
- Every word of the query must be found, in any order, in the question, the answer, or the topic title. "trails" brings up the whole Trails topic.
- Typo tolerant, on the same rules as the global search (`0042_fuzzy_search.sql`): lowercase, accents and apostrophes dropped, a word matches inside the text or within a few edits of one of its words, and short words get none. Edits allowed: 0 up to 4 letters, 1 for 5 to 8, 2 from 9. A swapped pair counts as one edit. "signin" finds "Sign in".
- The edit allowance is stricter than the database's (1 from 4, 2 from 5), because whole answers hold many more words than a place name and a looser rule matches unrelated ones.
- A small synonym map in the same file turns what people type into the copy's word: trip, tour, journey to trail; login to sign; shop, store to business; badge to credential; remove to delete; bug, issue to problem, and so on. One way, single words. Add a line when a real search finds nothing.
- Results keep the page's order, not ranked.
- Topics with no matching question drop out. Matching answers open by themselves while a search is active, and close again when it is cleared.
- Nothing found: the shared `EmptyState` with "No answers for ...".
- Clear button appears once there is text. Escape also clears.
- Screen readers hear the match count through a hidden status line.
- Size follows `dense`: resident `h-11 text-base` (no iOS zoom), admin `h-9 text-sm`.
- Not the global search bar. That one queries the database for places, businesses, items, trails, and events, and the shell hides it on Profile. This one filters the page's own copy, in the browser.
- Check: `node scripts/help-search-check.mjs` (Node 22.18+). It asserts the rules above on a few lines of copy.

## Files

New:
- Phase 5: `src/lib/help-search.ts`, `scripts/help-search-check.mjs`.
- `src/pages/help.tsx`
- `src/lib/help-content.ts`
- `src/components/help-topic-list.tsx`
- `src/pages/admin-help.tsx`
- `src/lib/admin-help-content.ts`

Edited:
- Phase 5: `src/components/help-topic-list.tsx`.
- `src/App.tsx`: `help` route under the shell, no `ProtectedRoute`. `help` route under `/admin`, no permission.
- Phase 2: `public-shell.tsx`, `public-sidebar.tsx`.
- Phase 4: `admin-sidebar.tsx`.

Already done in the project:
- `src/lib/cato-contact.ts`, `landing.tsx`, `privacy.tsx`.

## Left out

- Highlighting the matched words in answers.
- Ranking results. Tagalog or other languages in the synonym map (copy is English only).
- Link to a single question (`/help#...`).
- "Was this helpful" voting.
- Contact form or chat.
- A Help row in the admin Tools list.
- Onboarding tour.
