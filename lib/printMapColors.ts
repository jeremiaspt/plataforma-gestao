export const printMapPalette = [
  { key: "mint", label: "Verde agua", fill: "#dff5ef", stroke: "#4fb39b", text: "#123f37" },
  { key: "sky", label: "Azul claro", fill: "#dfeffa", stroke: "#5fa8d8", text: "#12344d" },
  { key: "lavender", label: "Lavanda", fill: "#ece7fb", stroke: "#9b87d9", text: "#31245f" },
  { key: "peach", label: "Pesego", fill: "#fde8d8", stroke: "#e59b68", text: "#5a2e14" },
  { key: "rose", label: "Rosa suave", fill: "#f9dfe8", stroke: "#d96c91", text: "#5b1730" },
  { key: "lemon", label: "Amarelo suave", fill: "#fbf3c9", stroke: "#d9bd4a", text: "#4a3b08" },
  { key: "sage", label: "Verde seco", fill: "#e7f0d5", stroke: "#92b66a", text: "#2f4317" },
  { key: "gray", label: "Cinza azulado", fill: "#e8edf3", stroke: "#8da0b5", text: "#27384a" }
] as const;

export type PrintMapPaletteKey = (typeof printMapPalette)[number]["key"];

export function printMapPaletteItem(colorKey?: string | null) {
  return printMapPalette.find((item) => item.key === colorKey) || printMapPalette[0];
}

export function parsePrintMapPatterns(value?: string | null) {
  return (value || "")
    .split(/[\/,\n;]/)
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);
}

export function printMapRuleMatches(title: string, patterns?: string | null) {
  const normalizedTitle = title.trim().toLowerCase();
  return parsePrintMapPatterns(patterns).some((pattern) => normalizedTitle.startsWith(pattern));
}
