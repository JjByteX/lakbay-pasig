# Lakbay Pasig: CATO Staff Admin View

## Format

Admin panel style, not the 5 tab consumer nav. Desktop first, still usable on mobile. Sidebar navigation instead of bottom tabs.

## Access Rule

Sidebar sections show only if the staff member's System Permission includes that area. A staff member who can only review business listings sees Dashboard and Businesses, nothing else. No greyed out sections, unauthorized areas do not appear at all.

## Sidebar Sections

### Dashboard
Always visible to every staff member. Shows pending counts per queue the staff member has access to, and a recent activity feed. Landing page after login.

### Places
Manage Local Historical Place entries. Create, edit, verify. Own review queue for pending place submissions or edits.

### Businesses
Review submitted business listings. Own review queue. Actions: verify, reject with review notes, set featured status. Featured status is a direct toggle, no form or criteria checklist, staff discretion only.

### Events & Announcements
Create, edit, publish. Set status: upcoming, ongoing, past.

### Trails
Build routes. Set theme, place order, estimated duration and budget. Assign Discovery content per stop, set unlock radius and sequence.

### Staff
Manage other CATO Staff accounts: permissions, position, active status. Limited to Admin role only, Staff role has no access to this section.

## Review Queues

Separate queue per content type: Places, Businesses. Not one shared queue.

Reason: each type has different review criteria. A business review checks permit status and category accuracy. A place review checks historical accuracy and source credibility. A shared queue forces constant context switching and does not fit the permission split, since a staff member may only have access to one type.

## Review Action Log

Every review action is logged, not just the final result. Each log entry stores: staff ID, action taken (verify, reject), timestamp, and review notes if rejected. The record itself still keeps a Reviewed By field for the current status, but the full history stays visible for accountability.

## Staff Roles

Two roles, not more.

**Staff**
Day to day content work. Manage Places, review Businesses, post Events, build Trails. No access to the Staff section.

**Admin**
Everything Staff can do, plus the Staff section: create staff accounts, set permissions, set Active or Inactive status.

Reason: account and permission changes carry more risk than content changes. A bad business review is fixable and logged. A wrong permission grant compounds. Keeping that power with a smaller, more trusted group limits that risk without adding a third tier the office does not need at this size.

## Trail Publishing

No second reviewer required for a standard Trail. The Staff member who builds it can publish directly.

Reason: a Trail is mostly sequencing of Places and Businesses that already went through their own review. The app's core pitch is speed against the 7 day and 40 day timelines in the Citizen's Charter, so adding a second approval step here works against that pitch without a strong enough safety reason.

Exception: if a Trail's Discovery content introduces new historical claims not already tied to a verified Place, treat that content like a Place edit and route it through the Places review queue before the Trail goes live.
