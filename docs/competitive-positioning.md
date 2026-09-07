# Making the App Different from Google Maps

## The Core Problem

Most of the original scope (listings, reviews, categories, routes, badges) is stuff Google Maps already does, and does better. If the pitch is "Google Maps but for Pasig," it loses that comparison right away. The app needs to be built around the two things Google cannot or will not copy: the formal Tourism Office partnership, and location based storytelling.

## The New Framing

Stop building a directory of Pasig with some extra facts added on. Build the official living record of Pasig, told by the city itself, that happens to know where you are standing. Google Maps shows what is there. This app shows what is true about what is there, kept up to date by the people who would actually know, instead of written once and left alone.

The ongoing content pipeline from the Tourism Office is the part nobody else can copy. A one time batch of content is just a feature. A standing relationship that keeps feeding the app new material is closer to an institution.

## Platform: Web or App

The platform is a Progressive Web App, not a native mobile app and not desktop software. A PWA opens straight from a link or QR code, no app store, no download step. This matters because the app depends on impulse use, someone standing at a heritage site sees a marker and wants the story right then. A download step loses that moment.

A PWA still supports the app's core needs. It can be added to a phone's home screen after someone already trusts it. It works offline for previously loaded content. It handles location while the app is open, which covers the proximity unlock feature. The one real limitation is background tracking while the app is fully closed, and push notification reliability on iOS, neither of which this app depends on for its core experience.

Native mobile stays a future option if the project grows past capstone and a specific gap shows up, such as strong demand for background alerts. It is not the starting point, since two codebases would cost more time than a three person team has for this timeline, and the discovery friction of an app store download works against the app's core use case.

## Grounding the Partnership in Something Concrete

Saying "we have a partnership with the Tourism Office" is a claim. Pointing to the actual bureaucratic process that partnership lets the app shortcut is evidence. Pasig's Cultural Affairs and Tourism Office operates under a legal mandate from Ordinance No. SP-17, Series of 1998, which requires the office to conserve and promote cultural heritage and to ensure equal access to cultural opportunities. That mandate is the legal basis the app is helping fulfill, not just a marketing angle invented for the pitch.

More useful for a capstone defense are the actual documented service timelines from the office's own Citizen's Charter.

- **Requesting existing cultural or tourism data** from the office currently takes up to seven working days. It requires a formal letter, review by staff, consolidation, approval, and a signed transmittal letter before the requester receives anything.
- **Implementing a tourism event or program** from request to post event wrap up takes up to forty days, moving through multiple rounds of referral, evaluation, and approval before anything reaches the public.

These numbers are not estimates. They come directly from the office's own published service standards. If the app becomes a live channel for this same information, pushing verified content, event schedules, or route updates directly instead of through the referral chain described above, that is a specific, provable efficiency claim rather than a vague one. It gives the capstone panel something concrete to compare against: a documented seven day process versus something closer to real time.

## Main Differentiators

### 1. Verified Source Content

Every fact, story, or historical note should carry a visible label such as "Verified by Pasig Tourism Office" or "Contributed by [professor or department name]." This creates a trust signal that Google Reviews cannot match, since reviews come from anonymous crowds and this comes from named institutional authority. It also turns the partnership itself into something the user sees and feels while using the app, rather than something only mentioned once on an about page.

### 2. A Real Submission and Correction Pipeline

Since the partnership keeps going, the actual pipeline should live inside the app, not just behind the scenes. The Tourism Office should be able to push updates, corrections, seasonal content, or event tie ins directly, with something like a "recently updated" or "newly added" marker showing up for users. This keeps the app feeling alive instead of turning into a static wiki that was filled once at launch and forgotten a few months later, which is what tends to kill most civic apps.

### 3. Sequenced Storytelling, Not Just Trivia Unlocks

Right now, unlocking a "secret" when nearby is closer to a gimmick. It works much better as a narrative arc instead. A heritage walk should not feel like five separate trivia pop ups. It should feel like a story that only makes full sense in order, where each stop references the one before it and sets up the next one. This is genuinely hard for Google to copy because it needs actual narrative design work, not just location data. It also opens the door to using time and sequence as meaningful data, such as showing someone they are the fortieth person to finish a walk that month.

### 4. Vendors as Part of the Experience, Not Just Listings

Instead of giving vendors a plain dashboard showing views and saves, frame their presence in the app as being part of something the Tourism Office has actually endorsed. A food crawl should not read as five nearby restaurants. It should read as five stops the city has chosen as representative of Pasig food heritage. Vendors get language like "part of the official [name] food crawl," something they can put on their own storefront. That is a kind of credibility Google Business Profile cannot offer, since Google has no cultural authority to lend a small business.

### 5. An Operational Tool, Not Just a Public Facing App

Since this is being treated as a real product, it is worth pushing for the Tourism Office to actually use the app for real operations, not just endorse it. That could mean publishing event schedules, managing seasonal walks, or tracking foot traffic to know where to invest attention. That is the difference between an app the city approved of and an app the city actually runs on. The second version does not get abandoned once the capstone defense is over.

This is also where the seven day data request process and the forty day event implementation timeline become directly useful. Both currently move through several rounds of internal referral before reaching the public. If even part of that chain can happen through the app instead, the office gets a faster way to publish what it already produces, and the app gets a content pipeline no directory app could replicate without the same institutional access.

## On Rankings and Leaderboards

A leaderboard based on how many times someone visited a single place sounds fun at first, but it tends to fall apart for a few reasons.

- With a small user base, a leaderboard for one specific site might only have a handful of names on it, which looks empty rather than exciting, and works against the feeling of an official city platform.
- Ranking by repeat visits rewards the wrong kind of behavior. It encourages someone to keep returning to the same spot to top a counter, rather than actually exploring the city, which is the real goal.
- This is close to what Foursquare tried years ago with mayorships based on check in counts, and that mechanic did not hold up over time.

A few approaches tend to work better:

- **Rank by breadth, not frequency.** Recognize people for how many different sites or routes they have completed, not how many times they returned to one place. This rewards exploring the city instead of camping at one location.
- **Use cohorts instead of all time rankings.** Something like "you are one of two hundred people who completed this route this month" feels good without requiring anyone to be first place. All time leaderboards tend to only feel good for the top few names and flat for everyone else.
- **Show place level stats instead of individual rankings.** Instead of ranking people, show aggregate numbers per site, such as "this site has been part of twelve hundred completed heritage walks." This also gives vendors something to point to, like "your stall was part of three hundred food crawls this quarter," without turning individual users into a public ranking.
- **Try neighborhood or barangay based competition.** If competition is still wanted, comparing barangays or neighborhoods on things like total walk completions feels more fun, less exposing for individuals, and ties back to civic pride instead of a personal score.

## What to Cut or De-emphasize

- **Badges or points system:** replace a generic point counter with something tied to the sequenced heritage walks, such as a credential for completing a specific route, since that feels earned rather than arbitrary.
- **Self listing for unregistered businesses:** keep this as necessary infrastructure, but do not present it as a differentiator on its own.
- **Bilingual support:** keep it, but treat it as an expected baseline feature rather than something to market heavily.

## The One Line Pitch

Google Maps tells tourists what is nearby. This app is Pasig City's own platform for telling its own story, kept current by the Tourism Office, turning a walk around the city into a guided and evolving experience instead of a plain search result.
