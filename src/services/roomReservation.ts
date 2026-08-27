import { ADUser } from "../../types"; // adjust to your actual types path

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://api.silvergraph.ai";

export type RoomReservationPayload = {
  roomName: "Conference Room" | "Meeting Room 1" | "Meeting Room 2";
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  endTime?: string; // HH:MM:SS, optional
  fullName: string;
  email: string;
  guestEmails?: string[];
  specialRequests?: string;
  avRequirement?: "None" | "With video presentation" | "With Audio and Video presentation" | "Audio only";
  needsWifi?: boolean;
  agenda: string;
};

async function getAuthToken(): Promise<string> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const token = await AsyncStorage.getItem("AD_AUTH_TOKEN");
  if (!token) throw new Error("Not authenticated.");
  return token;
}

export async function createRoomReservation(
  payload: RoomReservationPayload,
): Promise<{ id: number; bookingId: string; roomRef: string }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/room-reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to book room.");
  }
  return { id: data.id, bookingId: data.bookingId, roomRef: data.roomRef };
}

import { EmailPreference } from "../../types"; // adjust path to your actual types location

export async function getEmailPreference(username: string): Promise<EmailPreference> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}/email-preference`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to load email preference.");
  }
  return { current: data.current, options: data.options };
}

export async function getRoomReservations(params?: {
  date?: string;
  room?: string;
}): Promise<any[]> {
  const token = await getAuthToken();
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.room) qs.set("room", params.room);
  const res = await fetch(
    `${API_BASE}/room-reservations${qs.toString() ? `?${qs.toString()}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to load reservations.");
  }
  return data.reservations;
}

// Same as getRoomReservations but with no date/room filter — used by
// TicketHubPage to show a user's own bookings alongside their other tickets.
export async function getAllRoomReservations(): Promise<any[]> {
  return getRoomReservations();
}

export async function cancelRoomReservation(id: string | number): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/room-reservations/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to cancel reservation.");
  }
}