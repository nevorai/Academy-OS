import { describe, it, expect } from "vitest";
import { buildStudentInsert, canSubmitNewStudent, emptyNewStudentForm } from "./new-student";

const blank = () => emptyNewStudentForm("2026-10-11");

describe("emptyNewStudentForm", () => {
  it("starts empty, with the joining date set to the day it is given", () => {
    const f = blank();
    expect(f.joined_at).toBe("2026-10-11");
    expect(Object.entries(f).filter(([k, v]) => k !== "joined_at" && v !== "")).toEqual([]);
  });
});

describe("canSubmitNewStudent", () => {
  it("needs a name, a mobile and a session", () => {
    expect(canSubmitNewStudent(blank())).toBe(false);
    expect(canSubmitNewStudent({ ...blank(), name: "Rahul", phone: "9876543210" })).toBe(false);
    expect(
      canSubmitNewStudent({ ...blank(), name: "Rahul", phone: "9876543210", batch_id: "b1" }),
    ).toBe(true);
  });

  it("does not accept spaces as a name or a mobile", () => {
    expect(canSubmitNewStudent({ ...blank(), name: "  ", phone: "98", batch_id: "b1" })).toBe(
      false,
    );
    expect(canSubmitNewStudent({ ...blank(), name: "Rahul", phone: " ", batch_id: "b1" })).toBe(
      false,
    );
  });
});

describe("buildStudentInsert", () => {
  const row = buildStudentInsert({
    tenantId: "t1",
    form: {
      ...blank(),
      name: "  Rahul Sharma ",
      phone: " 98765 43210 ",
      batch_id: "b1",
      fee_plan_id: "p1",
      city: "Chhatarpur",
    },
    photoUrl: null,
    activationToken: "tok",
  });

  it("belongs to the academy it was added in", () => {
    expect(row.tenant_id).toBe("t1");
  });

  it("trims the name and the mobile but keeps what is inside them", () => {
    expect(row.name).toBe("Rahul Sharma");
    expect(row.phone).toBe("98765 43210");
  });

  it("stores empty optional fields as null, never as empty text", () => {
    expect(row.email).toBeNull();
    expect(row.dob).toBeNull();
    expect(row.guardian_phone).toBeNull();
    expect(row.medical_notes).toBeNull();
    expect(row.photo_url).toBeNull();
    expect(Object.values(row).includes("")).toBe(false);
  });

  it("keeps what was filled in", () => {
    expect(row.batch_id).toBe("b1");
    expect(row.fee_plan_id).toBe("p1");
    expect(row.city).toBe("Chhatarpur");
    expect(row.joined_at).toBe("2026-10-11");
  });

  it("starts the player active, waiting to set up a login", () => {
    expect(row.status).toBe("active");
    expect(row.lifecycle_status).toBe("imported");
    expect(row.activation_token).toBe("tok");
  });

  it("carries the photo when one was uploaded", () => {
    const withPhoto = buildStudentInsert({
      tenantId: "t1",
      form: { ...blank(), name: "A", phone: "1", batch_id: "b1" },
      photoUrl: "https://media.nevorai.com/x.jpg",
      activationToken: "tok",
    });
    expect(withPhoto.photo_url).toBe("https://media.nevorai.com/x.jpg");
  });
});
