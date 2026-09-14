import type { ReactNode } from "react";

/**
 * Step 8 cleanup: ResultGroup and ResultRow were byte-identical between
 * global-search-bar.tsx and admin-search-bar.tsx. Those two files stay
 * deliberately separate overall (admin-search-bar.tsx's own file comment
 * explains why: different data sources, an extra Staff group, status
 * badges the public bar has no concept of, different route targets --
 * none of that changes here). Only the two leaf rendering pieces that
 * had zero divergence between them are extracted, into src/components/
 * public since global-search-bar.tsx is the "primary" of the pair and
 * admin-search-bar.tsx already imports across from public for
 * VerificationBadge-style pieces elsewhere in this codebase.
 */

export function ResultGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="border-b border-border py-1 last:border-b-0">
      <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

export function ResultRow({
  title,
  subtitle,
  badge,
  onClick,
}: Readonly<{
  title: string;
  subtitle?: string | null;
  badge?: ReactNode;
  onClick: () => void;
}>) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col items-start gap-1 px-4 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {(subtitle || badge) && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {subtitle}
            {badge}
          </span>
        )}
      </button>
    </li>
  );
}
