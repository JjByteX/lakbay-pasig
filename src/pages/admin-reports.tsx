import { Link } from "react-router-dom";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { usePageTitle } from "@/lib/page-title";

// reports-plan.md, Screens: Selector. One separate card per report, since
// each is its own destination (ux-ui-guidelines.md, Card restraint). Reports are a plain array in this file, so a
// later report is one more entry here plus its own route, no rework.
const REPORTS = [
  {
    to: "/admin/reports/heatmap",
    name: "Barangay heatmap",
    description: "How many Places and Businesses each barangay has, verified and pending.",
  },
  {
    to: "/admin/reports/fiestas",
    name: "Fiesta coverage",
    description: "Which barangays have a published fiesta, only drafts, or none yet.",
  },
  {
    to: "/admin/reports/visits",
    name: "Visit planning",
    description: "Verified visits per Place and Business over 12 months, and the weeks each is usually busiest.",
  },
];

export default function AdminReportsPage() {
  usePageTitle("Reports");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Reports" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => (
          <Link
            key={report.to}
            to={report.to}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-6 transition-colors hover:bg-accent"
          >
            <span className="text-base font-semibold text-foreground">{report.name}</span>
            <span className="text-sm text-muted-foreground">{report.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
