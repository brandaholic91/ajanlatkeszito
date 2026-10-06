// Számok és idők kiírása magyarul.

const numberFormat = new Intl.NumberFormat("hu-HU");

// 11748670 -> "11 748 670 Ft"
export function formatForint(amount: number): string {
  return `${numberFormat.format(amount)} Ft`;
}

// 1234 (ezredmásodperc) -> "1,23 mp"
export function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2).replace(".", ",")} mp`;
}

// Két ISO időpont között eltelt idő ezredmásodpercben.
export function millisecondsBetween(fromIso: string, toIso: string): number {
  return new Date(toIso).getTime() - new Date(fromIso).getTime();
}
