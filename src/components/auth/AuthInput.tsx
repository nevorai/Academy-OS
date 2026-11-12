import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface BaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  icon?: ReactNode;
  error?: string | null;
  hint?: string;
}

/** The field itself is the box (see `.auth-field` in styles.css): one border, one soft highlight on focus. */
const FIELD =
  "auth-field block h-11 w-full min-w-0 rounded-lg border border-auth-border bg-auth-surface px-3.5 text-[16px] text-auth-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-auth-subtle";

function Message({ id, error, hint }: { id: string; error?: string | null; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-auth-danger">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-auth-subtle">
        {hint}
      </p>
    );
  return null;
}

/** Member-portal text field. 16px text so iOS Safari does not auto-zoom on focus. */
export const AuthInput = forwardRef<HTMLInputElement, BaseProps>(function AuthInput(
  { label, error, hint, id, icon: _icon, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-[12.5px] font-medium text-auth-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={FIELD}
        {...rest}
      />
      <Message id={inputId} error={error} hint={hint} />
    </div>
  );
});

/** Password field with a show/hide toggle. */
export function PasswordInput({ label, error, hint, id, icon: _icon, ...rest }: BaseProps) {
  const [visible, setVisible] = useState(false);
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-[12.5px] font-medium text-auth-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`${FIELD} pr-11`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-auth-subtle transition-colors hover:text-auth-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Message id={inputId} error={error} hint={hint} />
    </div>
  );
}
