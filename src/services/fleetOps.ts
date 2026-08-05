// Services/fleetOps.ts — MySQL implementation
//
// Mirrors the pattern used in Services/officeInventory.ts and
// Services/supplyRequests.ts: service token auth, BACKEND_URL,
// readJsonResponse, snake_case -> camelCase row mapping.
//
// Maps to the fleet_* tables from your schema:
//   fleet_trips, fleet_vehicles, fleet_drivers, fleet_locations,
//   fleet_trip_status_log, fleet_vehicle_status_log.
//
// NOTE: endpoint paths below assume the same REST convention as your
// existing /office-inventory/:id/..., /supply-requests/:id/... routes.
// Adjust the URLs if your backend differs.
//
// NOTE 2: GET /fleet/trips is expected to join in the assigned vehicle's
// plate_number and the assigned driver's name so the UI doesn't need a
// second round trip to label a trip row — same approach your
// /supply-requests join already takes for requestedByName. If your
// backend returns bare foreign keys instead, mapTripRow below will just
// fall back to showing the raw IDs (see the ?? fallbacks).

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ADUser,
  DriverDutyStatus,
  FleetDriver,
  FleetLiveLocation,
  FleetLocation,
  FleetTrip,
  FleetVehicle,
  TripStatus,
  VehicleStatus,
  VehicleType,
} from "../../types";

const BACKEND_URL = "https://api.silvergraph.ai";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

// ─── Shared helpers (identical to officeInventory.ts / supplyRequests.ts) ──

async function readJsonResponse<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function getServiceToken(): Promise<string> {
  if (_serviceToken) return _serviceToken;

  try {
    const res = await fetch(`${BACKEND_URL}/auth/service-token`, {
      headers: {
        "x-internal-secret": INTERNAL_SECRET,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      token?: string;
      message?: string;
    }>(res);
    if (!res.ok || !data?.success || !data.token) {
      console.warn(
        "Service token unavailable, continuing without backend auth.",
      );
      return "";
    }

    _serviceToken = data.token;
    return _serviceToken;
  } catch (err) {
    console.warn("Could not fetch service token:", err);
    return "";
  }
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getServiceToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function getCurrentUser(): Promise<{ name: string; id: string }> {
  try {
    const saved = await AsyncStorage.getItem("AD_USER_DATA");
    if (saved) {
      const user: ADUser = JSON.parse(saved);
      return { name: user.displayName, id: user.username };
    }
  } catch {}
  return { name: "Unknown", id: "" };
}

// ─── Row mapping ────────────────────────────────────────────────────────────
function mapTripRow(row: any): FleetTrip {
  return {
    id: row.id,
    tripRef: row.tripRef,
    requestorId: row.requestorId ?? "",
    requestorName: row.requestorName ?? "Unknown",
    pickupLocationId: row.pickupLocationId ?? null,
    pickupLabel: row.pickupLabel ?? "—",
    dropoffLocationId: row.dropoffLocationId ?? null,
    dropoffLabel: row.dropoffLabel ?? "—",
    tripType: row.tripType,
    departureDatetime: row.departureDatetime,
    returnDatetime: row.returnDatetime ?? null,
    purpose: row.purpose ?? "",
    passengerCount: Number(row.passengerCount ?? 1),
    passengerNames: Array.isArray(row.passengerNames) ? row.passengerNames : [],
    vehicleId: row.vehicleId ?? null,
    vehiclePlate: row.vehiclePlate ?? null,
    driverId: row.driverId ?? null,
    driverName: row.driverName ?? null,
    status: (row.status ?? "pending") as TripStatus,
    rejectedReason: row.rejectedReason ?? null,
    approvedByName: row.approvedByName ?? null,
    approvedAt: row.approvedAt ?? null,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    statusHistory: Array.isArray(row.statusHistory) ? row.statusHistory : [],
  };
}

function mapVehicleRow(row: any): FleetVehicle {
  return {
    id: row.id,
    plateNumber: row.plateNumber,
    type: row.type,
    model: row.model,
    seatingCapacity: Number(row.seatingCapacity ?? 4),
    status: row.status,
    currentTripLabel: row.currentTripLabel ?? null,
    assignedDriverId: row.assignedDriverId ?? null,
    assignedDriverName: row.assignedDriverName ?? null,
    lastPingAt: row.lastPingAt ?? null,
    tramigoDeviceId: row.tramigoDeviceId ?? null,
  };
}

// A device from the Tramigo account that isn't yet linked to any of our
// fleet_vehicles rows — pulled from GET /tramigo/devices (your existing
// backend proxy to Tramigo Cloud's device list).
export type TramigoDevice = { id: string; imei: string; name: string };

export async function getTramigoDevices(): Promise<TramigoDevice[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/fleet/tramigo-devices`, {
      headers: await authHeaders(false),
    });
    const data = await readJsonResponse<{ success?: boolean; devices?: any[]; message?: string }>(res);
    if (!res.ok || !data?.success || !Array.isArray(data.devices)) {
      console.warn("Tramigo devices endpoint unavailable, returning empty list.");
      return [];
    }
    return data.devices.map((d) => ({ id: String(d.ID), imei: d.IMEI, name: d.Name }));
  } catch (err) {
    console.warn("getTramigoDevices error:", err);
    return [];
  }
}

function mapDriverRow(row: any): FleetDriver {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name ?? row.displayName ?? "Unknown",
    licenseNumber: row.licenseNumber ?? null,
    contactNumber: row.contactNumber ?? null,
    vehicleId: row.vehicleId ?? null,
    vehiclePlate: row.vehiclePlate ?? null,
    dutyStatus: row.dutyStatus ?? "off_duty",
  };
}

function mapLocationRow(row: any): FleetLocation {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  };
}

export async function startFleetTrip(tripId: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/fleet/trips/${encodeURIComponent(tripId)}/start`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to start trip.");
  }
}

export async function updateFleetVehicle(
  vehicleId: string,
  payload: Partial<{ plateNumber: string; type: VehicleType; model: string; seatingCapacity: number; tramigoDeviceId: string | null }>,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update vehicle.");
  }
}

export async function updateFleetLocation(
  locationId: string,
  payload: Partial<{
    name: string;
    shortLabel: string;
    latitude: number | null;
    longitude: number | null;
  }>,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/locations/${encodeURIComponent(locationId)}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update location.");
  }
}

export async function deleteFleetLocation(locationId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/locations/${encodeURIComponent(locationId)}`, {
    method: "DELETE",
    headers: await authHeaders(false),
  });
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to delete location.");
  }
}

export async function deleteFleetVehicle(vehicleId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: "DELETE",
    headers: await authHeaders(false),
  });
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to delete vehicle.");
  }
}

export async function updateFleetDriver(
  driverId: string,
  payload: Partial<{ licenseNumber: string; contactNumber: string; vehicleId: string | null }>,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/drivers/${encodeURIComponent(driverId)}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update driver.");
  }
}

export async function deleteFleetDriver(driverId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/drivers/${encodeURIComponent(driverId)}`, {
    method: "DELETE",
    headers: await authHeaders(false),
  });
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to delete driver.");
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getAllFleetTrips(): Promise<FleetTrip[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/fleet/trips`, {
      headers: {
        Authorization: `Bearer ${token}`,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      trips?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.trips)) {
      console.warn("Fleet trips endpoint unavailable, returning empty list.");
      return [];
    }

    return data.trips.map(mapTripRow);
  } catch (err) {
    console.warn("getAllFleetTrips error:", err);
    return [];
  }
}

export async function getAllFleetVehicles(): Promise<FleetVehicle[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/fleet/vehicles`, {
      headers: {
        Authorization: `Bearer ${token}`,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      vehicles?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.vehicles)) {
      console.warn("Fleet vehicles endpoint unavailable, returning empty list.");
      return [];
    }

    return data.vehicles.map(mapVehicleRow);
  } catch (err) {
    console.warn("getAllFleetVehicles error:", err);
    return [];
  }
}

export async function getAllFleetDrivers(): Promise<FleetDriver[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/fleet/drivers`, {
      headers: {
        Authorization: `Bearer ${token}`,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      drivers?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.drivers)) {
      console.warn("Fleet drivers endpoint unavailable, returning empty list.");
      return [];
    }

    return data.drivers.map(mapDriverRow);
  } catch (err) {
    console.warn("getAllFleetDrivers error:", err);
    return [];
  }
}

export async function getAllFleetLocations(): Promise<FleetLocation[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/fleet/locations`, {
      headers: {
        Authorization: `Bearer ${token}`,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      locations?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.locations)) {
      console.warn("Fleet locations endpoint unavailable, returning empty list.");
      return [];
    }

    return data.locations.map(mapLocationRow);
  } catch (err) {
    console.warn("getAllFleetLocations error:", err);
    return [];
  }
}

// Matches GET /fleet/vehicles/live-locations in server.js — returns one
// entry per vehicle that has a tramigo_device_id set and a recent report.
// Vehicles without a linked Tramigo device (or with no report yet) are
// simply omitted, not returned with null coordinates.
export async function getFleetLiveLocations(): Promise<FleetLiveLocation[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/fleet/vehicles/live-locations`, {
      headers: {
        Authorization: `Bearer ${token}`,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      locations?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.locations)) {
      console.warn("Fleet live-locations endpoint unavailable, returning empty list.");
      return [];
    }

    return data.locations as FleetLiveLocation[];
  } catch (err) {
    console.warn("getFleetLiveLocations error:", err);
    return [];
  }
}

// ─── CREATE (employee submit) ───────────────────────────────────────────────

export async function submitTripRequest(payload: {
  pickupLocationId?: string;
  pickupLocationText?: string;
  dropoffLocationId?: string;
  dropoffLocationText?: string;
  tripType: "oneway" | "roundtrip";
  departureDatetime: string;
  returnDatetime?: string;
  purpose?: string;
  passengerCount: number;
  passengerNames?: string[];
}): Promise<string> {
  const user = await getCurrentUser();

  const res = await fetch(`${BACKEND_URL}/fleet/trips`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      ...payload,
      requestorId: user.id,
      requestorName: user.name,
    }),
  });

  const data = await readJsonResponse<{
    success?: boolean;
    tripRef?: string;
    message?: string;
  }>(res);

  if (!res.ok || !data?.success || !data.tripRef) {
    throw new Error(data?.message || "Unable to submit trip request.");
  }

  return data.tripRef;
}
// ─── CREATE (admin: vehicles / drivers / locations) ─────────────────────────

export async function createFleetVehicle(payload: {
  plateNumber: string;
  type: VehicleType;
  model: string;
  seatingCapacity: number;
  tramigoDeviceId?: string;
}): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/vehicles`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to add vehicle.");
  }
}

export async function createFleetDriver(payload: {
  username: string;
  licenseNumber?: string;
  contactNumber?: string;
}): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/drivers`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to add driver.");
  }
}

export async function createFleetLocation(payload: {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/fleet/locations`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to add location.");
  }
}

// ─── APPROVE (assign vehicle + driver, pending -> approved) ────────────────

export async function approveFleetTrip(
  tripId: string,
  assignment: { vehicleId: string; driverId: string },
): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/fleet/trips/${encodeURIComponent(tripId)}/approve`,
    {
      method: "POST",   // ← was "PATCH"
      headers: await authHeaders(),
      body: JSON.stringify({
        vehicleId: assignment.vehicleId,
        driverId: assignment.driverId,
        approvedByName: user.name,
        approvedById: user.id,
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    // e.g. backend returns 400 "Vehicle already assigned to another active trip"
    throw new Error(data?.message || "Failed to approve trip.");
  }
}

// ─── REJECT (pending -> rejected) ───────────────────────────────────────────

export async function rejectFleetTrip(
  tripId: string,
  reason: string,
): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/fleet/trips/${encodeURIComponent(tripId)}/reject`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        reason,
        reviewedByName: user.name,
        reviewedById: user.id,
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to reject trip.");
  }
}

// ─── STATUS TRANSITIONS (approved/ongoing -> arrived -> returning -> completed) ─
async function postTripAction(tripId: string, action: string, errorLabel: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/fleet/trips/${encodeURIComponent(tripId)}/${action}`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || errorLabel);
  }
}

export async function markTripArrived(tripId: string): Promise<void> {
  return postTripAction(tripId, "arrive", "Failed to mark trip as arrived.");
}
export async function startTripReturn(tripId: string): Promise<void> {
  return postTripAction(tripId, "start-return", "Failed to start return leg.");  // must be exactly "start-return"
}
export async function completeFleetTrip(tripId: string): Promise<void> {
  return postTripAction(tripId, "complete", "Failed to complete trip.");
}

// ─── CANCEL (requestor-initiated, only while pending/approved) ─────────────

export async function cancelFleetTrip(tripId: string): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/fleet/trips/${encodeURIComponent(tripId)}/cancel`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({ cancelledByName: user.name }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to cancel trip.");
  }
}

// ─── VEHICLE STATUS (idle/active/maintenance/personal/off_duty — driver-facing) ─

export async function setVehicleStatus(
  vehicleId: string,
  status: VehicleStatus,
  note?: string,
): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/fleet/vehicles/${encodeURIComponent(vehicleId)}/status`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({ status, note, setByDriverId: user.id }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update vehicle status.");
  }
}

// ─── DRIVER DUTY STATUS (off_duty/active/personal — independent of vehicle) ─

export async function setDriverDutyStatus(
  driverId: string,
  dutyStatus: DriverDutyStatus,
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/fleet/drivers/${encodeURIComponent(driverId)}/duty-status`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({ dutyStatus }),
    },
  );
  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update duty status.");
  }
}
