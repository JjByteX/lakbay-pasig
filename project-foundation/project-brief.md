# project-brief.md

---
## AI RULES, READ FULLY BEFORE ANY ACTION
---

1. Read this entire file first. If any section is blank → stop and ask.
2. Automate before building UI. Only surface controls when human judgment is required.
3. Uncertain mid-build → pause, state why, offer two directions, wait for input.
4. All decisions must serve the intent defined below. Flag conflicts, never override silently.
5. Before touching anything → map all connected files and dependencies first.
6. Confirm direction with the human before each major milestone, not after.

---
## PROJECT REFERENCE
---

**Project Name:**
Lakbay Pasig

**The Problem:**
Pasig heritage sites, local businesses, and cultural history sit scattered across generic map listings and social media, mixed with unrelated city posts like bid openings and weather warnings. No single source ties this content to the Tourism Office.

**The Goal:**
A Tourism Office backed platform for Pasig heritage sites, businesses, and guided routes, verified by CATO and delivered through sequenced, location based storytelling.

**Who It's For:**
- Guest: browses without an account, no data saved.
- Registered User: resident or tourist with an account, saves places and routes, tracks trail progress, earns credentials.
- Vendor: business owner managing a listing, toggled from a Registered User account.
- CATO Staff: Tourism Office employee managing content, split into Staff and Admin roles.

**Automation Expectations:**
Automatic: business listing goes live on submission, price range filtering excludes items with no price, review queue priority based on account age and listing completeness.
Human decision required: verifying place and business content, publishing events, building trail sequences, granting Featured status, managing staff accounts and permissions.

**What Done Looks Like:**
Five user facing tabs (Home, Trails, Discover, Saved, Profile), a separate CATO admin panel with role based access, vendor mode with two listing tiers, and trail creation with sequenced Discovery content. All four user flows function end to end.

**What This Is NOT:**
A general business directory competing with Google Maps on breadth. A native mobile app for v1, this is a PWA. Dependent on the previous CATO system or its database, which no longer exists. Offering vendors anything beyond app visibility, no social media promotion or printed materials. Using phone verification, email only.

**Open Questions Before Starting:**
Featured status selection stays at CATO's discretion, no fixed criteria. No other blocking questions remain.
