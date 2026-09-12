/**
 * Formats seconds as MM:SS countdown string.
 * @example formatDuration(2700) → "45:00"
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Formats a date as a human-readable string.
 * @example formatDate(new Date()) → "10 Sep 2026"
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formats a date with time.
 * @example formatDateTime(new Date()) → "10 Sep 2026, 3:45 PM"
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats elapsed seconds as H:MM:SS.
 * @example formatTimeTaken(2301) → "38:21"
 */
export function formatTimeTaken(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Formats a score as "N / M".
 */
export function formatScore(score: number | null, maxScore: number | null): string {
  if (score === null || maxScore === null) return "—";
  return `${score} / ${maxScore}`;
}

/**
 * Calculates percentage (0-100).
 */
export function calcPercentage(score: number | null, maxScore: number | null): number | null {
  if (score === null || maxScore === null || maxScore === 0) return null;
  return Math.round((score / maxScore) * 100);
}

/**
 * Returns a risk level label from risk score.
 */
export function getRiskLevel(riskScore: number): "Normal" | "Monitor" | "Suspicious" | "High Risk" {
  if (riskScore <= 2) return "Normal";
  if (riskScore <= 5) return "Monitor";
  if (riskScore <= 8) return "Suspicious";
  return "High Risk";
}

/**
 * Returns CSS color class for risk level.
 */
export function getRiskColor(riskScore: number): string {
  const level = getRiskLevel(riskScore);
  switch (level) {
    case "Normal": return "text-emerald-400";
    case "Monitor": return "text-amber-400";
    case "Suspicious": return "text-orange-400";
    case "High Risk": return "text-red-400";
  }
}
