import type { Report } from "./frontend-api";

export type CampusLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  aliases: readonly string[];
  osm: string;
};

// Building names are on the UMass Amherst campus map. Coordinates are the
// centers of the linked OpenStreetMap features, not guessed street positions.
export const CAMPUS_LOCATIONS: readonly CampusLocation[] = [
  { id: "du-bois-library", name: "W.E.B. Du Bois Library", latitude: 42.3897359, longitude: -72.5281676, aliases: ["Du Bois Library", "WEB Du Bois Library"], osm: "https://www.openstreetmap.org/relation/4054634" },
  { id: "student-union", name: "Student Union", latitude: 42.3908740, longitude: -72.5275995, aliases: ["UMass Student Union"], osm: "https://www.openstreetmap.org/way/30698362" },
  { id: "ilc", name: "Integrative Learning Center", latitude: 42.3910382, longitude: -72.5259025, aliases: ["Integrated Learning Center", "ILC"], osm: "https://www.openstreetmap.org/way/292876549" },
  { id: "campus-center", name: "Campus Center", latitude: 42.3917952, longitude: -72.5270189, aliases: ["Lincoln Campus Center", "Murray D. Lincoln Campus Center"], osm: "https://www.openstreetmap.org/way/30698361" },
  { id: "worcester-commons", name: "Worcester Commons", latitude: 42.3932825, longitude: -72.5250891, aliases: ["Worcester Dining Commons"], osm: "https://www.openstreetmap.org/way/217056238" },
  { id: "recreation-center", name: "Recreation Center", latitude: 42.3888300, longitude: -72.5316791, aliases: ["Rec Center", "Campus Recreation Center"], osm: "https://www.openstreetmap.org/way/147156712" },
  { id: "old-chapel", name: "Old Chapel", latitude: 42.3890263, longitude: -72.5279757, aliases: [], osm: "https://www.openstreetmap.org/way/147156753" },
  { id: "lederle-tower", name: "Lederle Graduate Research Tower", latitude: 42.3939219, longitude: -72.5276631, aliases: ["Lederle", "LGRT", "Lederle Graduate Research Center"], osm: "https://www.openstreetmap.org/way/122196717" },
  { id: "mullins-center", name: "Mullins Center", latitude: 42.3895203, longitude: -72.5334498, aliases: [], osm: "https://www.openstreetmap.org/way/30698363" },
  { id: "berkshire-commons", name: "Berkshire Dining Commons", latitude: 42.3819458, longitude: -72.5300022, aliases: ["Berkshire DC", "Berkshire Commons"], osm: "https://www.openstreetmap.org/way/184350201" },
];

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

export function findCampusLocation(value: string): CampusLocation | null {
  const name = normalize(value);
  if (!name) return null;
  return CAMPUS_LOCATIONS.find(location =>
    normalize(location.name) === name || location.aliases.some(alias => normalize(alias) === name)) ?? null;
}

/** The Other choice clears a named location so the manual field can be filled. */
export function locationNameForSelection(id: string): string {
  return CAMPUS_LOCATIONS.find(location => location.id === id)?.name ?? "";
}

export function groupFoundReportsByLocation(reports: readonly Report[]) {
  const groups = new Map<string, { location: CampusLocation; reports: Report[] }>();
  const unmapped: Report[] = [];
  for (const report of reports) {
    if (report.report_type !== "found" || report.status !== "open") continue;
    const location = findCampusLocation(report.location);
    if (!location) { unmapped.push(report); continue; }
    const group = groups.get(location.id) ?? { location, reports: [] };
    group.reports.push(report);
    groups.set(location.id, group);
  }
  return { groups: [...groups.values()], unmapped };
}
