// The 13+ rule as the server applies it (backend classroom/security.py, ADR 0005): only month and year are asked, and
// someone is old enough once the current month is more than 13 years after their birth month. This copy only gives
// an instant answer at the field; the server stays the one that decides.
export function isThirteenOrOlder(month: number, year: number, today: Date = new Date()): boolean {
  const thisYear = today.getUTCFullYear();
  if (!Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (month < 1 || month > 12 || year < 1900 || year > thisYear) return false;
  const months = (thisYear - year) * 12 + (today.getUTCMonth() + 1 - month);
  return months > 13 * 12;
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** The password rules, one line each, so the form can tick them off while typing (mirrors security.password_problem). */
export function passwordChecks(pw: string): { label: string; ok: boolean }[] {
  return [
    { label: `${PASSWORD_MIN} or more characters`, ok: pw.length >= PASSWORD_MIN },
    { label: "No space at the start or the end", ok: pw.length > 0 && pw.trim() === pw },
    { label: `No more than ${PASSWORD_MAX} characters`, ok: pw.length <= PASSWORD_MAX },
  ];
}

/** School or group names: trim and collapse repeated spaces. The server does the same on save. */
export function tidyName(s: string): string {
  return s.trim().split(/\s+/).join(" ");
}
