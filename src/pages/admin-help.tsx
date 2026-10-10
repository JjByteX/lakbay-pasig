import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { HelpTopicList } from "@/components/help-topic-list";
import { ADMIN_HELP_TOPICS } from "@/lib/admin-help-content";
import { usePageTitle } from "@/lib/page-title";

/**
 * Help & FAQ for staff and admins, at /admin/help (docs/help-faq-plan.md).
 * Open to every staff account, same as the Dashboard: no extra permission.
 * It scrolls like the Dashboard, since it is not in admin.tsx's bounded list.
 * The list is components/help-topic-list.tsx, shared with the resident page.
 */
export default function AdminHelpPage() {
  usePageTitle("Help & FAQ");

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <AdminPageHeader title="Help & FAQ" />
      <HelpTopicList topics={ADMIN_HELP_TOPICS} dense />
    </div>
  );
}
