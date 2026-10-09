import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { usePageTitle } from "@/lib/page-title";

/**
 * Route /privacy, public, outside PublicShell and outside any auth gate.
 * Google's OAuth Branding page needs a public privacy policy URL before
 * the app can be published, and this is also where the Data Privacy Act
 * of 2012 (RA 10173) notice for the app lives. Like landing.tsx it is a
 * single purpose page, so no bottom nav, search or sidebar.
 *
 * Every statement below was written from what the code does today, not
 * from a template: which services the browser calls (Supabase, OpenFreeMap
 * tiles, the FOSSGIS routing servers, Photon, Groq through
 * api/transcribe.js, Google for sign in and the landing map embed), which
 * tables hold personal records (profiles, saved_places, saved_businesses,
 * route_progress, completed_routes, rec_hides, activity_log, plus the private
 * trails a user builds, which sit in routes and route_stops flagged personal) and that no
 * analytics or advertising script exists in the app. If any of those
 * change, this page has to change with them. Update LAST_UPDATED too.
 *
 * The CATO details match landing.tsx's own constants (those are private to
 * that file, so they are repeated here rather than widening its exports).
 * This is a plain language draft: CATO or its legal counsel should review
 * it before it is relied on. No em dashes, per the landing copy rules.
 */
const LAST_UPDATED = "October 5, 2026";
const CATO_NAME = "City Culture, Arts, Tourism and Old Pasig Office (CATO)";
const CATO_EMAIL = "cato@pasigcity.gov.ph";
const CATO_ADDRESS = "4th Floor, Pasig Revolving Tower, Market Avenue, Barangay San Nicolas, Pasig City, 1600 Metro Manila";

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="text-base text-muted-foreground">{children}</p>;
}

function Bullets({ items }: Readonly<{ items: ReactNode[] }>) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-6 text-base text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  usePageTitle("Privacy Policy");

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/welcome" className="flex items-center gap-2" aria-label="Lakbay Pasig home">
          <img src={logo} alt="Lakbay Pasig" className="h-8 w-8" />
        </Link>
        <Link to="/" className="text-sm text-foreground underline">
          Back to the app
        </Link>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 pb-20">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <Section title="Who we are">
          <P>
            Lakbay Pasig is a guide to Pasig City's heritage places, local businesses, events and trails. It is run by
            the {CATO_NAME}, {CATO_ADDRESS}. In this policy, "we" means CATO. We handle your personal data in line
            with the Data Privacy Act of 2012 (Republic Act No. 10173).
          </P>
        </Section>

        <Section title="What we collect">
          <P>You can browse as a guest without giving us anything. If you create an account, we collect:</P>
          <Bullets
            items={[
              "Your email address and, if you sign up with email, a password. The password is stored in scrambled (hashed) form by our sign in provider. We cannot read it.",
              "If you continue with Google, Google shares your email address and basic profile details (name and profile picture) with us. We save that name and picture to your profile so it does not start blank, and you can change or remove them anytime. We do not receive your Google password, and we do not read your Gmail, contacts or any other Google data.",
              "Details you choose to add in Settings: username, first and last name, contact number, date of birth, profile picture and preferred categories, plus your light or dark mode and text size.",
              "What you do in the app: places, businesses and trails you save, the private trails you build (only you can see them), your trail progress and completed trails, and items you mark as Not interested.",
              "If you list a business: the business details, photos and contact information you enter. These are shown publicly once CATO approves the listing.",
              "For CATO staff accounts: a record of staff actions (who did what, and when), kept for accountability.",
            ]}
          />
        </Section>

        <Section title="Your location and voice">
          <Bullets
            items={[
              "Location: only if you allow it in your browser. We use it on your device to show distances, nearby places and your position on the map. We do not save it to your account. When you ask for directions, the start and end points are sent to a public routing service to work out the route.",
              "Voice search: when you tap the microphone, a short recording is sent through our server to Groq, a speech to text service, and turned into text. We do not store the recording.",
            ]}
          />
        </Section>

        <Section title="How we use your data">
          <Bullets
            items={[
              "To create and run your account, and keep you signed in.",
              "To show your saved items, trail progress and preferences.",
              "To suggest places and businesses you may like, based on what you saved, trails you completed, your preferred categories and, if allowed, where you are.",
              "To review business listings and keep a record of staff actions.",
              "To keep the service secure and fix problems.",
            ]}
          />
          <P>We do not sell your personal data, and we do not use it for advertising.</P>
        </Section>

        <Section title="Services that handle data for us">
          <P>Lakbay Pasig relies on these providers. Each receives only what it needs to do its job.</P>
          <Bullets
            items={[
              "Supabase: our database, sign in and file storage.",
              "Vercel: hosting for the website and the voice search function.",
              "Google: the Continue with Google sign in, and the office map shown on the welcome page.",
              "OpenFreeMap and OpenStreetMap services: map tiles, directions and address search.",
              "Groq: voice search transcription.",
            ]}
          />
          <P>
            These providers have their own privacy policies. We may also disclose information if the law requires it.
          </P>
        </Section>

        <Section title="Cookies and browser storage">
          <P>
            The app uses your browser's storage to keep you signed in and to remember small choices, such as whether you
            have already seen the welcome screen. We do not run advertising or third party analytics trackers in the app.
          </P>
        </Section>

        <Section title="How long we keep it">
          <P>
            We keep your account data while your account exists. If your account is deleted, your profile, saved items,
            private trails and trail progress are deleted with it. Records of staff actions may be kept longer for accountability.
          </P>
        </Section>

        <Section title="Your rights">
          <P>
            Under the Data Privacy Act you can ask to see the personal data we hold about you, correct it, object to how
            it is used, and ask for it to be deleted. You can edit most of your details, or delete your account, yourself
            in Settings, under Account. Staff accounts and accounts with a business listing cannot be deleted there:
            contact us below, along with anything else. You also have the right to complain to the National Privacy
            Commission.
          </P>
        </Section>

        <Section title="Children">
          <P>
            Lakbay Pasig is not meant for children under 13, and we do not knowingly collect their personal data.
          </P>
        </Section>

        <Section title="Security">
          <P>
            The site uses HTTPS, and the database only lets each signed in person read and change their own personal
            records. No system is perfectly secure, so please use a strong password and sign out on shared devices.
          </P>
        </Section>

        <Section title="Changes to this policy">
          <P>If we change this policy, we will update the date at the top of this page.</P>
        </Section>

        <Section title="Contact us">
          <P>
            {CATO_NAME}
            <br />
            {CATO_ADDRESS}
            <br />
            Email:{" "}
            <a href={`mailto:${CATO_EMAIL}`} className="text-foreground underline">
              {CATO_EMAIL}
            </a>
          </P>
        </Section>
      </main>
    </div>
  );
}
