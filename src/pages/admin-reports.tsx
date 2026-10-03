import { Link } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { usePageTitle } from "@/lib/page-title";

// reports-plan.md, Screens: Selector. Simple list rows (name plus one line),
// no card grid for one item. Reports are a plain array in this file, so a
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
];

export default function AdminReportsPage() {
  usePageTitle("Reports");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Reports" />
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {REPORTS.map((report) => (
          <li key={report.to}>
            <Link
              to={report.to}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{report.name}</span>
                <span className="text-sm text-muted-foreground">{report.description}</span>
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
