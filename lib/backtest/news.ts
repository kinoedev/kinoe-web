import { chicagoClock } from "@/lib/futures/sessions";

/**
 * FOMC decision days (second day of each meeting). Statement 2:00 PM ET = 1:00 PM CT,
 * press conference 1:30 PM CT. Source: federalreserve.gov meeting calendar.
 */
const FOMC_DECISION_DAYS = new Set([
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
]);

/**
 * Approximate news blackout, in Chicago time. There's no historical calendar feed, so this uses fixed windows:
 *  - 07:25–07:45 every weekday: the 7:30 CT slot used by CPI, NFP, PPI, jobless claims and retail sales
 *  - 12:55–13:45 on FOMC decision days
 *  - 09:25–09:45 Wednesdays for crude (EIA inventory report)
 * Returns the reason when `ms` is inside a window, otherwise null.
 */
export function newsBlackout(ms: number, symbolRoot: string): string | null {
  const { minutes, weekday, date } = chicagoClock(ms);
  if (weekday >= 1 && weekday <= 5 && minutes >= 7 * 60 + 25 && minutes < 7 * 60 + 45) return "7:30 CT data";
  if (FOMC_DECISION_DAYS.has(date) && minutes >= 12 * 60 + 55 && minutes < 13 * 60 + 45) return "FOMC";
  if ((symbolRoot === "MCL" || symbolRoot === "CL") && weekday === 3 && minutes >= 9 * 60 + 25 && minutes < 9 * 60 + 45) return "EIA";
  return null;
}
