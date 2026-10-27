import { describe, expect, it } from "vitest";
import type { Batch, FeePlan, SiteContent, Tenant } from "@/lib/tenant";
import { oneLineAddress, townFromAddress } from "@/lib/public-site";
import { buildHomeModel, heroCta, packFor, parseFact, startMinutes } from "./model";

const tenant = {
  id: "t1",
  name: "Sai Sports Academy",
  tagline: "Where champions are made",
  niche: "academy",
  address: "Near Temple,\nChhatarpur, Madhya Pradesh – 471001, India.",
} as Tenant;
const row = (section: string, content: unknown, sort_order = 0) =>
  ({ section, content, sort_order }) as unknown as SiteContent;
const batch = (
  id: string,
  name: string,
  timing: string | null,
  fee_plan_id: string | null = null,
) => ({ id, name, timing, fee_plan_id }) as unknown as Batch;
const fee = (id: string, type: string, amount: number) =>
  ({ id, type, amount, name: id }) as unknown as FeePlan;

describe("home page rules", () => {
  it("cricket sites say 'Join the squad' unless the owner wrote their own button text", () => {
    expect(heroCta("cricket", "")).toBe("Join the squad");
    expect(heroCta("cricket", "Register Now")).toBe("Join the squad");
    expect(heroCta("cricket", "Register")).toBe("Join the squad");
    expect(heroCta("cricket", "Book a trial")).toBe("Book a trial");
    expect(heroCta("gym", "")).toBe("Register now");
    expect(heroCta("learning", "Register Now")).toBe("Register Now");
  });

  it("splits a fact into figure and label", () => {
    expect(parseFact("800+ students trained")).toEqual({
      figure: "800+",
      label: "students trained",
    });
    expect(parseFact("3-time inter-academy champions")).toEqual({
      figure: "3-time",
      label: "inter-academy champions",
    });
    expect(parseFact("Founded by a state player")).toEqual({
      figure: null,
      label: "Founded by a state player",
    });
    expect(parseFact("  ")).toBeNull();
  });

  it("reads the start of a timing in minutes", () => {
    expect(startMinutes("6:30 AM – 9:00 AM")).toBe(6 * 60 + 30);
    expect(startMinutes("4:00 PM – 6:30 PM")).toBe(16 * 60);
    expect(startMinutes("12:15 AM")).toBe(15);
    expect(startMinutes(null)).toBeNull();
    expect(startMinutes("morning")).toBeNull();
  });

  it("finds the town and writes the address on one line", () => {
    expect(townFromAddress(tenant.address)).toBe("Chhatarpur");
    expect(townFromAddress("Main Road, Indore")).toBe("Indore");
    expect(townFromAddress(null)).toBeNull();
    expect(oneLineAddress("Near Temple,\nChhatarpur")).toBe("Near Temple, Chhatarpur");
    expect(oneLineAddress("Near Temple\nChhatarpur")).toBe("Near Temple, Chhatarpur");
  });

  it("picks the wording from the niche", () => {
    expect(packFor("academy")).toBe("cricket");
    expect(packFor("gym")).toBe("gym");
    expect(packFor("tuition")).toBe("learning");
  });

  it("orders batches by start time, unknown last, and keeps hidden fees hidden", () => {
    const m = buildHomeModel({
      tenant,
      sections: [row("pricing", { visible: "false" })],
      fees: [fee("f1", "monthly", 1500)],
      batches: [
        batch("b1", "Evening", "4:00 PM – 6:30 PM", "f1"),
        batch("b2", "Both", null),
        batch("b3", "Morning", "6:30 AM – 9:00 AM", "f1"),
      ],
    });
    expect(m.batches.map((b) => b.name)).toEqual(["Morning", "Evening", "Both"]);
    expect(m.showPricing).toBe(false);
    expect(m.batches[0].fee).toBe(1500);
  });

  it("shows pricing only when the owner turned it on", () => {
    const base = {
      tenant,
      fees: [fee("f1", "monthly", 1500), fee("r", "registration", 2000)],
      batches: [],
    };
    expect(
      buildHomeModel({ ...base, sections: [row("pricing", { visible: "true" })] }).showPricing,
    ).toBe(true);
    expect(buildHomeModel({ ...base, sections: [] }).showPricing).toBe(false);
    expect(buildHomeModel({ ...base, sections: [] }).registration?.amount).toBe(2000);
  });

  it("builds without any content: nothing breaks and nothing is invented", () => {
    const m = buildHomeModel({ tenant, sections: [], fees: [], batches: [] });
    expect(m.about).toBeNull();
    expect(m.founder).toBeNull();
    expect(m.facts).toEqual([]);
    expect(m.gallery).toEqual([]);
    expect(m.stars.featured).toBeNull();
    expect(m.hero.headline).toBe("Where champions are made");
  });

  it("reads achievements as facts and caps them at four", () => {
    const sections = Array.from({ length: 6 }, (_, i) =>
      row("achievements", { text: `${i + 1}+ things done` }, i),
    );
    expect(buildHomeModel({ tenant, sections, fees: [], batches: [] }).facts).toHaveLength(4);
  });

  it("uses an embeddable map as a frame and any other link as a button", () => {
    const embed = buildHomeModel({
      tenant,
      sections: [row("map", { embed_url: "https://www.google.com/maps/embed?pb=abc" })],
      fees: [],
      batches: [],
    });
    expect(embed.map.embedUrl).toContain("maps/embed");
    const short = buildHomeModel({
      tenant,
      sections: [row("map", { embed_url: "https://maps.app.goo.gl/xyz" })],
      fees: [],
      batches: [],
    });
    expect(short.map.embedUrl).toBeNull();
    expect(short.map.linkUrl).toBe("https://maps.app.goo.gl/xyz");
  });
});
