import { Loader2, ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Single dominant member-portal CTA, turf green. Disabled while loading so submits can't be spammed. */
export function AuthButton({
  loading,
  children,
  loadingLabel = "Please wait…",
  showArrow = true,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  showArrow?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading}
      className="flex h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-auth-accent text-[15px] font-semibold tracking-tight text-auth-accent-ink transition-all duration-200 hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {loadingLabel}
        </>
      ) : (
        <>
          {children}
          {showArrow ? <ArrowRight className="size-4" aria-hidden /> : null}
        </>
      )}
    </button>
  );
}

/** Form-level error / status banner. */
export function AuthError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-auth-danger/40 bg-auth-danger/10 px-4 py-3 text-[13px] leading-relaxed text-auth-danger"
    >
      {message}
    </div>
  );
}
