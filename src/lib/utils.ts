import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// rounded-nest-* (tailwind.config.ts) is a radius, so it has to share the
// `rounded` group with rounded-md and the rest. Without this, a caller's
// rounded-* would sit beside it instead of replacing it.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: [(value: string) => value.startsWith("nest-")] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
