/**
 * Checks an Indian mobile number as the owner types it.
 * Accepts spaces, dashes, "+91" and a leading 0; the result is always the plain 10 digits.
 * `message` is what to show in red under the field, in plain words; null when the number is fine.
 */
export type MobileCheck = { digits: string; ok: boolean; message: string | null };

export function checkMobile(raw: string): MobileCheck {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 0) return { digits: d, ok: false, message: "Enter the 10-digit mobile number" };
  if (d.length < 10) {
    const left = 10 - d.length;
    return {
      digits: d,
      ok: false,
      message: `Number is incomplete: ${left} more digit${left === 1 ? "" : "s"} needed`,
    };
  }
  if (d.length > 10)
    return { digits: d, ok: false, message: "Number is too long. Enter 10 digits only" };
  if (!/^[6-9]/.test(d))
    return { digits: d, ok: false, message: "An Indian mobile number starts with 6, 7, 8 or 9" };
  return { digits: d, ok: true, message: null };
}
