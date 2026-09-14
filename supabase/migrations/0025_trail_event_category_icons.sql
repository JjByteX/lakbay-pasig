-- Category Directory, Phase 1.6/1.9 follow-up. 0023 and 0024 seeded
-- trail_categories and event_categories with a map-pin placeholder icon,
-- pending the icon shortlist confirmation flagged in the plan doc. Both
-- are now confirmed (trail-category-icons.ts, event-category-icons.ts).
-- This is a plain update, not a re-migration of the tables themselves,
-- exactly as 0023's and 0024's own comments said this step would be.

update public.trail_categories set icon = 'footprints' where name = 'heritage walk';
update public.trail_categories set icon = 'utensils' where name = 'food crawl';
update public.trail_categories set icon = 'palette' where name = 'cultural tour';

update public.event_categories set icon = 'wrench' where name = 'workshop';
update public.event_categories set icon = 'party-popper' where name = 'festival';
update public.event_categories set icon = 'footprints' where name = 'heritage walk';
update public.event_categories set icon = 'clipboard-list' where name = 'program enrollment';
update public.event_categories set icon = 'megaphone' where name = 'general announcement';
