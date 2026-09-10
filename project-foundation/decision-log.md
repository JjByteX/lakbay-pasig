# decision-log.md

---
## AI RULES — READ FULLY BEFORE ANY ACTION
---

1. Read all existing entries before suggesting anything already decided.
2. Never re-debate a logged decision. If it needs revisiting → flag it,
   don't silently override it.
3. At every major milestone → add an entry before continuing.
4. Before logging anything, apply this filter — if ALL three are false, skip it:
   - Hard to reverse?
   - Affects other parts of the system?
   - Confusing without an explanation?
5. Before presenting options at a milestone → search current community
   consensus on each direction. Present findings, then wait for human
   decision before logging.
6. If two directions were discussed with the human → both get logged,
   with the reason the chosen path was taken.

---
## DECISION ENTRIES
---

**#:** 1
**Date:** Step 5, Phase 6
**Milestone:** Step 5, Phase 6 — Result card and result detail

**Context:**
Building discover-business-detail.tsx's item list (step-5-phases.md 6.4) surfaced that migration 0015 (Phase 1) widened `businesses_select_public` from `verified` to `verified` or `pending`, but never widened `business_items_select_public`, which still gated on the parent row's `verification_status = 'verified'` only. A pending business's item list would silently return zero rows under RLS, not an error, undermining the exact visibility Phase 1 was meant to deliver for Discover.

**Options Considered:**
- Option A: Leave `business_items_select_public` as-is, ship Phase 6 with pending businesses showing no items (silently degraded, not flagged).
- Option B: Widen `business_items_select_public` to match the parent policy (`verified` or `pending`), same shape as 0015.

**Community Consensus:**
Not applicable, this is a same-codebase consistency fix (matching a sibling table's RLS to its own parent policy), not a technology or pattern choice with an external best-practice debate.

**Decision:**
Option B. New migration 0016 widens `business_items_select_public` to check the parent business for `verification_status in ('verified', 'pending')`, mirroring 0015 exactly. Schema and RLS are on architecture-notes.md's never-touch-without-approval list; flagged and confirmed before writing, per constraints.md's No Silent Overrides rule, matching how Phase 1's own migration was handled.

**Consequences:**
Discover's business detail page now shows a pending business's item list correctly, matching step-5-phases.md 6.4's own scoping. No other table or policy is affected, `business_items_select_own` and `business_items_write_staff` are unchanged. Any future widen of `businesses_select_public` should be checked against `business_items_select_public` (and any other child-table policy keyed off the parent's status) at the same time, this gap existed because the two were widened in two different passes.

---

### Entry Format — copy this block for each new decision

**#:**
**Date:**
**Milestone:** (e.g. "Project start", "30% — authentication approach")

**Context:**
What situation or problem forced this decision?

**Options Considered:**
- Option A:
- Option B:

**Community Consensus:**
What do experienced developers say about each option today?
(AI: search this before the milestone conversation — do not fill from memory alone)

**Decision:**
What was chosen and why?

**Consequences:**
What does this decision affect going forward?
What becomes harder or easier because of this choice?

---
