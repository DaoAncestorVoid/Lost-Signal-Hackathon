"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import type { Report } from "@/lib/frontend-api";
import { CAMPUS_LOCATIONS, type CampusLocation } from "@/lib/campus-locations";
import styles from "./campus-map.module.css";

const bounds: [[number, number], [number, number]] = [[42.379, -72.538], [42.398, -72.518]];
const initialBounds: [[number, number], [number, number]] = [[42.3815, -72.534], [42.3945, -72.5245]];
const tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function FocusLocation({ location }: { location: CampusLocation | null }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [location, map]);
  return null;
}

function CampusBase({ children, location, picker = false }: { children: React.ReactNode; location: CampusLocation | null; picker?: boolean }) {
  return <MapContainer bounds={initialBounds} boundsOptions={{ padding: [20, 20] }} minZoom={13} maxZoom={18} maxBounds={bounds}
    maxBoundsViscosity={1} scrollWheelZoom={false} zoomControl={false} className={picker ? styles.pickerMap : styles.browseMap}>
    <TileLayer url={tileUrl} attribution={attribution} />
    <ZoomControl position="topright" />
    <FocusLocation location={location} />
    {children}
  </MapContainer>;
}

function pin(count: number, selected: boolean, picker = false) {
  return divIcon({
    className: "",
    html: `<span class="${picker ? styles.pickerPin : styles.reportPin}${selected ? ` ${styles.pinSelected}` : ""}"><span class="${styles.pinLabel}">${picker ? "●" : count}</span></span>`,
    iconSize: picker ? [34, 42] : [42, 50], iconAnchor: picker ? [17, 38] : [21, 46],
  });
}

export function LocationPickerCanvas({ selectedId, onSelect, disabled = false }: {
  selectedId: string | null; onSelect: (name: string) => void; disabled?: boolean;
}) {
  const selected = CAMPUS_LOCATIONS.find(location => location.id === selectedId) ?? null;
  return <CampusBase picker location={selected}>{CAMPUS_LOCATIONS.map(location => <Marker key={location.id}
    position={[location.latitude, location.longitude]} icon={pin(1, selectedId === location.id, true)}
    keyboard={!disabled} eventHandlers={{ click: () => { if (!disabled) onSelect(location.name); } }}>
    <Tooltip>{location.name}</Tooltip>
  </Marker>)}</CampusBase>;
}

export function FoundReportsCanvas({ groups, selectedId, focusId, onSelect }: {
  groups: Array<{ location: CampusLocation; reports: Report[] }>;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (id: string) => void;
}) {
  const focus = CAMPUS_LOCATIONS.find(location => location.id === focusId) ?? null;
  return <CampusBase location={focus}>{groups.map(({ location, reports }) => <Marker key={location.id}
    position={[location.latitude, location.longitude]} icon={pin(reports.length, selectedId === location.id)}
    eventHandlers={{ click: () => onSelect(location.id) }}>
    <Tooltip>{location.name} · {reports.length} found item{reports.length === 1 ? "" : "s"}</Tooltip>
  </Marker>)}</CampusBase>;
}
