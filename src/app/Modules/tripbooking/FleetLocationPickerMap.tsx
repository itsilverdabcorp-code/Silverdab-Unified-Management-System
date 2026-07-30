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
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const SEARCH_DEBOUNCE_MS = 450;

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

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

// Biased (not restricted) toward the Philippines via countrycodes -- remove
// this param if this admin tool ever needs to search addresses elsewhere.
async function searchAddress(query: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    format: "json",
    q: query,
    limit: "6",
    addressdetails: "0",
    countrycodes: "ph",
  });
  const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Address search failed");
  return res.json();
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
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    mapRef.current.easeTo({ center: [value.longitude, value.latitude], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, value?.latitude, value?.longitude]);

  // -- Debounced address search --------------------------------------------
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

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
        const results = await searchAddress(query);
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

  function handleSelectResult(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    if (isNaN(lat) || isNaN(lon)) return;

    onPickRef.current({ latitude: lat, longitude: lon });
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lon, lat], zoom: 16, duration: 700 });
    }
    setSearchQuery(result.display_name);
    setShowDropdown(false);
    setSearchResults([]);
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
                  {r.display_name}
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