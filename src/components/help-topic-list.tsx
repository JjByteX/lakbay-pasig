import { CaretDown } from "@phosphor-icons/react";
import type { HelpTopic } from "@/lib/help-content";
import { cn } from "@/lib/utils";

/**
 * Topics with collapsible questions, shared by the resident Help page and the
 * admin one. Native <details>, no accordion dependency. `dense` is the admin
 * body size (text-sm), the resident page keeps text-base.
 */
export function HelpTopicList({ topics, dense = false }: Readonly<{ topics: HelpTopic[]; dense?: boolean }>) {
  const body = dense ? "text-sm" : "text-base";

  return (
    <>
      {topics.map((topic) => (
        <section key={topic.title} className="flex flex-col gap-2">
          <h2 className={cn("font-semibold text-foreground", body)}>{topic.title}</h2>
          <div className="divide-y divide-border border-y border-border">
            {topic.items.map((item) => (
              <details key={item.question} className="group">
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
