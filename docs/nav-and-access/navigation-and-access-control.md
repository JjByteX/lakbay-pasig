# Lakbay Pasig: Navigation Plan (Resident/Tourist)

## Bottom Nav Order

Left to right, based on how often each tab gets opened, not just importance.

1. **Home**
2. **Trails**
3. **Discover** (center)
4. **Saved**
5. **Profile**

## Why Discover Is Center

Discover is the daily habit. People open the app the way they open Google Maps: look something up, get an answer, leave. Verification, our main edge over Google Maps, shows up here on every result. Trails matters strategically but is a longer, occasional commitment, not a habit, so it sits near Home instead of taking center.

## Tab Definitions

### Home
Feed of what CATO just published or updated. Announcements, program enrollment info, recently verified content. Passive, no search needed. Answers: what's new.

### Discover
Search and map lookup for places and businesses. Every result carries a verification label. Answers: where is X, what's near me.

Verification label scope for v1: label reads "Verified by Pasig Tourism Office" only. Named contributor credit, such as crediting a specific professor or department, is dropped for v1. Reason: a named credit needs its own verification path to stay trustworthy, which adds an account type and review step not worth building for this timeline. CATO-only verification keeps the label simple and still fully backed by real institutional authority.

### Trails
Catalog of CATO-designed routes: heritage walks, food crawls, cultural tours. Browsable even with no location match. Opening a trail starts a sequence: stops unlock in order, later stops stay locked until you're near them, finishing earns a credential. Answers: give me a full experience.

Unlock method note: CATO previously had physical Talking Walls, QR codes placed at real locations that showed information when scanned. These were removed after the previous third-party developer took the infrastructure with them when they left. They no longer exist and cannot be built on as-is. If QR-based unlock is still wanted for Discovery content, it would be new infrastructure designed and installed fresh, not integration with anything already in place. GPS proximity radius remains the default unlock method unless this is revisited.

### Saved
Personal library. Saved places, saved trails, completed trails, credentials earned. No new content here, just a personal record.

### Profile
Account info and preferences. Vendor accounts get business management tools here (listing, dashboard).

## Guest vs Registered Access

**Guest (no sign-in)**
- Home: view only
- Discover: search and view places, no saving
- Trails: full browse access, including stop list, duration, and budget preview. Starting a trail or tracking progress requires sign-in.
- Saved: locked, prompt to sign in
- Profile: locked, prompt to sign in

**Registered User (signed in)**
- Full access to all tabs
- Can save places and trails
- Trail progress tracked, credentials earned and stored
- Preferences (language, categories) applied to Home and Discover

**Vendor (signed in, business account)**
- Same access as Registered User
- Profile includes business management: listing status, views/saves count, trail inclusion metrics

## Guest Trail Preview Decision

Trail preview, including stops, duration, and budget, is visible to Guests with no restriction. Sign-in is required only where state needs to be stored: starting a trail, tracking progress, saving a trail, or earning a credential. Reason: sign-in exists to store data, not to gate viewing, and gating a fully designed trail behind a login gives a visitor no reason to actually create an account.

## Legacy Database Status

CATO does not have access to the previous system's database. The prior third-party developer left with it and did not hand it over. There is no existing data to migrate, the app starts fresh on all content. This is worth noting in capstone documentation as a reason to prioritize data ownership and export access in how this app is built, avoiding the same lock-in risk.
