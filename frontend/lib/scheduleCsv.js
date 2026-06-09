// Client-side CSV of the (possibly edited) 15-min schedule. Columns match the
// backend GET /api/dispatch/schedule.csv so operators get one consistent format.
const HEADER = "datetime,diesel_8_island_a_mw,diesel_9_island_c_mw,diesel_8_units,diesel_9_units,bess_mw";

export function buildScheduleCsv(steps) {
  const rows = (steps || []).map((s) => [
    s.datetime,
    Number(s.diesel_a_mw ?? 0).toFixed(3),
    Number(s.diesel_c_mw ?? 0).toFixed(3),
    s.diesel8_units_on ?? 0,
    s.diesel9_units_on ?? 0,
    Math.max(0, Number(s.battery_mw ?? 0)).toFixed(3),   // discharge supplied; charge shown as 0
  ].join(","));
  return [HEADER, ...rows].join("\n");
}

export function downloadScheduleCsv(steps, date) {
  const BOM = "\uFEFF";  // UTF-8 BOM so Excel auto-detects encoding (Thai text)
  const blob = new Blob([BOM + buildScheduleCsv(steps)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diesel-schedule-${date || "tomorrow"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
