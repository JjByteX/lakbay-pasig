import { Link } from "react-router-dom";
import { Envelope, FacebookLogo, Phone } from "@phosphor-icons/react";
import { HelpTopicList } from "@/components/help-topic-list";
import { PageContainer } from "@/components/public/page-container";
import { CATO_EMAIL, CATO_FACEBOOK, CATO_NAME, CATO_PHONE } from "@/lib/cato-contact";
import { HELP_TOPICS } from "@/lib/help-content";
import { usePageTitle } from "@/lib/page-title";

// Shown as text, so drop the scheme and trailing slash from the shared link.
const FACEBOOK_TEXT = CATO_FACEBOOK.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/**
 * Help & FAQ (docs/help-faq-plan.md). Public, inside PublicShell like Profile.
 * The question list is components/help-topic-list.tsx, shared with the admin
 * page. Copy lives in lib/help-content.ts.
 */
export default function HelpPage() {
  usePageTitle("Help & FAQ");

  return (
    <PageContainer width="form" className="gap-8">
      <h1 className="text-xl font-semibold text-foreground">Help & FAQ</h1>

      <HelpTopicList topics={HELP_TOPICS} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">Still need help?</h2>
          <p className="text-base text-muted-foreground">{CATO_NAME}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Envelope className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a href={`mailto:${CATO_EMAIL}`} className="text-base text-foreground underline">
              {CATO_EMAIL}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Phone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a href={`tel:${CATO_PHONE.replace(/\s+/g, "")}`} className="text-base text-foreground underline">
              {CATO_PHONE}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <FacebookLogo className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a href={CATO_FACEBOOK} target="_blank" rel="noreferrer" className="text-base text-foreground underline">
              {FACEBOOK_TEXT}
            </a>
          </div>
        </div>

        <Link to="/privacy" className="self-start text-base text-foreground underline">
          Privacy Policy
        </Link>
      </section>
    </PageContainer>
  );
}
