import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPUS_LOCATIONS, findCampusLocation, groupFoundReportsByLocation, locationNameForSelection,
} from "../lib/campus-locations.ts";

const report = (id, location, overrides = {}) => ({
  id, location, title: `Item ${id}`, report_type: "found", status: "open", ...overrides,
});

test("curated UMass locations have distinct verified coordinates and required landmarks", () => {
  const names = CAMPUS_LOCATIONS.map(location => location.name);
  for (const name of ["W.E.B. Du Bois Library", "Student Union", "Integrative Learning Center",
    "Campus Center", "Worcester Commons", "Recreation Center"]) assert.ok(names.includes(name));
  assert.equal(new Set(CAMPUS_LOCATIONS.map(location => location.id)).size, CAMPUS_LOCATIONS.length);
  for (const location of CAMPUS_LOCATIONS) {
    assert.ok(location.latitude > 42.38 && location.latitude < 42.40);
    assert.ok(location.longitude > -72.54 && location.longitude < -72.51);
    assert.match(location.osm, /^https:\/\/www\.openstreetmap\.org\/(?:way|relation)\/\d+$/);
  }
});

test("location selection saves the canonical building name and matches aliases", () => {
  assert.equal(locationNameForSelection("du-bois-library"), "W.E.B. Du Bois Library");
  assert.equal(locationNameForSelection("other"), "");
  assert.equal(findCampusLocation("  integrated  learning center ")?.id, "ilc");
  assert.equal(findCampusLocation("ILC")?.name, "Integrative Learning Center");
  assert.equal(findCampusLocation("rec center")?.id, "recreation-center");
});

test("unknown manual locations stay unpinned while multiple reports share one marker", () => {
  assert.equal(findCampusLocation("Near a bench outside the library"), null);
  assert.equal(findCampusLocation("Library"), null);
  assert.equal(findCampusLocation(""), null);
  const rows = [
    report("a", "Student Union"), report("b", "UMass Student Union"),
    report("c", "Near a bench outside the library"),
    report("d", "Student Union", { report_type: "lost" }),
    report("e", "Student Union", { status: "resolved" }),
  ];
  const grouped = groupFoundReportsByLocation(rows);
  assert.equal(grouped.groups.length, 1);
  assert.deepEqual(grouped.groups[0].reports.map(item => item.id), ["a", "b"]);
  assert.deepEqual(grouped.unmapped.map(item => item.id), ["c"]);
});
