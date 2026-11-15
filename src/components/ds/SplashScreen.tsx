/**
 * The one loading screen for the whole app. It is NOT a logo: it is the app's own frame (top bar,
 * number tiles, cards, bottom tabs on phones, sidebar on desktop) with soft grey blocks, so opening
 * the app looks like the dashboard appearing at once and filling in (like Metrol CRM), never a
 * splash. Styles live in the root page (SPLASH_CSS), so it paints with the first HTML, before any JS.
 *
 * `standaloneOnly`: drawn only inside the installed app (display-mode: standalone). Used on public
 * website pages, which arrive finished from the server, so a browser visitor never sees it.
 */
export function SplashScreen({ id, standaloneOnly }: { id?: string; standaloneOnly?: boolean }) {
  return (
    <div
      id={id}
      className={standaloneOnly ? "boot-splash bs-standalone" : "boot-splash"}
      role="status"
      aria-label="Loading"
      suppressHydrationWarning
    >
      <div className="bs-top">
        <div className="bs-bar">
          <span className="bs-b bs-logo" />
          <span className="bs-b bs-title" />
          <span className="bs-grow" />
          <span className="bs-b bs-dot" />
          <span className="bs-b bs-dot" />
          <span className="bs-b bs-dot" />
        </div>
      </div>
      <div className="bs-body">
        <aside className="bs-side">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="bs-b bs-nav" />
          ))}
        </aside>
        <main className="bs-main">
          <span className="bs-b bs-h1" />
          <div className="bs-kpis">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="bs-b bs-kpi" />
            ))}
          </div>
          <span className="bs-b bs-card" />
          <span className="bs-b bs-card bs-card2" />
        </main>
      </div>
      <nav className="bs-tabs">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="bs-b bs-tab" />
        ))}
      </nav>
    </div>
  );
}
