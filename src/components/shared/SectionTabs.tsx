import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SectionTab<T extends string> {
  id: T;
  label: string;
  badge?: string | number | null;
  content: ReactNode;
}

/**
 * The Nevorai tabs standard (an underline bar, one section visible, the page never scrolls sideways).
 *
 * The caller owns which tab is chosen, so it can keep it in the address (`?tab=`). A section is
 * built the first time it is opened and then only hidden, so switching back is instant and a
 * half-typed note is kept. The bar scrolls inside itself on a phone and bleeds to the screen edge
 * (`-mx-4 px-4` matches the dashboard's `p-4` page padding).
 */
export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
  label = "Sections",
}: {
  tabs: SectionTab<T>[];
  active: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [seen, setSeen] = useState<Set<T>>(() => new Set([active]));

  useEffect(() => {
    setSeen((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
    refs.current[active]?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  function onKey(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={label}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:bg-foreground/[0.05] ${
                on
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.badge != null && t.badge !== "" ? (
                <span className="rounded-full bg-foreground/[0.08] px-1.5 text-[11px] font-semibold leading-[18px]">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
        >
          {t.id === active || seen.has(t.id) ? t.content : null}
        </div>
      ))}
    </div>
  );
}
