import { useState } from "react";
import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { HelpTopic } from "@/lib/help-content";
import { filterHelpTopics, normalize } from "@/lib/help-search";
import { cn } from "@/lib/utils";

/**
 * Search box and topics with collapsible questions, shared by the resident Help
 * page and the admin one. Native <details>, no accordion dependency. The
 * matching is lib/help-search.ts (typo tolerant, with a few synonyms). `dense`
 * is the admin body size (text-sm), the resident page keeps text-base. While a
 * search is active the matching answers open by themselves, so the person sees
 * the hit without another tap. Escape or the clear button empties the box.
 */
export function HelpTopicList({ topics, dense = false }: Readonly<{ topics: HelpTopic[]; dense?: boolean }>) {
  const [query, setQuery] = useState("");
  const body = dense ? "text-sm" : "text-base";

  const searching = normalize(query) !== "";
  const shown = filterHelpTopics(topics, query);
  const matchCount = shown.reduce((total, topic) => total + topic.items.length, 0);

  return (
    <>
      <div className="relative">
        <MagnifyingGlass
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search help"
          aria-label="Search help"
          autoComplete="off"
          className={cn("pl-9", searching && "pr-11", dense ? "h-9 text-sm" : "h-11 text-base")}
        />
        {searching && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            title="Clear search"
            className={cn("absolute right-0 top-0 text-muted-foreground", dense ? "h-9 w-9" : "h-11 w-11")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Read out by screen readers after each change, not shown. */}
      <output className="sr-only">
        {searching ? `${matchCount} ${matchCount === 1 ? "answer" : "answers"} found` : ""}
      </output>

      {searching && shown.length === 0 && (
        <EmptyState icon={MagnifyingGlass}>No answers for &quot;{query.trim()}&quot;.</EmptyState>
      )}

      {shown.map((topic) => (
        <section key={topic.title} className="flex flex-col gap-2">
          <h2 className={cn("font-semibold text-foreground", body)}>{topic.title}</h2>
          <div className="divide-y divide-border border-y border-border">
            {topic.items.map((item) => (
              // Keyed on `searching` so a row re-mounts when a search starts or
              // ends: it opens for a search, and closes again when it is cleared.
              <details key={`${item.question}-${searching}`} open={searching || undefined} className="group">
                <summary
                  className={cn(
                    "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
                    body,
                  )}
                >
                  <span>{item.question}</span>
                  <CaretDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <p className={cn("pb-4 text-muted-foreground", body)}>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
