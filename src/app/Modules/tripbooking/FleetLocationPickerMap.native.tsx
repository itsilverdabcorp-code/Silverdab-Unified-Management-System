// app/Modules/tripbooking/FleetLocationPickerMap.native.tsx
//
// Native counterpart to FleetLocationPickerMap.tsx (web/MapLibre version).
// Same props, same behavior (search, reverse-geocode on pin drop, preset
// dots, multi-stop pins with a legend, locate-me), reimplemented on
// react-native-maps + expo-location since MapLibre-in-a-div and browser
// geolocation don't exist on native. Expo resolves this file automatically
// for iOS/Android builds because of the .native.tsx suffix — the web file
// keeps its plain .tsx name and is used for web builds instead. Callers
// (e.g. TripBookingModal.tsx) import "../../tripbooking/FleetLocationPickerMap"
// and never need to know which of the two loaded.
//
// searchAddress() / reverseGeocode() are plain fetch() calls to Photon with
// no DOM dependency, so they're duplicated here unchanged from the web
// file rather than shared, to avoid introducing a new shared module.

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import { Search, LocateFixed, X } from "lucide-react-native";
import { FleetLocation } from "../../../../types";

const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";
const SEARCH_DEBOUNCE_MS = 300;

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

const DEFAULT_REGION: Region = {
  latitude: 14.6,
  longitude: 121.0,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

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
  const mapRef = useRef<MapView | null>(null);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
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
      setUserLocation(point);
      mapRef.current?.animateToRegion(
        { ...point, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        800,
      );
    } catch (err) {
      console.error("Geolocation failed:", err);
      setLocateError("Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  const [searchQuery, setSearchQuery] = useState(searchValue ?? "");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickRequestIdRef = useRef(0);
  const suppressNextSearchRef = useRef(false);
  const lastRegionRef = useRef<Region>(DEFAULT_REGION);

  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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
        const bias = { lat: lastRegionRef.current.latitude, lon: lastRegionRef.current.longitude };
        const results = await searchAddress(query, bias);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        console.error("Address search failed:", err);
        setSearchError("Search failed — try again.");
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (searchValue !== undefined && searchValue !== searchQuery) {
      suppressNextSearchRef.current = true;
      setSearchQuery(searchValue);
      setShowDropdown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // Fit to every stop (or the single value pin) whenever the set of
  // points changes, mirroring the web version's fitBounds/easeTo logic.
  const stopsSignature = (allStops ?? [])
    .map((s) => `${s.key}:${s.point ? `${s.point.latitude.toFixed(6)},${s.point.longitude.toFixed(6)}` : ""}`)
    .join("|");

  useEffect(() => {
    if (!mapRef.current) return;
    if (allStops) {
      const validStops = allStops.filter((s) => s.point);
      if (validStops.length === 0) return;
      if (validStops.length === 1) {
        const only = validStops[0].point!;
        mapRef.current.animateToRegion(
          { latitude: only.latitude, longitude: only.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          500,
        );
      } else {
        mapRef.current.fitToCoordinates(
          validStops.map((s) => ({ latitude: s.point!.latitude, longitude: s.point!.longitude })),
          { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
        );
      }
    } else if (value) {
      mapRef.current.animateToRegion(
        { latitude: value.latitude, longitude: value.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 },
        500,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsSignature, value?.latitude, value?.longitude, allStops]);

  function handleMapPress(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const requestId = ++clickRequestIdRef.current;
    onPickRef.current({ latitude, longitude });
    reverseGeocode(latitude, longitude).then((address) => {
      if (!address || clickRequestIdRef.current !== requestId) return;
      onPickRef.current({ latitude, longitude, address });
    });
  }

  function handleSelectResult(result: PlaceResult) {
    onPickRef.current({ latitude: result.lat, longitude: result.lon, address: result.displayName });
    mapRef.current?.animateToRegion(
      { latitude: result.lat, longitude: result.lon, latitudeDelta: 0.004, longitudeDelta: 0.004 },
      700,
    );
    if (debounceRef.current) clearTimeout(debounceRef.current);
    suppressNextSearchRef.current = true;
    setSearchResults([]);
    setShowDropdown(false);
    setSearchQuery(result.displayName);
    onSearchChange?.(result.displayName);
  }

  const validStops = (allStops ?? []).filter((s) => s.point);

  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }}>
      {!hideSearch && (
        <View style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border, padding: 8 }}>
          <View style={{ position: "relative", justifyContent: "center" }}>
            <Search size={13} color={theme.subtext} style={{ position: "absolute", left: 9, zIndex: 1 }} />
            <TextInput
              value={searchQuery}
              onChangeText={(val) => {
                setSearchQuery(val);
                setShowDropdown(true);
                onSearchChange?.(val);
              }}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              placeholder="Search an address..."
              placeholderTextColor={theme.subtext}
              style={{
                backgroundColor: theme.background,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 6,
                paddingLeft: 28,
                paddingRight: 10,
                paddingVertical: 7,
                fontSize: 12.5,
                color: theme.text,
                fontFamily: "Outfit",
              }}
            />
          </View>

          {showDropdown && (searching || searchResults.length > 0 || searchError) && (
            <View
              style={{
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 6,
                marginTop: 4,
                maxHeight: 180,
              }}
            >
              {searching && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={theme.subtext} />
                  <Text style={{ fontSize: 11, color: theme.subtext, fontFamily: "Outfit" }}>Searching...</Text>
                </View>
              )}
              {!searching && searchError ? (
                <Text style={{ fontSize: 11, color: "#dc2626", paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Outfit" }}>
                  {searchError}
                </Text>
              ) : null}
              {!searching && !searchError && (
                <FlatList
                  data={searchResults}
                  keyExtractor={(r, idx) => `${r.lat}-${r.lon}-${idx}`}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <Text style={{ fontSize: 11, color: theme.subtext, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Outfit" }}>
                      No matches found.
                    </Text>
                  }
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      onPress={() => handleSelectResult(item)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderBottomWidth: index !== searchResults.length - 1 ? 1 : 0,
                        borderBottomColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 11.5, color: theme.text, fontFamily: "Outfit" }} numberOfLines={2}>
                        {item.displayName}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          )}
        </View>
      )}

      <View style={{ height, width: "100%" }}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          initialRegion={
            value
              ? { latitude: value.latitude, longitude: value.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
              : DEFAULT_REGION
          }
          onPress={handleMapPress}
          onRegionChangeComplete={(region) => {
            lastRegionRef.current = region;
          }}
        >
          {presets.map((loc) =>
            loc.latitude != null && loc.longitude != null ? (
              <Marker
                key={loc.id}
                coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                title={loc.name}
                opacity={0.7}
                pinColor="#94a3b8"
              />
            ) : null,
          )}

          {userLocation && (
            <Marker coordinate={userLocation} title="Your location" pinColor="#4285F4" />
          )}

          {allStops
            ? validStops.map((stop, i) => {
                const isPickup = stop.key === "pickup";
                const label = isPickup ? "P" : String(i);
                return (
                  <Marker
                    key={stop.key}
                    coordinate={{ latitude: stop.point!.latitude, longitude: stop.point!.longitude }}
                    title={stop.label}
                    pinColor={isPickup ? "#22c55e" : "#ef4444"}
                    opacity={stop.key === activeKey ? 1 : 0.85}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: isPickup ? "#22c55e" : "#ef4444",
                        borderWidth: stop.key === activeKey ? 3 : 2,
                        borderColor: stop.key === activeKey ? (theme.primary ?? "#2563eb") : "#fff",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{label}</Text>
                    </View>
                  </Marker>
                );
              })
            : value && (
                <Marker
                  coordinate={{ latitude: value.latitude, longitude: value.longitude }}
                  pinColor={theme.primary ?? "#2563eb"}
                />
              )}
        </MapView>

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
