import { supabase } from "@/integrations/supabase/client";
import { loadXlsx } from "@/lib/xlsx-lazy";

/**
 * Phase 02.6 — Registration & Player Management helpers.
 * Kept small & side-effect-free so it can be composed into the existing
 * dashboard.students.tsx and BulkImportStudents without a rewrite.
 */

export {
  PLAYER_STATUSES,
  PLAYING_ROLES,
  BATTING_STYLES,
  BOWLING_STYLES,
  BLOOD_GROUPS,
  AGE_GROUPS,
  ageFromDob,
  inAgeGroup,
  type PlayerStatus,
} from "@/lib/students/constants";
import type { PlayerStatus } from "@/lib/students/constants";

/* ------------------------------------------------------------------ */
/* Duplicate detection                                                 */
/* ------------------------------------------------------------------ */

export type DupeReport = {
  phoneDupes: Map<string, number>; // phone -> existing count in tenant
  similarNames: Map<string, string[]>; // input name -> existing similar names
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function detectDuplicates(
  incoming: { name: string; phone: string }[],
  existing: { name: string; phone: string | null }[],
): DupeReport {
  const existingByPhone = new Set(existing.map((s) => (s.phone || "").replace(/\s+/g, "")));
  const existingNames = existing.map((s) => norm(s.name));

  const phoneDupes = new Map<string, number>();
  const similarNames = new Map<string, string[]>();

  const seenPhones = new Set<string>();
  for (const r of incoming) {
    const p = (r.phone || "").replace(/\s+/g, "");
    if (p && (existingByPhone.has(p) || seenPhones.has(p))) {
      phoneDupes.set(p, (phoneDupes.get(p) ?? 0) + 1);
    }
    if (p) seenPhones.add(p);

    const nn = norm(r.name);
    const hits = existingNames.filter(
      (e) => e === nn || (nn.length > 3 && (e.includes(nn) || nn.includes(e))),
    );
    if (hits.length > 0) similarNames.set(r.name, hits.slice(0, 3));
  }
  return { phoneDupes, similarNames };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

const EXPORT_COLUMNS = [
  ["player_id", "Player ID"],
  ["name", "Name"],
  ["phone", "Mobile"],
  ["email", "Email"],
  ["dob", "DOB"],
  ["gender", "Gender"],
  ["playing_role", "Playing role"],
  ["batting_style", "Batting"],
  ["bowling_style", "Bowling"],
  ["batch_name", "Batch"],
  ["coach_name", "Coach"],
  ["joined_at", "Joined"],
  ["status", "Status"],
  ["guardian_name", "Parent"],
  ["guardian_phone", "Parent phone"],
  ["emergency_contact_name", "Emergency contact"],
  ["emergency_contact_phone", "Emergency phone"],
  ["school_college", "School / College"],
  ["blood_group", "Blood group"],
  ["city", "City"],
  ["state", "State"],
  ["address", "Address"],
  ["current_address", "Current Address"],
  ["aadhaar_front_url", "Aadhaar Front URL"],
  ["aadhaar_back_url", "Aadhaar Back URL"],
] as const;

export async function exportStudents(
  rows: Record<string, unknown>[],
  batchNameById: Map<string, string>,
  format: "csv" | "xlsx",
) {
  const XLSX = await loadXlsx();
  const shaped = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, label] of EXPORT_COLUMNS) {
      const v =
        k === "batch_name" ? (batchNameById.get(String(r.batch_id ?? "")) ?? "") : (r[k] ?? "");
      out[label] = v == null ? "" : String(v);
    }
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(shaped);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Players");
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    XLSX.writeFile(wb, `players-${stamp}.csv`, { bookType: "csv" });
  } else {
    XLSX.writeFile(wb, `players-${stamp}.xlsx`);
  }
}

/* ------------------------------------------------------------------ */
/* Archive / reactivate                                                */
/* ------------------------------------------------------------------ */

export async function archiveStudent(id: string, reason?: string) {
  const { error } = await supabase
    .from("students")
    .update({
      status: "left",
      archived_at: new Date().toISOString(),
      archive_reason: reason ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function reactivateStudent(id: string) {
  const { error } = await supabase
    .from("students")
    .update({
      status: "active",
      archived_at: null,
      archive_reason: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setStudentStatus(id: string, status: PlayerStatus, reason?: string) {
  const patch =
    status === "left"
      ? { status, archived_at: new Date().toISOString(), archive_reason: reason ?? null }
      : { status, archived_at: null, archive_reason: null };
  const { error } = await supabase.from("students").update(patch).eq("id", id);
  if (error) throw error;
}
