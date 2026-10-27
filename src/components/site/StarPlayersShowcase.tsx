import { Link } from "@tanstack/react-router";
import { ArrowRight, Trophy } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { StoragedImage } from "./StoragedImage";

export type RawStarPlayer = {
  name: string;
  achievement: string;
  photo_url?: string | null;
  teams?: string[] | string | null;
  featured?: boolean | string | null;
  currently_playing?: string | null;
};

export type StarPlayer = {
  name: string;
  achievement: string;
  photo_url?: string | null;
  teams: string[];
  featured: boolean;
  currently_playing: string | null;
};

export function normalizeStar(raw: RawStarPlayer): StarPlayer {
  const teams = Array.isArray(raw.teams)
    ? raw.teams.filter(Boolean).map(String)
    : typeof raw.teams === "string"
      ? raw.teams
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const featured = raw.featured === true || raw.featured === "true";
  return {
    name: raw.name,
    achievement: raw.achievement,
    photo_url: raw.photo_url ?? null,
    teams,
    featured,
    currently_playing: raw.currently_playing ?? null,
  };
}

/** Pick which player to render as the featured hero card. */
export function pickFeatured(players: StarPlayer[]): {
  featured: StarPlayer | null;
  rest: StarPlayer[];
} {
  if (players.length === 0) return { featured: null, rest: [] };
  const flagged = players.findIndex((p) => p.featured);
  const idx = flagged >= 0 ? flagged : 0;
  return {
    featured: players[idx],
    rest: players.filter((_, i) => i !== idx),
  };
}

/** The card frame: a thin volt-to-brand-to-red edge around a night panel, like a collectible. */
const CARD_EDGE =
  "bg-[linear-gradient(145deg,var(--pub-hot),var(--brand)_55%,var(--pub-ball))] p-[2px]";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

function CardFallback({ name, big = false }: { name: string; big?: boolean }) {
  return (
    <div
      className={`grid h-full w-full place-items-center bg-[linear-gradient(160deg,#14213d,#070B14)] font-[family-name:var(--font-display)] font-extrabold text-[var(--pub-hot)] ${big ? "text-8xl" : "text-6xl"}`}
    >
      {initials(name)}
    </div>
  );
}

/** Big trading card for the top star, with the story beside it. */
export function StarPlayerFeaturedCard({ player }: { player: StarPlayer }) {
  const tenant = useTenant();
  const firstTeam = player.teams[0];
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center md:gap-14">
      <div className="group relative mx-auto w-full max-w-[460px]">
        <div
          aria-hidden="true"
          className="absolute -inset-4 rounded-[36px] opacity-30 blur-2xl"
          style={{
            background: "linear-gradient(135deg, var(--pub-hot), var(--brand), var(--pub-ball))",
          }}
        />
        <div className={`relative rounded-[22px] ${CARD_EDGE}`}>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-[#070B14]">
            <StoragedImage
              path={player.photo_url}
              alt={player.name}
              lazy
              className="h-full w-full object-cover"
              fallback={<CardFallback name={player.name} big />}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#070B14] via-[#070B14]/70 to-transparent" />
            <div className="pub-card-sheen pointer-events-none absolute inset-0" />
            {firstTeam ? (
              <span className="absolute left-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pub-hot)] backdrop-blur-sm">
                {firstTeam}
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none tracking-tight text-white">
                {player.name}
              </div>
              {player.currently_playing ? (
                <div className="mt-1.5 text-sm font-semibold text-white/80">
                  {player.currently_playing}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--pub-hot)]">
          From {tenant.name} to the National Stage
        </div>
        <h3 className="mt-4 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl">
          {player.name}
        </h3>
        {player.currently_playing ? (
          <div className="mt-3 text-lg font-semibold text-white/85">{player.currently_playing}</div>
        ) : null}
        <p className="mt-5 flex items-start gap-2 text-base leading-relaxed text-white/70 sm:text-lg">
          <Trophy className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--pub-hot)]" />
          <span>{player.achievement}</span>
        </p>

        {player.teams.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {player.teams.map((t, i) => (
              <span
                key={i}
                className="rounded-md border border-white/20 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/90"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-8">
          <Link
            to="/register"
            className="group inline-flex items-center gap-2 rounded-[10px] bg-[var(--pub-hot)] px-6 py-3.5 text-[15px] font-bold text-[var(--pub-hot-ink)] transition-[transform,filter] hover:brightness-95 active:scale-[0.98]"
          >
            Be the next star
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Trading card for every other star. */
export function StarPlayerCard({ player }: { player: StarPlayer }) {
  const firstTeam = player.teams[0];
  return (
    <div
      className={`group relative rounded-[18px] transition-transform duration-300 hover:-translate-y-1 ${CARD_EDGE}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#070B14]">
        <StoragedImage
          path={player.photo_url}
          alt={player.name}
          lazy
          className="h-full w-full object-cover"
          fallback={<CardFallback name={player.name} />}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#070B14] via-[#070B14]/80 to-transparent" />
        <div className="pub-card-sheen pointer-events-none absolute inset-0" />
        {firstTeam ? (
          <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--pub-hot)] backdrop-blur-sm">
            {firstTeam}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <div className="font-[family-name:var(--font-display)] text-lg font-extrabold leading-tight tracking-tight text-white sm:text-xl">
            {player.name}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-snug text-white/70">
            {player.currently_playing || player.achievement}
          </div>
        </div>
      </div>
    </div>
  );
}
