import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

// Shared heading for admin/staff sub pages: "Previous Page > Current Page",
// every ancestor clickable. Modeled on Amkor IMS's PageHeader (inline mode):
// one compact row, small muted ancestors that underline on hover, chevron
// separators, and the current page at full heading size as the <h1>.
//
// Deliberately one component rather than each page hand-rolling its own
// <h1>, so the trail looks and behaves identically everywhere. Ancestors
// use react-router's <Link> (real anchors: middle-click, open in new tab,
// no full reload) rather than Amkor's router.visit button, since that is
// this app's own navigation primitive.
//
// Props:
//   title      : the current page's name, rendered as the <h1>
//   breadcrumb : ancestors, left to right, each { label, to }. The current
//                page is never listed here, it is `title`.
//   badges     : status badges etc., rendered right after the title
//   actions    : buttons etc., rendered on the right edge of the row

export interface AdminBreadcrumbItem {
  label: string;
  to: string;
}

interface AdminPageHeaderProps {
  title: string;
  breadcrumb?: AdminBreadcrumbItem[];
  badges?: ReactNode;
  actions?: ReactNode;
}

export function AdminPageHeader({ title, breadcrumb = [], badges, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1">
          {breadcrumb.map((crumb) => (
            <span key={crumb.to} className="flex items-center gap-1">
              <Link
                to={crumb.to}
                className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {crumb.label}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </span>
          ))}
          <h1 aria-current="page" className="min-w-0 truncate text-xl font-semibold text-foreground">
            {title}
          </h1>
        </nav>
        {badges}
      </div>
      {actions}
    </div>
  );
}
