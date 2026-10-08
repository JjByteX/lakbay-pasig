import { Lock, CheckCircle, QrCode } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { TrailStop as TrailStopData } from "@/lib/trail-types";

/**
 * Step 7, Phase 4.1: one stop's render across its three states, branching
 * inside one component per the plan doc's explicit instruction ("No
 * separate locked/unlocked components, one component branching on state,
 * the content difference is the only thing that changes"):
 *
 * - locked: name only, no Discovery content, no way to force it open
 *   (that "no way to force open" rule belongs to Phase 4.6, this component
 *   only renders the state it's given, it does not decide when a stop is
 *   locked)
 * - unlocked: every Discovery content entry shown (title + content body),
 *   except an entry marked "Unlock by QR scan", which shows one line asking
 *   for the scan until the visitor has scanned its code
 * - completed: same as unlocked, visually marked done
 *
 * Sequence marker (numbered circle) and row layout reuse trail-detail.tsx's
 * existing Phase 3.3 `<li>` shape exactly (numbered ol, circle-with-number,
 * name on one line) rather than inventing a new row shape, per
 * constraints.md's Inventory Before Suggesting rule; Phase 4.3 is what
 * swaps trail-detail.tsx's plain `<li>` for this component, out of scope
 * here.
 *
 * Icons: Lock and CheckCircle from @phosphor-icons/react (already a project
 * dependency, no new install), both universally recognized concepts per
 * ux-ui-guidelines.md's icon rules ("locked", "done") so no separate text
 * label is required alongside them, matching how bottom-nav.tsx pairs
 * icon-only universal concepts. Completed state uses the same accent
 * green implied by CheckCircle's fill weight below rather than inventing
 * a new status color; locked uses text-muted-foreground, matching every
 * other "inactive/inert" treatment already in this codebase (e.g.
 * discover-list.tsx's empty-state copy).
 */
export type TrailStopState = "locked" | "unlocked" | "completed";

interface TrailStopProps {
  stop: TrailStopData;
  index: number;
  state: TrailStopState;
  // Entry ids this visitor has unlocked by scanning (entry-unlocks.ts).
  unlockedEntryIds: Set<string>;
}

export function TrailStop({ stop, index, state, unlockedEntryIds }: Readonly<TrailStopProps>) {
  const isLocked = state === "locked";
  const isCompleted = state === "completed";

  return (
    <li className="flex gap-3 py-3">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
          isLocked && "bg-muted text-muted-foreground",
          !isLocked && "bg-primary text-primary-foreground"
        )}
      >
        {index + 1}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-base",
              isLocked ? "text-muted-foreground" : "font-semibold text-foreground"
            )}
          >
            {stop.name}
          </span>
          {isLocked && <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Locked" />}
          {isCompleted && (
            <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-primary" aria-label="Completed" />
          )}
        </div>

        {/* Unlocked and completed both show Discovery content, per the
            plan doc's "completed (same as unlocked, visually marked
            done)." A stop holds a list of entries, trail notes first and
            then the place's own entries (trail-query.ts). An empty list is
            a normal valid state, not an error, so nothing renders below
            the name in that case. An entry that needs a scan stays one
            generic line, not its title, until its code has been scanned. */}
        {!isLocked && stop.discoveryContent.length > 0 && (
          <ul className="flex flex-col gap-3 pt-1">
            {stop.discoveryContent.map((entry) =>
              entry.requiresScan && !unlockedEntryIds.has(entry.id) ? (
                <li key={entry.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Scan the code at the object to read more
                </li>
              ) : (
                <li key={entry.id} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">{entry.title}</span>
                  <p className="text-sm text-muted-foreground">{entry.content}</p>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </li>
  );
}
