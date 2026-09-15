-- New event_categories rows for real CATO content. Human-confirmed per
-- constraints.md's No Silent Overrides rule.
--
-- Gap: the 5 rows migration 0024 seeded (workshop, festival, heritage
-- walk, program enrollment, general announcement) were carried over
-- verbatim from the old fixed-list events.category values, none of which
-- match the 3 categories on the real CATO announcements being seeded now
-- (Cultural & Heritage, Youth & Education, Arts & Culture). Human decided
-- to add these as new rows rather than force-fit the real content into
-- the old 5, per this migration's own instruction.
--
-- sort_order continues after the existing 5 (1-5 already taken).
-- icon uses the same map-pin placeholder 0024 used for its own 5 rows,
-- unchanged reasoning: the real Announcements icon set is still an open
-- item, not blocking this migration.

insert into public.event_categories (name, icon, sort_order) values
  ('Cultural & Heritage', 'map-pin', 6),
  ('Youth & Education', 'map-pin', 7),
  ('Arts & Culture', 'map-pin', 8);
