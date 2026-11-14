# Campus map integration

The curated names in `lib/campus-locations.ts` are landmarks shown on the
[UMass Amherst campus map](https://www.umass.edu/sites/default/files/2026-02/FY26_Campus_Map.pdf).
Each entry links to the OpenStreetMap building or landmark feature used for its
center coordinate. The existing report `location` text field stores the confirmed
canonical name through `POST /api/reports`. No geolocation or geocoding is used.
Manual locations remain text and are listed under Other locations without a pin.

`LocationPicker` in `app/components/campus-map/location-picker.tsx` takes
`value: string`, `onChange: (name: string) => void`, `label: string`, and optional
`disabled: boolean`. It is a controlled report-form input. Choosing a map pin or
building in the searchable select stages a location; Confirm location updates the
parent form. Other lets users enter a manual location. The select and text field
are keyboard accessible.

`FoundReportsMap` in `app/components/campus-map/found-reports-map.tsx` takes
`reports: readonly Report[]`, `onOpen: (report: Report) => void`, optional
`categories: readonly string[]`, `category: string`, and
`onCategoryChange: (category: string) => void`. It uses open found reports from
`GET /api/reports` passed by the page. Each recognized landmark gets one count
pin. Its report card uses the existing `ReportPhoto` signed URL flow and its View
details action calls the existing detail UI. Search finds curated landmarks;
category chips filter the reports through the parent page. The All mapped
locations list supports keyboard navigation. Other locations lists unrecognized
manual report locations without estimating coordinates.

Both components dynamically load the shared Leaflet canvas only in the browser.
The canvas uses the [standard OSM tile URL and attribution](https://operations.osmfoundation.org/policies/tiles/).
It loads tiles only while a map is visible; there is no prefetch, bulk download,
custom tile cache, or restrictive referrer policy. The map stays bounded near
UMass Amherst. Production deployments should monitor use of the community tile
server and choose an appropriate provider if traffic grows.

## Browser checks

1. At phone and desktop widths, switch Browse between List and Map. Confirm the
   map fills the available area without covering the main navigation or OSM
   attribution. Test pan, pinch/zoom buttons, and category chips.
2. With real open found reports, select a red count pin. Confirm the map centers,
   the pin highlights, and the sheet shows the signed photo, title, location,
   and View details action. For multiple reports at one landmark, switch items
   in the sheet and confirm the count. Collapse and reopen the sheet.
3. Search a campus landmark, including one with no found reports. Confirm the
   map centers there without creating a report pin. Open All mapped locations
   with a keyboard and select a report.
4. Choose Other locations and confirm manual report locations appear without a
   guessed pin and can open their report details. Test empty and filtered states.
5. Submit lost and found reports by choosing a landmark from the searchable
   select and by clicking a pin. Confirm the selection, submit, refresh, and
   verify the canonical name persists. Choose Other, enter an unlisted location,
   confirm, and verify it persists. Check guest posting restrictions.
