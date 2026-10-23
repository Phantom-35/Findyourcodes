/** "Nord VPN" / "NordVPN®" / "nordvpn.com" -> "nordvpn" */
export function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(com|de|net|org|io|app|eu|co)\b.*$/, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Wie lange ein Code ohne genanntes Ablaufdatum typischerweise gültig ist. */
export const ESTIMATED_VALIDITY_DAYS = 60;
