// app/Modules/tripbooking/FleetLocationPickerMap.tsx
//
// Small click-to-pin MapLibre map used inside the Add Location modal on
// FleetControlTowerPage. Lets the admin drop a pin for the new location's
// coordinates while seeing existing location presets (grey dots) for
// reference, so they don't duplicate a nearby preset by accident.
//
// Also includes an address search box (OpenStreetMap Nominatim -- free,
// no API key). Typing an address shows a dropdown of matches; picking one
// flies the map there and drops the pin, same as a manual click would.
// NOTE: Nominatim's public endpoint is rate-limited (~1 req/sec) and meant
// for light/occasional use -- fine for an internal admin tool, but if this
// ever needs heavy day-to-day search volume, swap in a paid geocoder
// (LocationIQ, Mapbox, Google Places) using the same searchAddress() shape.
//
// Intentionally a separate, minimal MapLibre instance rather than reusing
// FleetLiveMap -- that component is wired for vehicle polling/following and
// would need heavy prop-drilling to also do "click map to pick a point".
// Uses the same CDN-load approach as FleetLiveMap.tsx.

import React, { useEffect, useRef, useState } from "react";
import { FleetLocation } from "../../../../types";

const MAPLIBRE_CSS_URL = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const MAPLIBRE_JS_URL = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";
const SEARCH_DEBOUNCE_MS = 300;

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

type PlaceResult = {
  displayName: string;
  lat: number;
  lon: number;
};

// Photon (komoot.io) instead of Nominatim: built for autocomplete-as-you-type
// rather than exact address lookup, so it matches partial words, place
// names, and POIs the way Google Maps search does -- Nominatim by contrast
// wants something closer to a full, well-formed address to return anything.
// `lat`/`lon` bias ranking toward whatever the map is currently centered on
// (same effect as Google Maps preferring nearby results), without
// restricting results to that area the way a hard country/bbox filter would.
async function searchAddress(
  query: string,
  bias?: { lat: number; lon: number },
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: "8",
    lang: "en",
  });
  if (bias) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lon));
  }
  const res = await fetch(`${PHOTON_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Address search failed");
  const data = await res.json();

  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .map((f: any) => {
      const [lon, lat] = f?.geometry?.coordinates ?? [];
      if (typeof lat !== "number" || typeof lon !== "number") return null;
      const p = f.properties ?? {};

      // Photon splits an address into parts rather than one display string
      // like Nominatim -- assemble something readable, e.g.
      // "SM Megamall, EDSA, Mandaluyong, Metro Manila, Philippines",
      // de-duping consecutive parts that repeat the same text.
      const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ");
      const rawParts = [p.name, streetLine, p.city, p.state, p.country];
      const seen = new Set<string>();
      const displayName = rawParts
        .filter(Boolean)
        .filter((part) => {
          const key = String(part).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .join(", ");

      return { displayName: displayName || "Unnamed location", lat, lon };
    })
    .filter((r: PlaceResult | null): r is PlaceResult => r !== null);
}

// Same default center/style as FleetLiveMap's "streets" layer, kept in sync
// so the picker map looks like part of the same product.
const DEFAULT_CENTER: [number, number] = [121.0, 14.6]; // [lng, lat]
const DEFAULT_ZOOM = 10;

const STREETS_STYLE: any = {
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
};

type PickedPoint = { latitude: number; longitude: number };

type Props = {
  presets: FleetLocation[]; // existing saved locations, shown as reference dots
  value: PickedPoint | null; // the point currently picked for the new location
  onPick: (point: PickedPoint) => void;
  theme: any;
  height?: number;
};

export default function FleetLocationPickerMap({
  presets,
  value,
  onPick,
  theme,
  height = 220,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const pickMarkerRef = useRef<any>(null);
  const presetMarkersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // -- Address search state --------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set right before setSearchQuery() inside handleSelectResult, so the
  // search effect below (which also fires on searchQuery changes) knows to
  // skip that one resulting run instead of re-searching the picked name and
  // reopening the dropdown immediately after the person just closed it.
  const suppressNextSearchRef = useRef(false);

  // Keep a ref to the latest onPick so the map's one-time click listener
  // (registered before first render's onPick closure) always calls the
  // current handler rather than a stale one from mount time.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // -- Mount map once -----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: STREETS_STYLE,
          center: value ? [value.longitude, value.latitude] : DEFAULT_CENTER,
          zoom: value ? 14 : DEFAULT_ZOOM,
          attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.on("click", (e: any) => {
          onPickRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
        });

        // Default cursor is a crosshair (signals "click to pin"), and only
        // swaps to a grab/grabbing hand while the person is actually
        // holding the mouse down to pan the map -- not on every hover.
        const canvas = map.getCanvas();
        canvas.style.cursor = "crosshair";
        map.on("mousedown", () => {
          canvas.style.cursor = "grabbing";
        });
        map.on("mouseup", () => {
          canvas.style.cursor = "crosshair";
        });
        map.on("dragstart", () => {
          canvas.style.cursor = "grabbing";
        });
        map.on("dragend", () => {
          canvas.style.cursor = "crosshair";
        });
        // Touch devices don't fire mousedown/mouseup, so mirror the same
        // behavior for touch-based panning.
        map.on("touchstart", () => {
          canvas.style.cursor = "grabbing";
        });
        map.on("touchend", () => {
          canvas.style.cursor = "crosshair";
        });

        map.on("load", () => {
          if (cancelled) return;
          mapRef.current = map;
          setReady(true);
          setTimeout(() => map.resize(), 100);
        });
      })
      .catch((err) => {
        console.error("Failed to load MapLibre GL for location picker:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Mount-only -- value/onPick are read via refs/effects below so the map
    // itself is never re-created on every keystroke in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- Render preset pins (grey, reference only, not clickable) -----------
  useEffect(() => {
    if (!ready || !mapRef.current || !window.maplibregl) return;
    const maplibregl = window.maplibregl;

    presetMarkersRef.current.forEach((m) => m.remove());
    presetMarkersRef.current = [];

    presets.forEach((loc) => {
      if (loc.latitude == null || loc.longitude == null) return;
      const el = document.createElement("div");
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "50%";
      el.style.background = "#94a3b8";
      el.style.border = "2px solid #fff";
      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([loc.longitude, loc.latitude])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText(loc.name))
        .addTo(mapRef.current);
      presetMarkersRef.current.push(marker);
    });
  }, [ready, presets]);

  // -- Render/move the pick marker whenever value changes -----------------
  useEffect(() => {
    if (!ready || !mapRef.current || !window.maplibregl) return;
    const maplibregl = window.maplibregl;

    if (!value) {
      if (pickMarkerRef.current) {
        pickMarkerRef.current.remove();
        pickMarkerRef.current = null;
      }
      return;
    }

    if (pickMarkerRef.current) {
      pickMarkerRef.current.setLngLat([value.longitude, value.latitude]);
    } else {
      const el = document.createElement("div");
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.borderRadius = "50% 50% 50% 0";
      el.style.transform = "rotate(-45deg)";
      el.style.background = theme.primary ?? "#2563eb";
      el.style.border = "2px solid #fff";
      el.style.boxShadow = "0 2px 5px rgba(0,0,0,0.5)";
      pickMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([value.longitude, value.latitude])
        .addTo(mapRef.current);
    }

    // Only zoom in when a pin is first placed/moved via search or click —
    // don't fight the person's own zoom level if they're just nudging an
    // existing pin they've already zoomed in on manually.
    const currentZoom = mapRef.current.getZoom?.() ?? 0;
    mapRef.current.easeTo({
      center: [value.longitude, value.latitude],
      zoom: currentZoom < 16 ? 17 : currentZoom,
      duration: 500,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, value?.latitude, value?.longitude]);

  // -- Debounced address search --------------------------------------------
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      setSearching(false);
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }

    setSearching(true);
    setSearchError("");
    debounceRef.current = setTimeout(async () => {
      try {
        const center = mapRef.current?.getCenter?.();
        const bias = center ? { lat: center.lat, lon: center.lng } : undefined;
        const results = await searchAddress(query, bias);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        console.error("Address search failed:", err);
        setSearchError("Search failed -- try again.");
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  function handleSelectResult(result: PlaceResult) {
    onPickRef.current({ latitude: result.lat, longitude: result.lon });
    if (mapRef.current) {
      // Zoom in tight and noticeably (18 = building-level) regardless of
      // the map's current zoom, so the person can actually see the pin
      // land on the right building/street rather than a blurry area view.
      mapRef.current.flyTo({
        center: [result.lon, result.lat],
        zoom: 18,
        duration: 900,
        essential: true,
      });
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    suppressNextSearchRef.current = true;
    setSearchResults([]);
    setShowDropdown(false);
    setSearchQuery(result.displayName);
  }

  return (
    <div
      style={{ borderColor: theme.border }}
      className="rounded-lg border overflow-hidden relative"
    >
      {/* Address search bar */}
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="relative border-b p-2"
      >
        <div className="relative">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.subtext}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length > 0) {
                handleSelectResult(searchResults[0]);
              }
              if (e.key === "Escape") setShowDropdown(false);
            }}
            placeholder="Search an address..."
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
              color: theme.text,
            }}
            className="w-full text-[12.5px] pl-7 pr-2 py-1.5 border rounded-md"
          />
        </div>

        {showDropdown && (searching || searchResults.length > 0 || searchError) && (
          <div
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
            }}
            className="absolute left-2 right-2 top-full mt-1 rounded-md border shadow-lg z-20 max-h-[180px] overflow-y-auto"
          >
            {searching && (
              <p style={{ color: theme.subtext }} className="text-[11px] px-3 py-2">
                Searching...
              </p>
            )}
            {!searching && searchError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] px-3 py-2">
                {searchError}
              </p>
            )}
            {!searching &&
              !searchError &&
              searchResults.map((r, idx) => (
                <button
                  key={`${r.lat}-${r.lon}-${idx}`}
                  onClick={() => handleSelectResult(r)}
                  style={{ color: theme.text, borderColor: theme.border }}
                  className={`w-full text-left text-[11.5px] px-3 py-2 hover:opacity-70 ${
                    idx !== searchResults.length - 1 ? "border-b" : ""
                  }`}
                >
                  {r.displayName}
                </button>
              ))}
            {!searching && !searchError && searchResults.length === 0 && (
              <p style={{ color: theme.subtext }} className="text-[11px] px-3 py-2">
                No matches found.
              </p>
            )}
          </div>
        )}
      </div>

      {loadError ? (
        <div className="p-3">
          <p className="text-xs" style={{ color: theme.subtext }}>
            Map failed to load -- check that this device has internet access
            to unpkg.com.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={containerRef}
            style={{ height, width: "100%", backgroundColor: "#2A2E33" }}
            onClick={() => setShowDropdown(false)}
          />
          {!value && (
            <div
              style={{
                position: "absolute",
                left: 8,
                bottom: 8,
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.subtext,
                pointerEvents: "none",
              }}
              className="rounded-md border px-2 py-1 text-[10.5px] font-medium shadow"
            >
              Tap the map or search above to set this location's pin
            </div>
          )}
        </div>
      )}
    </div>
  );
}