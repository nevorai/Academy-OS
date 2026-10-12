/**
 * The "Add player" form: its fields, when it may be sent, and the row it
 * saves. Pure functions, no data access, so they are easy to test.
 */

export interface NewStudentForm {
  name: string;
  phone: string;
  email: string;
  dob: string;
  gender: string;
  playing_role: string;
  batting_style: string;
  bowling_style: string;
  bowling_arm: string;
  guardian_name: string;
  guardian_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  school_college: string;
  blood_group: string;
  medical_notes: string;
  batch_id: string;
  fee_plan_id: string;
  coach_name: string;
  /** Joining date, YYYY-MM-DD. */
  joined_at: string;
}

export type NewStudentSection = "basic" | "cricket" | "contact" | "medical";

export const NEW_STUDENT_SECTIONS: readonly (readonly [NewStudentSection, string])[] = [
  ["basic", "Required"],
  ["cricket", "Cricket"],
  ["contact", "Contact"],
  ["medical", "Medical"],
];

/** A blank form. `today` is the academy's own calendar day (YYYY-MM-DD), not the UTC day. */
export function emptyNewStudentForm(today: string): NewStudentForm {
  return {
    name: "",
    phone: "",
    email: "",
    dob: "",
    gender: "",
    playing_role: "",
    batting_style: "",
    bowling_style: "",
    bowling_arm: "",
    guardian_name: "",
    guardian_phone: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    school_college: "",
    blood_group: "",
    medical_notes: "",
    batch_id: "",
    fee_plan_id: "",
    coach_name: "",
    joined_at: today,
  };
}

/** Name, mobile and a session are the only things a player cannot be added without. */
export function canSubmitNewStudent(f: NewStudentForm): boolean {
  return !!f.name.trim() && !!f.phone.trim() && !!f.batch_id;
}

const orNull = (v: string) => v || null;

/**
 * The row saved for a new player. Optional fields left empty are stored as
 * null (never as an empty string), and the name and mobile lose the spaces
 * typed around them.
 */
export function buildStudentInsert({
  tenantId,
  form: f,
  photoUrl,
  activationToken,
}: {
  tenantId: string;
  form: NewStudentForm;
  photoUrl: string | null;
  activationToken: string;
}) {
  return {
    tenant_id: tenantId,
    name: f.name.trim(),
    phone: f.phone.trim(),
    email: orNull(f.email),
    guardian_name: orNull(f.guardian_name),
    guardian_phone: orNull(f.guardian_phone),
    emergency_contact_name: orNull(f.emergency_contact_name),
    emergency_contact_phone: orNull(f.emergency_contact_phone),
    dob: orNull(f.dob),
    gender: orNull(f.gender),
    playing_role: orNull(f.playing_role),
    batting_style: orNull(f.batting_style),
    bowling_style: orNull(f.bowling_style),
    bowling_arm: orNull(f.bowling_arm),
    address: orNull(f.address),
    city: orNull(f.city),
    state: orNull(f.state),
    pincode: orNull(f.pincode),
    school_college: orNull(f.school_college),
    blood_group: orNull(f.blood_group),
    medical_notes: orNull(f.medical_notes),
    batch_id: orNull(f.batch_id),
    fee_plan_id: orNull(f.fee_plan_id),
    coach_name: orNull(f.coach_name),
    joined_at: f.joined_at,
    photo_url: photoUrl,
    status: "active",
    lifecycle_status: "imported",
    activation_token: activationToken,
  };
}
