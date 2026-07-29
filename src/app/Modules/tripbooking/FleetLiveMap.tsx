// app/Modules/tripbooking/FleetLiveMap.tsx
//
// Live vehicle map for Fleet Control Tower. Renders GPS positions on a
// MapLibre GL JS map (raster tiles, no API key required). Loaded via CDN
// at runtime rather than an npm package — this page is web-only (plain
// div/HTML, not React Native View/Text), so a CDN script avoids needing
// Metro to process MapLibre's CSS import for no real benefit.
//
// NOTE: switched from Leaflet to MapLibre GL JS. Each "layer" (streets/
// satellite/terrain) is a full raster style object pointed at a different
// free tile provider — same three providers as before (CartoDB dark,
// Esri World Imagery, OpenTopoMap), just re-expressed as MapLibre raster
// sources instead of Leaflet tileLayers. Switching layers calls
// map.setStyle(...) with a new style object, then re-adds markers since
// setStyle wipes any layers/sources that aren't part of the new style.
//
// Polls getFleetLiveLocations() from fleetOps.ts on its own interval.

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { getFleetLiveLocations } from "../../../services/fleetOps";
import { FleetLiveLocation, FleetVehicle } from "../../../../types";

const MAPLIBRE_CSS_URL = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const MAPLIBRE_JS_URL = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
const POLL_INTERVAL_MS = 10_000;

declare global {
  interface Window {
    maplibregl: any;
  }
}

function loadMapLibre(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) {
      resolve(window.maplibregl);
      return;
    }
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS_URL;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${MAPLIBRE_JS_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.maplibregl));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS_URL;
    script.async = true;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Default center near Metro Manila — only used until real vehicle data arrives.
const DEFAULT_CENTER: [number, number] = [121.0, 14.6]; // MapLibre uses [lng, lat]
const DEFAULT_ZOOM = 10;

type LayerKey = "streets" | "satellite" | "terrain";

// Full raster-only style objects — one per base layer. Kept minimal (just a
// single raster source + layer) since we don't need vector features, only a
// base map underneath our own markers.
const RASTER_STYLES: Record<LayerKey, any> = {
  streets: {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        ],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      },
    },
    layers: [{ id: "raster-layer", type: "raster", source: "raster-tiles" }],
  },
  satellite: {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles &copy; Esri",
      },
    },
    layers: [{ id: "raster-layer", type: "raster", source: "raster-tiles" }],
  },
  terrain: {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors, SRTM &copy; OpenTopoMap",
      },
    },
    layers: [{ id: "raster-layer", type: "raster", source: "raster-tiles" }],
  },
};

type Props = {
  focusVehicle?: { id: string; token: number } | null;
  vehicles?: FleetVehicle[];
  theme: any;
};

// Display status + color mirror VEHICLE_STATUS_CONFIG / getVehicleDisplayStatus
// in FleetControlTowerPage.tsx exactly — same labels, same idle-vehicle split
// into "Parked" (pinged recently) vs "Inactive" (stale or never pinged) — so
// a vehicle's marker color and the legend below always match its badge
// color in the Vehicles list.
type DisplayStatusKey =
  | "active"
  | "parked"
  | "inactive"
  | "maintenance"
  | "personal"
  | "off_duty";

// Marker colors need an entry for every VehicleStatus value (including
// personal/off_duty), so this stays the full map — VISIBLE_LEGEND_KEYS
// below controls which of these actually show up in the on-map legend.
const LEGEND_CONFIG: Record<DisplayStatusKey, { label: string; color: string }> = {
  active: { label: "Active", color: "#22c55e" },
  parked: { label: "Parked", color: "#3b82f6" },
  inactive: { label: "Inactive", color: "#64748b" },
  maintenance: { label: "Maintenance", color: "#ef4444" },
  personal: { label: "Personal Use", color: "#f59e0b" },
  off_duty: { label: "Off Duty", color: "#94a3b8" },
};

// Dispatch cares about these four on the map — personal/off_duty are
// driver-set states, not something worth tracking live here.
const VISIBLE_LEGEND_KEYS: DisplayStatusKey[] = ["active", "parked", "inactive", "maintenance"];

const MARKER_PARKED_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes, same threshold as control tower

function getVehicleDisplayStatusKey(vehicle: FleetVehicle): DisplayStatusKey {
  if (vehicle.status !== "idle") return vehicle.status as DisplayStatusKey;
  if (!vehicle.lastPingAt) return "inactive";
  const age = Date.now() - new Date(vehicle.lastPingAt).getTime();
  if (isNaN(age) || age > MARKER_PARKED_STALE_THRESHOLD_MS) return "inactive";
  return "parked";
}

function getMarkerColor(vehicle?: FleetVehicle): string {
  if (!vehicle) return "#12181F"; // no matching vehicle record — fallback dark pin
  return LEGEND_CONFIG[getVehicleDisplayStatusKey(vehicle)].color;
}

export default function FleetLiveMap({ focusVehicle, vehicles = [], theme }: Props) {  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const hasFitBoundsRef = useRef(false);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("streets");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
   const [locations, setLocations] = useState<FleetLiveLocation[]>([]);
  const [pollFailed, setPollFailed] = useState(false);
  // Vehicle the camera is actively tracking. Distinct from the one-shot
  // focusVehicle flyTo below — this persists across polls so the map keeps
  // recentering on the vehicle as new location data comes in, until the
  // admin manually drags the map (which cancels following) or picks
  // another vehicle / clicks "Stop following".
  const [followedVehicleId, setFollowedVehicleId] = useState<string | null>(null);

  // Counts for the status legend below the header — tallies the WHOLE
  // fleet (not just vehicles currently reporting a live position), so a
  // vehicle with no GPS device still shows up under "Inactive" rather than
  // silently vanishing from the count.
  const statusCounts = useMemo(() => {
    const counts: Record<DisplayStatusKey, number> = {
      active: 0,
      parked: 0,
      inactive: 0,
      maintenance: 0,
      personal: 0,
      off_duty: 0,
    };
    vehicles.forEach((v) => {
      counts[getVehicleDisplayStatusKey(v)] += 1;
    });
    return counts;
  }, [vehicles]);

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        console.log("MapLibre: container size", containerRef.current.offsetWidth, containerRef.current.offsetHeight);
         const map = new maplibregl.Map({
          container: containerRef.current,
          style: RASTER_STYLES.streets,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.on("load", () => {
          if (cancelled) return;
          mapRef.current = map;
          setReady(true);
          setTimeout(() => map.resize(), 100);
        });
      })
      .catch((err) => {
        console.error("Failed to load MapLibre GL:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

function switchLayer(key: LayerKey) {
    const map = mapRef.current;
    if (!map || key === activeLayer) return;
    // setStyle replaces the whole style, which drops our markers' underlying
    // map reference isn't affected (markers are DOM overlays, not style
    // layers) — but we re-render markers below just to be safe on relayout.
    map.setStyle(RASTER_STYLES[key]);
    setActiveLayer(key);
  }

  // Manual "zoom out to fit everyone" — separate from the one-time auto-fit
  // on initial load, so the admin can recenter after panning/zooming into
  // a single vehicle without needing to refresh the page.
  function fitAllVehicles() {
    const map = mapRef.current;
    if (!map || !window.maplibregl || locations.length === 0) return;
    const maplibregl = window.maplibregl;
    const bounds = new maplibregl.LngLatBounds();
    locations.forEach((l) => bounds.extend([l.longitude, l.latitude]));
    map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 });
  }

  const loadLocations = useCallback(async () => {
    try {
      const data = await getFleetLiveLocations();
      setLocations(data);
      setPollFailed(false);
    } catch (err) {
      console.error("Failed to load live locations:", err);
      setPollFailed(true);
    }
  }, []);

  useEffect(() => {
    loadLocations();
    const id = setInterval(loadLocations, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadLocations]);

  // Pan/zoom to a specific vehicle when the person clicks it elsewhere on
  // the page (e.g. the Vehicles list). Runs after markers exist, since it
  // needs the marker to already be on the map to open its popup.
  useEffect(() => {
    if (!focusVehicle || !ready || !mapRef.current) return;
    const marker = markersRef.current[focusVehicle.id];
    if (!marker) return; // vehicle has no live report right now — nothing to pan to
    mapRef.current.flyTo({ center: marker.getLngLat(), zoom: 16, duration: 600 });
    marker.togglePopup();
    setFollowedVehicleId(focusVehicle.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVehicle?.token, ready]);

  // Stop following if the admin manually drags the map — otherwise the next
  // poll would yank the camera back to the vehicle mid-pan, fighting them.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const onDragStart = () => setFollowedVehicleId(null);
    map.on("dragstart", onDragStart);
    return () => {
      map.off("dragstart", onDragStart);
    };
  }, [ready]);

  // Sync markers whenever fresh location data comes in.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.maplibregl) return;
    const maplibregl = window.maplibregl;
    const map = mapRef.current;
    const seenIds = new Set<string>();

    const CAR_ICON_SVG = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 17h14M5 17a2 2 0 1 0 4 0M5 17a2 2 0 1 1 4 0m6 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0M3 17V9l2-5h10l4 5v8" />
      </svg>
    `;

     const vehiclesById: Record<string, FleetVehicle> = {};
    vehicles.forEach((v) => {
      vehiclesById[v.id] = v;
    });

    locations.forEach((loc) => {
      seenIds.add(loc.vehicleId);
      const vehicleName = (loc as any).vehicleModel ?? (loc as any).model ?? null;
      const labelHtml = vehicleName
        ? `${vehicleName}<br/>${loc.plateNumber}`
        : loc.plateNumber;
      const labelText = vehicleName
        ? `${vehicleName} - ${loc.plateNumber}`
        : loc.plateNumber;
      const pinColor = getMarkerColor(vehiclesById[loc.vehicleId]);      const popupHtml = `
        <div style="font-family: sans-serif; font-size: 12.5px;">
          <strong>${labelText}</strong><br/>
          Speed: ${loc.speed != null ? loc.speed.toFixed(0) + " km/h" : "—"}<br/>
          Last report: ${loc.reportedAt}
        </div>
      `;
      const existing = markersRef.current[loc.vehicleId];
      if (existing) {
        existing.setLngLat([loc.longitude, loc.latitude]);
        existing.getPopup()?.setHTML(popupHtml);
        const el = existing.getElement();
        const labelEl = el.querySelector(".fleet-marker-label");
        if (labelEl) labelEl.innerHTML = labelHtml;
        const pinEl = el.querySelector(".fleet-marker-pin") as HTMLElement | null;
        if (pinEl) pinEl.style.backgroundColor = pinColor;
      } else {
        const popup = new maplibregl.Popup({ offset: 28 }).setHTML(popupHtml);

        const el = document.createElement("div");
        el.className = "fleet-marker";
        el.innerHTML = `
          <div class="fleet-marker-label">${labelHtml}</div>
          <div class="fleet-marker-pin" style="background-color: ${pinColor};">${CAR_ICON_SVG}</div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([loc.longitude, loc.latitude])
          .setPopup(popup)
          .addTo(map);
        markersRef.current[loc.vehicleId] = marker;
      }
    });

    // Drop markers for vehicles no longer reporting.
    Object.keys(markersRef.current).forEach((id) => {
      if (!seenIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

     // Auto-fit to all vehicles once, so the admin's own pan/zoom afterward
    // isn't overridden on every 10s poll.
    if (locations.length > 0 && !hasFitBoundsRef.current) {
      const bounds = new maplibregl.LngLatBounds();
      locations.forEach((l) => bounds.extend([l.longitude, l.latitude]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      hasFitBoundsRef.current = true;
    }

    // Keep the camera locked on the followed vehicle as fresh polls come in.
    // easeTo (not flyTo) so it's a smooth nudge rather than a re-zoom each
    // time — only the center moves, whatever zoom the admin is currently at
    // is preserved.
    if (followedVehicleId) {
      const followedLoc = locations.find((l) => l.vehicleId === followedVehicleId);
      if (followedLoc) {
        map.easeTo({
          center: [followedLoc.longitude, followedLoc.latitude],
          duration: 800,
        });
      }
    }
  }, [locations, ready, followedVehicleId]);

  const SURFACE = theme.surface;
  const BORDER = theme.border;
  const TEXT = theme.text;
  const SUBTEXT = theme.subtext;
  const PRIMARY = theme.primary;
  const PRIMARY_TEXT = theme.primaryText;

  return (
    <div
      style={{ backgroundColor: SURFACE, borderColor: BORDER }}
      className="rounded-xl border flex flex-col"
    >
   <style>{`
        .maplibregl-ctrl-top-right {
          display: flex !important;
          flex-direction: column;
          z-index: 0;
        }
        .maplibregl-ctrl-group {
          display: flex !important;
          flex-direction: column;
          background: #fff;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .maplibregl-ctrl-group button {
          width: 29px;
          height: 29px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-bottom: 1px solid #ddd;
          background: #fff;
          padding: 0;
        }
        .maplibregl-ctrl-group button:last-child {
          border-bottom: none;
        }
        .maplibregl-ctrl-group button:hover {
          background: #f2f2f2;
        }
        .fleet-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        }
        .fleet-marker-label {
          position: relative;
          background: #ffffff;
          color: #1f2937;
          font-family: sans-serif;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
          padding: 4px 8px;
          border-radius: 6px;
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          margin-bottom: 5px;
        }
        .fleet-marker-label::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -5px;
          transform: translateX(-50%);
          border-width: 5px 5px 0 5px;
          border-style: solid;
          border-color: #ffffff transparent transparent transparent;
        }
        .fleet-marker-pin {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          border: 2px solid #fff;
        }
      `}</style>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h2 style={{ color: TEXT }} className="text-sm font-semibold">
            Live Fleet Map
          </h2>
          <p style={{ color: SUBTEXT }} className="text-[11px] mt-0.5">
            {locations.length} vehicle{locations.length !== 1 ? "s" : ""} reporting
          </p>
        </div>
        {pollFailed && (
          <span className="text-[11px] font-semibold" style={{ color: "#dc2626" }}>
            Live updates unavailable
          </span>
        )}
      </div>
      <div className="flex flex-nowrap items-center gap-3 px-4 pb-3 -mt-1">
        {VISIBLE_LEGEND_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-1.5 flex-shrink-0">
            <span
              style={{ backgroundColor: LEGEND_CONFIG[key].color, width: 7, height: 7 }}
              className="inline-block rounded-full flex-shrink-0"
            />
            <span style={{ color: SUBTEXT }} className="text-[11px] font-medium whitespace-nowrap">
              {LEGEND_CONFIG[key].label}
            </span>
            <span style={{ color: TEXT }} className="text-[11px] font-semibold">
              {statusCounts[key]}
            </span>
          </div>
        ))}
      </div>
      {loadError ? (
        <div className="px-4 pb-4">
          <p className="text-xs" style={{ color: SUBTEXT }}>
            Map failed to load — check that this device has internet access
            to unpkg.com.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={containerRef}
            style={{ height: 370, width: "100%", backgroundColor: "#2A2E33" }}
            className="rounded-b-xl overflow-hidden"
          />
          {ready && followedVehicleId && (
            <div
              style={{
                position: "absolute",
                left: 10,
                top: locations.length > 0 ? 46 : 10,
                zIndex: 10,
                backgroundColor: PRIMARY,
                color: PRIMARY_TEXT,
              }}
              className="rounded-lg shadow-lg flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4" />
              </svg>
              Following {locations.find((l) => l.vehicleId === followedVehicleId)?.plateNumber ?? "vehicle"}
              <button
                onClick={() => setFollowedVehicleId(null)}
                style={{ color: PRIMARY_TEXT }}
                className="ml-1 leading-none"
                aria-label="Stop following"
              >
                ✕
              </button>
            </div>
          )}
          {ready && locations.length > 0 && (
            <button
              onClick={fitAllVehicles}
              style={{
                position: "absolute",
                left: 10,
                top: 10,
                zIndex: 10,
                backgroundColor: SURFACE,
                borderColor: BORDER,
                color: TEXT,
              }}
              className="rounded-lg border shadow-lg flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold"
              title="Zoom out to see all vehicles"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Fit all
            </button>
          )}
          {ready && (
            <div
              style={{
                position: "absolute",
                left: 10,
                bottom: 20,
                zIndex: 10,
                backgroundColor: SURFACE,
                borderColor: BORDER,
              }}
              className="rounded-lg border shadow-lg flex overflow-hidden"
            >
              {(["streets", "satellite", "terrain"] as const).map((key) => {
                const active = activeLayer === key;
                const labels = { streets: "Streets", satellite: "Satellite", terrain: "Terrain" };
                return (
                  <button
                    key={key}
                    onClick={() => switchLayer(key)}
                    style={{
                      backgroundColor: active ? PRIMARY : "transparent",
                      color: active ? PRIMARY_TEXT : SUBTEXT,
                    }}
                    className="text-[11px] font-semibold px-2.5 py-1.5 whitespace-nowrap"
                  >
                    {labels[key]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}