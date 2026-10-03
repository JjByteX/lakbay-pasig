import { useState } from "react";
import { CaretDown, DownloadSimple, FileDoc, FilePdf, FileXls, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REPORT_FORMATS, buildReportFile, type ReportFormat, type ReportTable } from "@/lib/report-files";

// One Download dropdown shared by every report: Excel, PDF or Word. The file is
// built in the browser from the table the page is showing (report-files.ts), so
// it follows the page's current filter and nothing is fetched again.

const ITEMS: { format: ReportFormat; icon: Icon }[] = [
  { format: "xlsx", icon: FileXls },
  { format: "pdf", icon: FilePdf },
  { format: "docx", icon: FileDoc },
];

interface ReportDownloadMenuProps {
  /** Called when a format is picked, so the file holds what is on screen now. */
  getTable: () => ReportTable;
  /** File name without extension or date, e.g. "fiesta-coverage". */
  fileBase: string;
  /** True while the report is loading or failed, since there is nothing to save. */
  disabled?: boolean;
}

// Local date, "2026-10-03", for the file name.
function todayStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ReportDownloadMenu({ getTable, fileBase, disabled = false }: Readonly<ReportDownloadMenuProps>) {
  const [error, setError] = useState<string | null>(null);

  function download(format: ReportFormat) {
    setError(null);
    try {
      const { extension, mime } = REPORT_FORMATS[format];
      const bytes = buildReportFile(format, getTable());
      // Every builder returns a whole array, so its buffer is exactly the file.
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileBase}-${todayStamp()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not create the file. Try again.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={disabled} className="gap-2">
            <DownloadSimple className="h-4 w-4" aria-hidden="true" />
            Download
            <CaretDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {ITEMS.map(({ format, icon: ItemIcon }) => (
            <DropdownMenuItem key={format} onSelect={() => download(format)} className="gap-2">
              <ItemIcon className="h-4 w-4" aria-hidden="true" />
              {REPORT_FORMATS[format].label} (.{REPORT_FORMATS[format].extension})
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
