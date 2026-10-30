export interface CsvResult {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t"];
  const counts = candidates.map((delimiter) => ({ delimiter, count: (line.match(new RegExp(`\\${delimiter}`, "g")) ?? []).length }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.count ? counts[0].delimiter : ",";
}

function parseLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function normalizeHeader(header: string): string {
  return header
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCsv(text: string): CsvResult {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return { headers: [], rows: [], delimiter: "," };
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line, delimiter);
    return headers.reduce<Record<string, string>>((accumulator, header, index) => {
      accumulator[header] = cells[index] ?? "";
      return accumulator;
    }, {});
  });
  return { headers, rows, delimiter };
}

export const EMPLOYEE_IMPORT_COLUMNS = [
  { key: "codigo", label: "Código" },
  { key: "tipo_documento", label: "Tipo documento" },
  { key: "documento", label: "Documento" },
  { key: "nombre", label: "Nombre completo" },
  { key: "email", label: "Correo" },
  { key: "telefono", label: "Teléfono" },
  { key: "cargo", label: "Cargo" },
  { key: "sede", label: "Sede (código o nombre)" },
  { key: "centro_costo", label: "Centro de costo (código o nombre)" },
  { key: "estado", label: "Estado" },
] as const;
