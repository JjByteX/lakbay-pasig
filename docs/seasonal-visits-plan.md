# Seasonal Visits: Plan and Reasoning

Status: proposal, no code yet. Written for Lakbay Pasig.

## The idea

Show when a place or business is busiest through the year, for example a cemetery around Undas (November) or a church during Simbang Gabi (December). Seasonality is measured from real visits, not set by hand.

## Is it a good idea?

Yes, with changes.

- Tourists get practical timing information.
- The Tourism Office gets foot-traffic insight. `docs/competitive-positioning.md` already names "tracking foot traffic to know where to invest attention" as what makes the city run on the app.
- Vendors get proof points like "part of 300 food crawls this quarter."

## Conflicts with existing decisions, and how to resolve them

| Existing decision | Source | Resolution |
|---|---|---|
| Click and view tracking, popularity, and trending are rejected for recommendations | `decision-log.md` #40 | Count verified visits only (trail completions, check-ins), never clicks or page views. Do not feed this into the recommendation row. Add a new decision-log entry explaining the difference. |
| Ranking by repeat visits rewards the wrong behavior | `competitive-positioning.md` | No user leaderboards. Show place-level aggregate labels only. |
| Fake accounts can flood save and view counts | `vendor-mode-spec.md` | Use hard-to-fake signals (verified visits) and keep a minimum-data threshold. Unlocks are already one per user per entry. Add a daily cap only if gaming shows up. |
| Location is never stored or logged | `recommendations.ts` | Visit events carry no user identity. Store only place or business ID and timestamp. |

## Keep it simple and automatic

The whole system is three parts, and none need manual upkeep:

1. **One table.** Each verified visit adds a row (place or business ID, kind, timestamp). One table with a kind column covers both places and businesses.
2. **One nightly job.** It recalculates each place's busiest months from that table. New places are picked up automatically.
3. **One rule for showing a label.** A place shows a label once it passes the visit threshold, and hides it otherwise.

Why it adapts as data grows:

- Labels are relative to each place's own history, so they sharpen as visits accumulate.
- Dividing by total app traffic keeps growth from skewing results.
- A place with no label today gets one automatically once it passes the threshold.
- Phase 3 forecasting only changes the calculation. The table stays the same.

Set once and never touched again: the visit threshold (30 visits in 12 months, plus 12 months of history) and the peak cutoff (about 1.5x normal).

Deliberately left out for now: a daily visit cap, separate tables for places and businesses, and any manual tagging.

## Design principles

1. **Measured, not manual.** Seasonality is computed from data. Nothing is hand-tagged.
2. **Verified visits only.** The unit is a completed trail stop or check-in.
3. **Place-level, never person-level.** No rankings of individuals.
4. **Informational only.** Labels do not influence recommendation ranking.
5. **Honest labeling.** Say "among Lakbay Pasig visitors," not "all visitors." App users skew toward certain groups.
6. **Hide thin data.** No label until a place has enough visits and the app has enough history.

## Roadmap (4 phases)

### Phase 1: Collect clean data (now)

You cannot backfill visits that were never recorded, so this step comes first.

- One row per verified visit: place or business ID plus timestamp.
- Append-only: rows are never edited or overwritten.
- No user ID on the row.
- One table with a kind column (place or business).
- Log the decision in `decision-log.md`.

### Phase 2: Simple seasonality, no ML (after about 1 year)

Plain aggregation in Postgres, run nightly like the existing embedding job.

1. Count verified visits per place per month.
2. Divide by the app's total verified visits that month. This prevents app growth from making every place look busiest in recent months.
3. Compare each month's share to that place's own average. A month at 1.5x or more counts as "peak."
4. Shrink small counts toward the average so low-volume places do not get wild labels.
5. Show a label only if the place has at least about 30 visits and the app has at least 12 months of history.

Output: labels such as "Busiest in: Nov, Dec."

### Phase 3: Forecasting (after about 2 to 3 years)

- Use STL decomposition or Prophet to separate trend, season, and one-off spikes.
- Average across years so one unusual event does not define a season.
- Add crowd-level hints ("usually quiet on weekday mornings") and next-week expectations.
- Give the Tourism Office a planning view, for example which sites need staff or cleanup before Undas.
- Use weekly buckets for short fixed-date events (Undas on Nov 1 to 2, Simbang Gabi on Dec 16 to 24).

### Phase 4: Optional extras (done)

- Cross-reference Tourism Office event and fiesta calendars to explain why a place peaks. Done as timing only ("Around the same time"), using the existing `related_place_id` link on fiestas and events. See decision-log #57.

## What not to use now

- **Prophet, STL, SARIMA, deep models:** need years of data and answer "what will happen," which is not needed yet.
- **A data warehouse:** Postgres handles millions of events comfortably.

## How enterprise systems do it

| Layer | What they do | Lakbay Pasig equivalent |
|---|---|---|
| Event pipeline | Immutable event log feeding a warehouse (BigQuery, Snowflake) | Append-only visits table in Postgres |
| Aggregation | Scheduled rollups into daily, weekly, and monthly tables | Nightly job or materialized view |
| Forecasting | STL, Prophet, SARIMA, plus holiday, weather, and event signals | Later phase, once data exists |
| Privacy | Anonymize, suppress small counts, add noise, filter bots | No identity on rows, minimum-visit threshold |
| Presentation | Simple public labels, richer dashboards for officials | Place labels for the public, a separate Tourism Office dashboard |

## Risks

- **Coverage bias:** data reflects app users only. Label it clearly.
- **Low-traffic places:** keep the minimum-visit threshold permanently.
- **Gaming:** if labels ever affect vendor business, add a daily cap per user per place and review for unusual spikes.
- **Cold start:** nothing to show for the first year. Make sure the UI simply omits the label instead of showing an empty state.

## Decisions (answers to the earlier open questions)

| Question | Decision | Why |
|---|---|---|
| What counts as a verified visit? | A stop unlocked by GPS radius, or a QR scan at the object. Trail completion does not count. | The app already requires the visitor to be inside the stop's radius, and a QR scan requires being at the object. Trail completion is one event for a whole route and cannot show which place was busy. |
| Minimum visits before showing a label? | 30 verified visits in the last 12 months, plus at least 12 months of app history. | Below that, a few visitors can swing a month by chance. It is one constant, so start strict and loosen later. |
| Public view vs Tourism Office view? | Public: labels only. Tourism Office: counts, with the same threshold. Vendors: labels for their own business only. | Relative labels avoid gamed or misread numbers (same approach as Google popular times). The Tourism Office needs counts for planning. |
| Where is it recorded, and who signs off? | New entry in `project-foundation/decision-log.md` next to #40, approved by the project owner and the Tourism Office contact. | Shows this is different from the rejected view tracking. |

Suggested decision-log wording:

> Seasonality counts verified visits (GPS or QR) with place ID and timestamp only. No user ID, no clicks, no views. Not used for ranking or recommendations. Labels are hidden below the threshold.

### Implementation note

`entry_unlocks` allows one row per user per entry, and scanning twice is harmless. That works for "has visited," but it cannot show when someone came back, and it carries `user_id`. The seasonal log should therefore be its own small append-only table: place or business ID plus timestamp, no user.

## Research notes

Reddit threads could not be retrieved, so these come from other sources.

- **Google popular times:** aggregated and anonymized, uses differential privacy, shows relative labels instead of raw counts, and publishes nothing when data is too thin. Source: [Google blog](https://blog.google/products-and-platforms/products/maps/maps101-popular-times-and-live-busyness-information/).
- **Foursquare:** cheating became a problem once check-ins had real value. Their fix was to award points and specials only when GPS confirmed presence, while still allowing check-ins anywhere. GPS can fail indoors, so use it as one signal. Source: [TechCrunch](https://techcrunch.com/2010/04/07/foursquare-starts-to-enforce-the-rules-cracks-down-on-fake-check-ins).
- **Couchers community:** members distrusted points and leaderboards because they are easy to game, and preferred qualitative badges and statistics, with an opt-out. Source: [Couchers community](https://community.couchers.org/t/what-do-you-think-of-gamification-and-rewards-on-the-app/986).
