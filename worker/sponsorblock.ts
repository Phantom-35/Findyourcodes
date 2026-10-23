// SponsorBlock: Community-Datenbank mit Zeitstempeln von Werbeblöcken in YouTube-Videos.
// https://wiki.sponsor.ajay.app/w/API_Docs

export type Segment = { start: number; end: number };

export async function sponsorSegments(videoId: string): Promise<Segment[]> {
  const url = new URL("https://sponsor.ajay.app/api/skipSegments");
  url.searchParams.set("videoID", videoId);
  url.searchParams.set("categories", JSON.stringify(["sponsor"]));
  try {
    const res = await fetch(url, { headers: { "User-Agent": "FindYourCodes" } });
    if (res.status === 404) return []; // keine Segmente eingetragen
    if (!res.ok) return [];
    const data = (await res.json()) as { segment: [number, number] }[];
    return data
      .map(({ segment: [start, end] }) => ({ start, end }))
      .sort((a, b) => a.start - b.start);
  } catch {
    return [];
  }
}
