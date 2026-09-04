export type UserRole = "employee" | "admin" | "superadmin";

export type UserPermissions = {
  itAccess?: boolean;
  itInventory?: boolean;
  consumables?: boolean;
  tickets?: boolean;
  officeSupplies?: boolean;
  fleetControl?: boolean; // Fleet Control Tower — dispatch/admin
  fleetDriver?: boolean; // Fleet Driver View — assigned drivers
};

export type ADUser = {
  username: string;
  displayName: string;
  email: string;
  department: string;
  title: string;
  phone: string;
  role: UserRole;
  permissions: UserPermissions;
};

export interface ConcernTicket {
  id: string;
  ticketNumber: string;
  summary: string;
  requesterId: string;
  requesterName: string;
  assigneeId: string;
  assigneeName: string;
  category: string;
  priority: "Low" | "Medium" | "High";
  status: "Pending" | "In Progress" | "Resolved";
  details?: string;
  dateCreated: string;
  dueDate: string;
}

export type OfficeCategory =
  | "office_supplies"
  | "cleaning"
  | "ppe"
  | "medicine"
  | "pantry";

export type OfficeUnit =
  | "piece"
  | "box"
  | "dozen"
  | "ream"
  | "pack"
  | "roll"
  | "set"
  | "pad"
  | "bottle"
  | "can"
  | "unit"
  | "liter"
  | "pair"
  | "bundle"
  | "gallon"
  | "refill";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface OfficeInventoryItem {
  id: string; // Firestore doc id
  itemCode: string; // e.g. "OS016" — preset by OnM, not editable
  name: string; // e.g. "Bond Paper A4"
  brand?: string;
  category: OfficeCategory;
  unit: OfficeUnit;
  pricePerUnit: number;
  currentStock: number;
  stockStatus: StockStatus; // recomputed on every write
  lowStockThreshold: number; // default 5
  inStockThreshold: number; // default 10
  isActive: boolean;
  isRestricted: boolean; // admin/superadmin-only visibility
  createdAt: string;
  updatedAt: string;
}

export interface StockTransaction {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  type:
    | "item_created"
    | "delivery"
    | "manual_adjustment"
    | "supply_request_fulfilled"
    | "ticket_deduction"
    | "supply_request_rejected"
    | "item_archived"
    | "item_restored"
    | "item_restricted"
    | "item_unrestricted"
    | "item_deleted";
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  pricePerUnit: number;
  totalAmount: number;
  reason?: string;
  performedByName: string;
  transactionDate: string;
  createdAt: string;
}

export interface NewItemInput {
  itemCode: string;
  name: string;
  brand?: string;
  category: OfficeCategory;
  unit: OfficeUnit;
  pricePerUnit: number;
  beginningInventory: number;
  lowStockThreshold?: number;
  inStockThreshold?: number;
  isRestricted?: boolean;
}

export interface EditItemInput {
  name: string;
  brand?: string;
  category: OfficeCategory;
  unit: OfficeUnit;
  pricePerUnit: number;
  lowStockThreshold: number;
  inStockThreshold: number;
}

// ─── ADD to types.ts ────────────────────────────────────────────────────────

export type SupplyRequestStatus =
  | "pending"
  | "awaiting_stock"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "resolved"
  | "rejected"
  | "cancelled";

export type SupplyRequestItem = {
  itemId: string;
  itemName: string;
  itemCode: string;
  category: string;
  quantityRequested: number;
  quantityApproved?: number | null; // null = not yet reviewed, 0 = skipped
  stockStatusAtRequest: string; // "available" | "low" | "out_of_stock"
  pricePerUnit: number;
};

export type SupplyRequest = {
  id: string;
  ticketNumber: string;
  requestedById: string;
  requestedByName: string;
  items: SupplyRequestItem[];
  status: SupplyRequestStatus;
  notes: string;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  // delivery fields
  approvedAt?: string;
  approvedByName?: string;
  deliveredAt?: string;
  deliveredByName?: string;
  failedReason?: string;
  failedAt?: string;
  // cancellation fields (employee-initiated, only while pending/awaiting_stock)
  cancelledAt?: string;
  cancelledByName?: string;
};
export type ITStatus = "Deployed" | "Spare" | "Defective";
export type ITCategory =
  | "Laptop"
  | "Monitor"
  | "Desktop"
  | "UPS"
  | "Network Device"
  | "Server";
export type ITLocation =
  | "Unit 1 & 2"
  | "Unit 3"
  | "BDO Makati"
  | "Triumph"
  | "WFH";

export interface ITInventory {
  assetTag: string;
  company: string;
  serialNumber: string;
  model: string;
  brand: string;
  category: ITCategory;
  status: ITStatus;
  assigneeId: string;
  assigneeName: string;
  location: ITLocation;
  datePurchased: string; // ISO date string, e.g. "2024-01-15"
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export type NewAssetInput = Omit<ITInventory, "createdAt" | "updatedAt">;
export type EditAssetInput = Omit<
  ITInventory,
  "assetTag" | "createdAt" | "updatedAt"
>;

// ─── Add or replace ITConsumable in your types.ts ────────────────────────────

export interface ITConsumable {
  id: string;
  name: string;
  model: string;
  status: "Spare" | "Deployed" | "Defective";
  location: "Unit 1 & 2" | "Unit 3" | "BDO Makati" | "Triumph" | "WFH";
  ipAddress: string;
  macAddress: string;
  black: number;
  photoBlack: number;
  cyan: number;
  magenta: number;
  yellow: number;
  maintenanceBox: number;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Fleet Ops types — paste into your shared types.ts ─────────────────────

export type TripStatus =
  | "pending"
  | "approved"
  | "ongoing"
  | "arrived"
  | "returning"
  | "completed"
  | "cancelled"
  | "rejected";

export type VehicleStatus = "idle" | "active" | "maintenance" | "personal";

export type VehicleType = "sedan" | "van" | "suv" | "truck";

export type FleetTripStatusLogEntry = {
  status: TripStatus;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  note?: string | null;
  changedByName?: string | null;
  timestamp: string; // created_at
};
export type FleetTrip = {
  id: string;
  tripRef: string;
  requestorId: string;
  requestorName: string;
  pickupLocationId?: string | null;
  pickupLabel: string;
  dropoffLocationId?: string | null;
  dropoffLabel: string;
  tripType: "oneway" | "roundtrip";
  departureDatetime: string; // ISO
  returnDatetime?: string | null;
  purpose?: string;
  passengerCount: number;
  passengerNames?: string[];
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  status: TripStatus;
  rejectedReason?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory?: FleetTripStatusLogEntry[];
  calendarSynced: boolean;
  isArchived?: boolean;
};

export type FleetVehicle = {
  id: string;
  plateNumber: string;
  type: VehicleType;
  model: string;
  seatingCapacity: number;
  status: VehicleStatus;
  currentTripLabel?: string | null;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  lastPingAt?: string | null;
  tramigoDeviceId?: string | null;
};

export type DriverDutyStatus = "off_duty" | "active" | "personal" | "leave";

export type FleetDriver = {
  id: string;
  userId: string;
  name: string;
  licenseNumber?: string | null;
  contactNumber?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  dutyStatus: DriverDutyStatus;
  shiftStart: string | null; // "HH:MM:SS" from DB, or null if unset
  shiftEnd: string | null;
  dutyStatusUpdatedAt?: string | null;
};

export type FleetLocation = {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type FleetLiveLocation = {
  vehicleId: string;
  plateNumber: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  reportedAt: string;
};

// ─── Room Reservation types ─────────────────────────────────────────────────

export type RoomName = "Conference Room" | "Meeting Room 1" | "Meeting Room 2";

export type AVRequirement =
  | "None"
  | "With video presentation"
  | "With Audio and Video presentation"
  | "Audio only";

export type RoomReservationStatus =
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type RoomReservation = {
  id: string;
  bookingId: string;
  roomRef: string;
  roomName: RoomName;
  maxAttendees: number;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  endTime: string; // HH:MM:SS
  timezone?: string;
  fullName: string;
  email: string;
  guestEmails?: string[];
  specialRequests?: string;
  avRequirement: AVRequirement;
  needsWifi: boolean;
  agenda: string;
  status: RoomReservationStatus;
  createdAt: string;
  updatedAt: string;
};

// ─── Department display labels ──────────────────────────────────────────────
// Maps the raw AD department value (from users.department) to a short label
// for display. Anything not in this map is shown exactly as it came from AD.
export const DEPARTMENT_LABELS: Record<string, string> = {
  "Admin Staff": "Admin",
  "BIM Department": "BIM",
  Production: "BIM",
};

export function displayDepartment(dept: string): string {
  return DEPARTMENT_LABELS[dept] ?? dept;
}

// Response shape from GET /users/:username/email-preference
export type EmailPreference = {
  current: string; // the user's notification_email
  options: {
    silverdab: string;
    ocgbim: string | null;
  };
};

// ─── Seat Plan types ─────────────────────────────────────────────────────────

export type SeatPlanRoom = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  vertical?: boolean;
  window?: boolean;
};

export type SeatPlanPod = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rows: number;
  cols: number;
  seats: string[];
  portrait?: boolean;
};
export type SeatPlanDoor = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: 0 | 90;
};

export type SeatPlanSeat = {
  id: string;
  x: number;
  y: number;
  name: string;
  rot?: number;
};

export type SeatPlanLayout = {
  rooms: SeatPlanRoom[];
  pods: SeatPlanPod[];
  seats: SeatPlanSeat[];
  doors: SeatPlanDoor[];
};
