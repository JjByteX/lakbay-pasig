# build-order.md

What to build, in order. Each step assumes the ones before it exist.

- [x] 1. **Auth and roles**
      Supabase Auth, email verification. Four roles: Guest, Registered User, Vendor, CATO Staff. Row level security policies for each role.

- [x] 2. **Core data models**
      Local Historical Place, Local Business, Route/Trail, Discovery Content, Event/Announcement, CATO Staff, End User. Schema first, no UI yet.

- [x] 3. **CATO Admin Panel: Dashboard, Places, Businesses**
      Sidebar shell with role based section visibility. Places and Businesses review queues, separate from each other. Verify, reject with notes, set Featured status.

- [ ] 4. **CATO Admin Panel: Events & Announcements, Trails, Staff**
      Event creation and status. Trail builder: theme, place order, duration, budget, Discovery content assignment. Staff section, Admin role only.

- [ ] 5. **Public app: Discover**
      Search and map lookup for Places and Businesses. Verification label on every result. This is the daily habit tab, build it early.

- [ ] 6. **Public app: Home**
      Feed of published announcements and recently verified content. Depends on step 4 having real content to show.

- [ ] 7. **Public app: Trails**
      Trail catalog, trail detail, stop sequencing, GPS proximity unlock, trail completion, credential on finish. Guest preview access, sign-in gate only on state changing actions.

- [ ] 8. **Public app: Saved and Profile**
      Saved places, saved trails, completed trails, credentials. Profile account info and preferences. Vendor mode toggle entry point lives here.

- [ ] 9. **Vendor mode**
      Mode switch from Registered User. Basic listing (instant live, Pending badge) and Featured listing (staff toggle, no application flow). Item list with optional pricing. Vendor dashboard with trail inclusion metrics.

- [ ] 10. **Abuse prevention layer**
       One listing per account by default, second attempt flagged not blocked. Submission rate limit. Report/flag action. Review queue priority ordering.

- [ ] 11. **Content population**
       Import or enter real Places, Businesses, and past vendor list data from CATO. Content task, not a build task, do last so the schema is stable first.
