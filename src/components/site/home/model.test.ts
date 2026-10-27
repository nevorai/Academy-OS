import { describe, expect, it } from "vitest";
import type { Batch, FeePlan, SiteContent, Tenant } from "@/lib/tenant";
import { oneLineAddress, townFromAddress } from "@/lib/public-site";
import {
  buildHomeModel,
  cleanBatchName,
  heroCta,
  packFor,
  parseAges,
  parseFact,
  startMinutes,
  tidyName,
} from "./model";

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

  it("tidies hand-typed batch names for display only", () => {
    expect(cleanBatchName("Personal Coa.[ Night Session ]")).toBe(
      "Personal Coaching · Night Session",
    );
    expect(cleanBatchName("Both Session [ morning + eve ]")).toBe(
      "Both Sessions · Morning + Evening",
    );
    expect(cleanBatchName("Morning Session")).toBe("Morning Session");
    expect(cleanBatchName("  evening   batch ")).toBe("Evening Batch");
    expect(cleanBatchName("U-14 (Boys)")).toBe("U-14 (Boys)");
    expect(cleanBatchName("Nets [ ]")).toBe("Nets");
  });

  it("shows an all-capitals name in normal case and leaves other names alone", () => {
    expect(tidyName("RAJIV BILTHARE")).toBe("Rajiv Bilthare");
    expect(tidyName("KRANTI GOUD")).toBe("Kranti Goud");
    expect(tidyName("Kranti Gaud")).toBe("Kranti Gaud");
    expect(tidyName("MS Dhoni")).toBe("MS Dhoni");
    expect(tidyName("")).toBe("");
  });

  it("reads an age range only when the owner wrote one", () => {
    expect(parseAges("coaching for ages 7 to 21, from your first grip")).toBe("7 to 21");
    expect(parseAges(null, "Ages 6-16 welcome")).toBe("6 to 16");
    expect(parseAges("no age written here")).toBeNull();
    expect(parseAges("ages 21 to 7")).toBeNull();
  });

  it("builds the map, directions and share link from the address when no map link was pasted", () => {
    const m = buildHomeModel({ tenant, sections: [], fees: [], batches: [] });
    expect(m.map.embedUrl).toContain("https://www.google.com/maps?q=");
    expect(m.map.embedUrl).toContain("&output=embed");
    expect(m.map.linkUrl).toContain("https://www.google.com/maps/dir/?api=1&destination=");
    expect(m.map.shareUrl).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(decodeURIComponent(m.map.linkUrl ?? "")).toContain("Chhatarpur");
    const none = buildHomeModel({
      tenant: { ...tenant, address: null } as Tenant,
      sections: [],
      fees: [],
      batches: [],
    });
    expect(none.map).toEqual({ embedUrl: null, linkUrl: null, shareUrl: null });
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
    // A short link cannot be framed, so the frame is built from the address; the owner's link stays the button.
    expect(short.map.embedUrl).toContain("output=embed");
    expect(short.map.linkUrl).toBe("https://maps.app.goo.gl/xyz");
  });
});
