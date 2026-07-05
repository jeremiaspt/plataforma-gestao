function escapeCell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReportDate(date: Date) {
  return date.toLocaleDateString("pt-PT");
}

export function formatReportDateTime(date: Date) {
  return date.toLocaleString("pt-PT");
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function buildExcelTable(title: string, rows: Array<Record<string, unknown>>) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : ["Sem dados"];
  const bodyRows =
    rows.length > 0
      ? rows
          .map(
            (row) =>
              `<tr>${columns.map((column) => `<td>${escapeCell(row[column])}</td>`).join("")}</tr>`
          )
          .join("")
      : `<tr><td>Sem dados para o periodo selecionado.</td></tr>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, sans-serif; }
      th, td { border: 1px solid #999; padding: 6px 8px; mso-number-format: "\\@"; }
      th { background: #e6f5f2; font-weight: 700; }
      h1 { font-family: Arial, sans-serif; font-size: 18px; }
    </style>
  </head>
  <body>
    <h1>${escapeCell(title)}</h1>
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${escapeCell(column)}</th>`).join("")}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`;
}

export function excelResponse(filename: string, content: string) {
  return new Response(content, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
