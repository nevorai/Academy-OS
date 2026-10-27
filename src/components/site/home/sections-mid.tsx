/**
 * Home page, middle: the coach, star players, the match centre and how a session runs.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle, Phone } from "lucide-react";
import type { Tenant } from "@/lib/tenant";
import { StoragedImage } from "@/components/site/StoragedImage";
import { StarPlayerCard, StarPlayerFeaturedCard } from "@/components/site/StarPlayersShowcase";
import { OverStrip, WagonWheel, BallMark } from "./art";
import { CRICKET_SESSION } from "./copy";
import type { HomeModel } from "./model";
import {
  BTN_BRAND,
  BTN_GHOST_DARK,
  BTN_GHOST_LIGHT,
  BTN_HOT,
  SectionHead,
  WRAP,
} from "./sections-top";

const waNumber = (n?: string | null) => n?.replace(/[^\d]/g, "") || "";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------- founder */

export function Founder({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  const f = m.founder;
  if (!f) return null;
  const wa = waNumber(tenant.whatsapp ?? tenant.phone);
  const phone = tenant.phone?.trim();
  const first = f.name.split(/\s+/)[0];
  const credentials = f.credentials
    .split(/[\n,;•]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 6);
  return (
    <section className="bg-[#F4F1E9] py-16 text-[#0A0F1A] sm:py-24" id="coach">
      <div
        className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-16`}
      >
        <div className="relative mx-auto w-full max-w-md">
          <div
            className="absolute -bottom-3 -right-3 h-full w-full rounded-xl border-2 border-[var(--brand)]"
            aria-hidden="true"
          />
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#0A0F1A]">
            <StoragedImage
              path={f.photo}
              alt={f.name}
              className="h-full w-full object-cover"
              lazy
              fallback={
                <div className="grid h-full w-full place-items-center bg-[var(--brand)] font-[family-name:var(--font-display)] text-7xl font-extrabold text-white">
                  {initials(f.name)}
                </div>
              }
            />
          </div>
          <BallMark size={56} className="absolute -top-4 left-0 drop-shadow-lg sm:-left-4" />
        </div>
        <div>
          <SectionHead n={4} label="The coach" title={f.name} />
          {f.title ? (
            <p className="mt-3 text-xl font-semibold text-[var(--brand)]">{f.title}</p>
          ) : null}
          {credentials.length ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {credentials.map((c) => (
                <li
                  key={c}
                  className="rounded-md border border-[#0A0F1A]/15 bg-white px-3 py-1.5 text-sm font-medium"
                >
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
          {f.bio ? (
            <p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-[#0A0F1A]/75">
              {f.bio}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            {wa ? (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noreferrer"
                className={BTN_BRAND}
              >
                <MessageCircle className="h-4 w-4" />
                Message {first} on WhatsApp
              </a>
            ) : null}
            {phone ? (
              <a href={`tel:${phone}`} className={BTN_GHOST_LIGHT}>
                <Phone className="h-4 w-4" />
                Call {phone}
              </a>
            ) : null}
          </div>
        </div>
      </div>
      {m.coaches.length ? (
        <div className={`${WRAP} mt-14 border-t border-[#0A0F1A]/12 pt-10`}>
          <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold">
            Coaching team
          </h3>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {m.coaches.slice(0, 8).map((c) => (
              <li
                key={c.name}
                className="flex items-center gap-4 rounded-[10px] border border-[#0A0F1A]/12 bg-white p-4"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--brand)]">
                  <StoragedImage
                    path={c.photo}
                    alt={c.name}
                    lazy
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="grid h-full w-full place-items-center font-bold text-white">
                        {initials(c.name)}
                      </div>
                    }
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name}</div>
                  {c.role ? (
                    <div className="truncate text-sm text-[#0A0F1A]/65">{c.role}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- stars */

export function Stars({ m }: { m: HomeModel }) {
  const { featured, rest } = m.stars;
  if (!featured) return null;
  return (
    <section className="overflow-hidden bg-[#0A0F1A] py-16 text-white sm:py-24" id="players">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead n={5} label="Star players" title="Trained here, playing at the top" dark />
          <Link to="/star-players" className={BTN_GHOST_DARK}>
            All star players
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-12">
          <StarPlayerFeaturedCard player={featured} />
        </div>
        {rest.length ? (
          <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {rest.slice(0, 6).map((p) => (
              <StarPlayerCard key={p.name} player={p} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- spotlight */

export function Spotlights({ m }: { m: HomeModel }) {
  if (!m.spotlights.length) return null;
  return (
    <section className="bg-white py-16 text-[#0A0F1A] sm:py-24" id="spotlight">
      <div className={`${WRAP} space-y-16`}>
        {m.spotlights.map((sp, i) => (
          <div
            key={sp.name + i}
            className={`grid gap-10 md:grid-cols-2 md:items-center ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}
          >
            <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-xl bg-[#F4F1E9]">
              <StoragedImage
                path={sp.photo}
                alt={sp.name}
                lazy
                className="h-full w-full object-cover"
                fallback={
                  <div className="grid h-full w-full place-items-center bg-[var(--brand)] text-6xl font-bold text-white">
                    {initials(sp.name)}
                  </div>
                }
              />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand)]">
                Spotlight
              </div>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-tight tracking-tight">
                {sp.name}
              </h2>
              {sp.role ? (
                <div className="mt-2 text-sm font-semibold uppercase tracking-widest text-[#0A0F1A]/60">
                  {sp.role}
                </div>
              ) : null}
              {sp.bio ? (
                <p className="mt-5 whitespace-pre-line text-lg leading-relaxed text-[#0A0F1A]/72">
                  {sp.bio}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- match centre */

export function MatchCentre({ m }: { m: HomeModel }) {
  if (m.pack !== "cricket") return null;
  const points = [
    ["Live scores", "Follow a match ball by ball from your phone."],
    ["Fixtures and results", "Every match and tournament in one place."],
    ["Player stats", "Runs, wickets and form for each player, over time."],
  ] as const;
  return (
    <section
      className="relative isolate overflow-hidden bg-[#070B14] py-16 text-white sm:py-24"
      id="match-centre"
    >
      {/* Floodlight glow: volt from the top right, ball red from the bottom left, over a faint pitch grid. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(640px 420px at 84% 8%, color-mix(in srgb, var(--pub-hot) 20%, transparent), transparent 70%), radial-gradient(560px 400px at 6% 100%, color-mix(in srgb, var(--pub-ball) 28%, transparent), transparent 70%), linear-gradient(180deg, #070B14, #0B1426)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:56px_56px]"
      />
      <div
        className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center`}
      >
        <div>
          <SectionHead
            n={6}
            label="Match centre"
            title="Every ball, every score, on your phone"
            dark
          />
          <ul className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {points.map(([t, d]) => (
              <li
                key={t}
                className="rounded-[10px] border border-white/12 border-t-2 border-t-[var(--pub-hot)] bg-white/[0.05] p-4"
              >
                <div className="font-[family-name:var(--font-display)] text-lg font-bold">{t}</div>
                <p className="mt-1 text-sm leading-snug text-white/70">{d}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Link to="/matches" className={BTN_HOT}>
              Open the match centre
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[400px] rounded-2xl border border-white/15 bg-black/35 p-6 text-white backdrop-blur-md">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.24em]">
            <span className="text-[var(--pub-hot)]">Scoreboard</span>
            <span className="inline-flex items-center gap-2 text-white/60">
              <span className="h-2 w-2 rounded-full bg-[var(--pub-ball)]" aria-hidden="true" />
              Ball by ball
            </span>
          </div>
          <WagonWheel className="mt-4 h-auto w-full" />
          <div className="mt-5 flex justify-center">
            <OverStrip />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- session */

export function Session({ m }: { m: HomeModel }) {
  if (m.pack !== "cricket") return null;
  return (
    <section className="bg-[#F4F1E9] py-16 text-[#0A0F1A] sm:py-24" id="session">
      <div className={WRAP}>
        <SectionHead
          n={1}
          label="A typical session"
          title="How a training session runs"
          lead="Same shape every day, so players know what to expect and coaches can see progress."
        />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {CRICKET_SESSION.map((s, i) => (
            <li
              key={s.title}
              className="relative rounded-xl border border-[#0A0F1A]/12 bg-white p-5"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#0A0F1A] font-[family-name:var(--font-display)] text-sm font-bold text-white">
                {i + 1}
              </div>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold leading-snug">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#0A0F1A]/70">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
