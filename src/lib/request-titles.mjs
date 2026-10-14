import { mallCatalog } from "./mall-catalog.mjs";
export function operationalAreas(code) {
  const rows =
    code === "MOD"
      ? mallCatalog.modItems.map((i) => ({ area: i.floor + " · " + i.area }))
      : mallCatalog.operations.filter((i) => i.department === code);
  return [...new Set(rows.map((i) => i.area))];
}
export function requestTitles(code, area) {
  const rows =
    code === "MOD"
      ? mallCatalog.modItems.filter((i) => i.floor + " · " + i.area === area)
      : mallCatalog.operations.filter(
          (i) => i.department === code && i.area === area,
        );
  return [...new Set(rows.map((i) => i.title).filter(Boolean)), "Lainnya"];
}
