import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface BaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  icon?: ReactNode;
  error?: string | null;
  hint?: string;
}

/**
 * Member-portal text field: a boxed field with an 8 px radius (the Metrol shape) and a turf-green focus ring.
 * The inner <input> stays transparent, and the .auth-surface autofill reset in styles.css keeps Safari from
 * painting its own rectangle inside the box; keep the two together. 16px text so iOS Safari does not
 * auto-zoom on focus.
 */
export const AuthInput = forwardRef<HTMLInputElement, BaseProps>(function AuthInput(
  { label, icon, error, hint, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[13px] font-medium text-auth-muted"
      >
        {label}
      </label>
      <div
        className={`group flex h-12 items-center gap-2.5 rounded-lg border bg-auth-surface/70 px-3 transition-colors duration-200 ${
          error
            ? "border-auth-danger"
            : "border-auth-border focus-within:border-auth-accent focus-within:ring-2 focus-within:ring-auth-accent/25"
        }`}
      >
        {icon ? <span className="shrink-0 text-auth-subtle">{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 bg-transparent text-[16px] text-auth-foreground outline-none placeholder:text-auth-subtle"
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-auth-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-auth-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** Password field with a show/hide toggle that keeps focus and stays screen-reader labelled. */
export function PasswordInput({
  label,
  icon,
  error,
  hint,
  id,
  ...rest
}: BaseProps) {
  const [visible, setVisible] = useState(false);
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-auth-muted">
        {label}
      </label>
      <div
        className={`group flex h-12 items-center gap-2.5 rounded-lg border bg-auth-surface/70 px-3 transition-colors duration-200 ${
          error
            ? "border-auth-danger"
            : "border-auth-border focus-within:border-auth-accent focus-within:ring-2 focus-within:ring-auth-accent/25"
        }`}
      >
        {icon ? <span className="shrink-0 text-auth-subtle">{icon}</span> : null}
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 bg-transparent text-[16px] text-auth-foreground outline-none placeholder:text-auth-subtle"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="shrink-0 rounded-md p-1.5 text-auth-subtle transition-colors hover:text-auth-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-auth-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-auth-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
