# Lakbay Pasig: Vendor Mode

## Account Model

Vendor is not a separate account type. It is a mode switch on a Registered User account, same pattern as switching into a Facebook Page. The person's root identity stays the Registered User account. Once they submit a business, that business becomes a linked entity they can toggle into as "managing [Business Name]," while the app still shows they are the one holding it, not an anonymous business account. The Submitted By field on the Local Business record tracks this ownership link.

A person can browse the app normally, then switch into Vendor mode to manage their business, then switch back. No separate login.

## Listing Status: Two Tiers, Two Processes

### Tier 1: Basic Listing

Goes live instantly. Shows a visible "Pending Verification" badge until CATO reviews it. Vendor gets full value right away, no wait tied to CATO staff availability.

CATO reviews at their own pace after the fact. Review checks accuracy, not permission to exist. If something is wrong, CATO edits, requests a correction, or unpublishes with review notes.

Reason: basic listing is low risk business facts, name, category, hours, address. Requiring approval before going live recreates the same slow, multi step bottleneck this app is meant to fix, and applies review effort where it is not needed. At 300 plus expected vendors, gating every single basic listing does not scale for a small office.

### Tier 2: Featured Status

Requires active CATO review and selection. This is not a queue item to clear, it is a curated decision, since Featured status puts the Tourism Office's name behind a specific vendor as part of an official food crawl or heritage walk.

CATO selects vendors entirely on their own initiative. There is no in-app request or application flow for Featured status. A vendor who wants to be considered contacts CATO directly through a separate channel, such as Messenger or in person, outside the app. The app only reflects the outcome of that decision, showing Featured status once CATO has made it, not the process of requesting it.

Mechanic: Featured works as a direct toggle, similar to pinning a post. A CATO Staff member with access to the Businesses section views an existing listing and marks it Featured directly, no form, checklist, or scoring involved. No formal criteria are defined, the decision is left to staff judgment. This closes the last open item on Featured status.

## Vendor Dashboard

Not generic view and save counts. Metrics tied to trail inclusion, matching the from-to doc's direction.

Examples:
- Included in 3 active food crawls
- Part of 140 completed heritage walks this month
- Featured status: Listed or Featured in Trail

## Vendor Profile Fields Shown in Dashboard

Pulled from the data model: verification status, review notes if any, featured status, trails included in, views and saves count, registered or informal status.

## Fake and Duplicate Account Prevention

Two different risks, need different defenses.

**Fake or spam listings**: a business that does not exist, or content posted under CATO's implied backing without any real check.

**Multiple accounts from one person**: used to flood listings or fake demand through save and view counts.

No signup flow removes this risk completely. The realistic goal is raising the cost of abuse and keeping any fake listing visually separate from verified content, so a slip through stays contained instead of borrowing CATO's credibility.

### Verification Method

Email verification at signup, applies to all vendor accounts, no phone OTP anywhere in the flow. Chosen over SMS OTP for cost, phone verification has a recurring per message cost at 300 plus expected vendors, email does not.

Tradeoff to accept: email is weaker against multiple fake accounts, since a working inbox is free and fast to create, unlike a phone number tied to a SIM. This means Featured status protection depends more on CATO's active review judgment during selection, not on stronger identity checks at signup. This is a deliberate, final tradeoff for budget reasons, phone verification will not be added at any tier.

### Additional Defenses, Beyond Verification Method

- One business listing per account by default. A second listing attempt from the same account gets flagged for staff review, not blocked outright. Blocking does not reduce spam risk more than flagging does, both approaches receive the same request, the difference is only what happens after. A legitimate vendor may genuinely run two small stalls, flagging avoids punishing that case while still surfacing it for a human check.
- Submission rate limit per account, for example a daily cap on listing attempts, handles actual traffic and spam risk. This sits underneath the one-listing policy and is the layer that actually protects against automated or rapid-fire submissions, not the flag-versus-block choice itself.
- Pending badge is visually distinct from the Verified badge used for CATO confirmed content, so an unreviewed listing never borrows the look of institutional trust it has not earned yet.
- Report or flag action available to any user on any listing, gives crowdsourced first pass detection before staff have to look.
- Review queue priority, not flat order. New accounts, listings with no photos, generic or copy pasted descriptions, or accounts tied to multiple recent submissions get surfaced higher in the queue automatically.

## Business Listing Type and Items

CATO feedback: business side needs Product, Service, or Both as a type, and users want to filter by price range. This changes the Local Business data model beyond the original single Category field.

### Business Type
Every business tags itself as Product, Service, or Both at listing creation.

### Item List
Business can add individual products or services as a list, each with its own name and optional price. This replaces relying on one overall Price Range field for the whole business, since a single business can have items across different price points.

### Price Is Optional, Not Required

Publishing a listing or adding an item never requires a price. Blocking on this adds setup friction, and vendor concerns already include time to set up and confusion, per the Vendor Survey.

### Warning, Not a Block

If a vendor leaves an item's price blank, show a specific warning at the point of entry: without a price, this item will not show up when someone filters by price range. Not a generic required field message, tied to the actual consequence.

Vendor dashboard also shows a visible count, like items missing a price, so the gap stays visible over time, not just a one time dismissible warning.

### Filter Behavior

An item without a price still displays normally in listings and in Discover. It is excluded only from price range filtering specifically, never hidden from users browsing without that filter active.

## Resolved Decisions

- Resolved: Featured status has no in-app request or application process. CATO selects vendors entirely on their own initiative, outside the app, through a separate channel. The app only displays the outcome.
- Resolved: Featured status requires no formal criteria. It works as a direct staff toggle, similar to pinning a post, applied at staff discretion.
- Resolved: an informal business, no DTI or permit, can still reach Featured status. Registration status does not block Featured eligibility.
- Resolved: phone verification will not be added for Featured status or anywhere else in the app. Email verification only, across all tiers, due to budget. This is a final decision, not a revisit item.
