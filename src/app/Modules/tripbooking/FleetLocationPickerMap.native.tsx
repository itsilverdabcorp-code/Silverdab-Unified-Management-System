// app/Modules/tripbooking/FleetLocationPickerMap.native.tsx
//
// Native counterpart to FleetLocationPickerMap.tsx (web/MapLibre version).
// Uses @maplibre/maplibre-react-native v11 (new-architecture-only release,
// API aligned with maplibre-gl-js) instead of react-native-maps, so no
// Google Maps API key or Play Services Maps SDK is needed on Android.
// Renders the SAME plain OSM raster style (STREETS_STYLE) as the web
// file — no PMTiles, no vector style, no sprite/glyph resolution needed,
// since it's a single raster layer with already-absolute tile URLs.
//
// Key v11 API renames vs. the older MapLibre RN API (and vs. what a web
// search might turn up for older docs):
//   MapView -> Map, PointAnnotation -> ViewAnnotation
//   coordinate/centerCoordinate -> lngLat/center, zoomLevel -> zoom
//   setCamera() -> setStop(), defaultSettings -> initialViewState
//   onPress payload moved into event.nativeEvent
//
// searchAddress() / reverseGeocode() are unchanged from the original file
// (plain fetch() calls to Photon, no map-library dependency).

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import {
  Map as MapLibreMap,
  Camera as MapLibreCamera,
  ViewAnnotation as MapLibreViewAnnotation,
  UserLocation as MapLibreUserLocation,
} from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { Search, LocateFixed, X } from "lucide-react-native";
import { FleetLocation } from "../../../../types";

const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";
const SEARCH_DEBOUNCE_MS = 300;

// Same raster style as the web version (FleetLocationPickerMap.tsx) —
// plain OpenStreetMap public tile servers, no API key, no vector
// style/sprite/glyph resolution needed since it's a single raster layer
// with already-absolute tile URLs. Kept in sync manually with the web
// file's STREETS_STYLE constant; if that ever changes, mirror it here too.
const STREETS_STYLE: any = {
  version: 8,
  sources: {
    "raster-tiles": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19, // OSM's public tile servers top out at z19
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "raster-layer", type: "raster", source: "raster-tiles" }],
};

export type PlaceResult = {
  displayName: string;
  lat: number;
  lon: number;
};

export async function searchAddress(
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

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat), lang: "en" });
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const f = Array.isArray(data?.features) ? data.features[0] : null;
    if (!f) return null;
    const p = f.properties ?? {};
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
    return displayName || null;
  } catch (err) {
    console.error("Reverse geocode failed:", err);
    return null;
  }
}

const DEFAULT_CENTER: [number, number] = [121.0, 14.6]; // [lon, lat]
const DEFAULT_ZOOM = 9;

type PickedPoint = { latitude: number; longitude: number; address?: string };

type Props = {
  presets: FleetLocation[];
  value: PickedPoint | null;
  onPick: (point: PickedPoint) => void;
  theme: any;
  height?: number;
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  allStops?: { key: string; label: string; point: PickedPoint | null }[];
  activeKey?: string;
  hideSearch?: boolean;
};

export default function FleetLocationPickerMap({
  presets,
  value,
  onPick,
  theme,
  height = 220,
  searchValue,
  onSearchChange,
  allStops,
  activeKey,
  hideSearch = false,
}: Props) {
  // Using `any` for the ref type since the exported ref type name for
  // Camera isn't confirmed here — swap in the real `CameraRef` type from
  // the package if you want stricter typing.
  const cameraRef = useRef<any>(null);

  const [showUserDot, setShowUserDot] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  async function handleLocateMe() {
    setLocating(true);
    setLocateError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocateError("Location access was denied.");
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setShowUserDot(true);
      lastCenterRef.current = { lat: point.latitude, lon: point.longitude };
      cameraRef.current?.setStop({
        center: [point.longitude, point.latitude],
        zoom: 15,
        duration: 800,
      });
    } catch (err) {
      console.error("Geolocation failed:", err);
      setLocateError("Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  const clickRequestIdRef = useRef(0);
  // Used only to bias address search toward the last known point of
  // interest. Updated on pick/select/locate rather than on every map
  // region change, since the v11 region-change event payload shape
  // isn't confirmed here.
  const lastCenterRef = useRef<{ lat: number; lon: number }>({ lat: DEFAULT_CENTER[1], lon: DEFAULT_CENTER[0] });

  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Fit to every stop (or the single value pin) whenever the set of
  // points changes, mirroring the web version's fitBounds/easeTo logic.
  const stopsSignature = (allStops ?? [])
    .map((s) => `${s.key}:${s.point ? `${s.point.latitude.toFixed(6)},${s.point.longitude.toFixed(6)}` : ""}`)
    .join("|");

  useEffect(() => {
    if (!cameraRef.current) return;
    if (allStops) {
      const validStops = allStops.filter((s) => s.point);
      if (validStops.length === 0) return;
      if (validStops.length === 1) {
        const only = validStops[0].point!;
        cameraRef.current.setStop({
          center: [only.longitude, only.latitude],
          zoom: 15,
          duration: 500,
        });
      } else {
        const lats = validStops.map((s) => s.point!.latitude);
        const lons = validStops.map((s) => s.point!.longitude);
        // v11 bounds format: [west, south, east, north]
        const bounds: [number, number, number, number] = [
          Math.min(...lons),
          Math.min(...lats),
          Math.max(...lons),
          Math.max(...lats),
        ];
        cameraRef.current.setStop({
          bounds,
          padding: { top: 60, right: 60, bottom: 60, left: 60 },
          duration: 500,
        });
      }
    } else if (value) {
      cameraRef.current.setStop({
        center: [value.longitude, value.latitude],
        zoom: 16,
        duration: 500,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsSignature, value?.latitude, value?.longitude, allStops]);

  function handleMapPress(event: any) {
    // v11: payload lives in event.nativeEvent, coordinate field is lngLat.
    const lngLat = event?.nativeEvent?.lngLat;
    if (!Array.isArray(lngLat)) return;
    const [longitude, latitude] = lngLat;
    if (typeof latitude !== "number" || typeof longitude !== "number") return;

    lastCenterRef.current = { lat: latitude, lon: longitude };
    const requestId = ++clickRequestIdRef.current;
    onPickRef.current({ latitude, longitude });
    reverseGeocode(latitude, longitude).then((address) => {
      if (!address || clickRequestIdRef.current !== requestId) return;
      onPickRef.current({ latitude, longitude, address });
    });
  }

  const validStops = (allStops ?? []).filter((s) => s.point);

  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }}>
      <View style={{ height, width: "100%" }}>
        <MapLibreMap
          style={{ flex: 1 }}
          mapStyle={STREETS_STYLE}
          onPress={handleMapPress}
        >
          <MapLibreCamera
            ref={cameraRef}
            initialViewState={{
              center: value ? [value.longitude, value.latitude] : DEFAULT_CENTER,
              zoom: value ? 15 : DEFAULT_ZOOM,
            }}
          />

          {showUserDot && <MapLibreUserLocation accuracy />}

          {presets.map((loc) =>
            loc.latitude != null && loc.longitude != null ? (
              <MapLibreViewAnnotation
                key={String(loc.id)}
                id={`preset-${loc.id}`}
                lngLat={[loc.longitude, loc.latitude]}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "#94a3b8",
                    opacity: 0.7,
                    borderWidth: 1.5,
                    borderColor: "#fff",
                  }}
                />
              </MapLibreViewAnnotation>
            ) : null,
          )}

          {allStops
            ? validStops.map((stop, i) => {
                const isPickup = stop.key === "pickup";
                const label = isPickup ? "P" : String(i);
                const isActive = stop.key === activeKey;
                return (
                  <MapLibreViewAnnotation
                    key={stop.key}
                    id={`stop-${stop.key}`}
                    lngLat={[stop.point!.longitude, stop.point!.latitude]}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: isPickup ? "#22c55e" : "#ef4444",
                        borderWidth: isActive ? 3 : 2,
                        borderColor: isActive ? (theme.primary ?? "#2563eb") : "#fff",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{label}</Text>
                    </View>
                  </MapLibreViewAnnotation>
                );
              })
            : value && (
                <MapLibreViewAnnotation id="picked-value" lngLat={[value.longitude, value.latitude]}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: theme.primary ?? "#2563eb",
                      borderWidth: 2,
                      borderColor: "#fff",
                    }}
                  />
                </MapLibreViewAnnotation>
              )}
        </MapLibreMap>

        {!value && !allStops?.some((s) => s.point) && (
          <View
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
            pointerEvents="none"
          >
            <Text style={{ fontSize: 10.5, fontWeight: "500", color: theme.subtext, fontFamily: "Outfit" }}>
              Tap the map or search above to set this location's pin
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleLocateMe}
          disabled={locating}
          accessibilityLabel="Show my location"
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: locating ? 0.6 : 1,
          }}
        >
          {locating ? (
            <ActivityIndicator size="small" color={theme.subtext} />
          ) : (
            <LocateFixed size={16} color={theme.primary ?? "#4285F4"} />
          )}
        </TouchableOpacity>

        {locateError ? (
          <View
            style={{
              position: "absolute",
              right: 8,
              bottom: 46,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
              maxWidth: 180,
            }}
          >
            <Text style={{ fontSize: 10.5, fontWeight: "500", color: "#dc2626", fontFamily: "Outfit" }}>
              {locateError}
            </Text>
          </View>
        ) : null}

        {allStops && validStops.length > 0 && (
          <View
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              maxWidth: 170,
            }}
          >
            {validStops.map((s, idx) => {
              const isPickup = s.key === "pickup";
              const isActive = s.key === activeKey;
              return (
                <View
                  key={s.key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: idx === validStops.length - 1 ? 0 : 4,
                  }}
                >
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: isPickup ? "#22c55e" : "#ef4444",
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 10.5,
                      color: isActive ? theme.text : theme.subtext,
                      fontWeight: isActive ? "600" : "400",
                      fontFamily: "Outfit",
                      flexShrink: 1,
                    }}
                    numberOfLines={1}
                  >
                    {s.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}