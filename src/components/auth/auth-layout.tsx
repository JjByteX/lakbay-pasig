import type { ReactNode } from "react";
import authBg from "@/assets/auth-bg.png";
import logo from "@/assets/lakbay-pasig-logo.svg";

interface AuthLayoutProps {
  /** Short line shown over the image panel, e.g. "Welcome back" */
  tagline: string;
  children: ReactNode;
}

/**
 * Shared shell for every authentication screen (login, signup, and any
 * future auth step like password reset). Split layout: brand image panel
 * on desktop, form panel always visible. On mobile the image panel drops
 * out entirely rather than stacking above the form, since it's decorative
 * context, not content the user needs to scroll past.
 *
 * Not part of the layout shell in ux-ui-guidelines.md's sense (that rule
 * covers persistent chrome shared across the whole app). Auth is a linear,
 * single-purpose flow outside the public/admin shells, so it gets its own
 * standalone shell per the Layout Pattern Rules.
 */
export function AuthLayout({ tagline, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <div
        className="relative hidden w-1/2 shrink-0 bg-cover bg-center lg:block"
        style={{ backgroundImage: `url(${authBg})` }}
      >
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background: "linear-gradient(to top, rgb(7 46 87 / 0.85), transparent)",
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-16">
          <p className="max-w-sm text-2xl font-semibold text-primary-foreground">{tagline}</p>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-6 py-16 lg:w-1/2">
        <div className="flex w-full max-w-sm flex-col items-center gap-8">
          <img src={logo} alt="Lakbay Pasig" className="h-24 w-24" />
          <div className="w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
