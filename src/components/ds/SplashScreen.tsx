/** The one loading screen for the whole app (styles live in the root page, so it paints with the first HTML). */
export function SplashScreen({ id }: { id?: string }) {
  return (
    <div id={id} className="boot-splash" suppressHydrationWarning>
      <div className="mark">
        <svg
          width="38"
          height="38"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c2.5 3 2.5 15 0 18M3 12c3-2.5 15-2.5 18 0" />
        </svg>
      </div>
      <div className="name">Nevorai Academy</div>
      <div className="spin" />
    </div>
  );
}
