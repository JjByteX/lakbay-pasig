-- Discovery content video link. Human-approved: one optional YouTube or
-- Facebook video per entry, both kinds (place entries and trail notes).
-- docs/discovery-content-plan.md.
--
-- video_url holds the canonical link to the video on YouTube or Facebook, not
-- a file: nothing is stored or served from this project. The app builds the
-- embed address from it when the entry is shown (src/lib/video-embed.ts).
-- Null means no video. Existing rows have none.
--
-- The check keeps the column to https links on the two providers, so a bad
-- value cannot arrive from outside the form. The app validates the same
-- shape first and stores a cleaned link.

alter table public.discovery_content
  add column video_url text;

alter table public.discovery_content
  add constraint discovery_content_video_url_provider
  check (
    video_url is null
    or video_url ~* '^https://((www|m|web)\.)?(youtube\.com|facebook\.com)/'
    or video_url ~* '^https://(youtu\.be|fb\.watch)/'
  );
