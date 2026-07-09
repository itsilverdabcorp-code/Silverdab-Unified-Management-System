export type UserRole = 'employee' | 'admin' | 'superadmin';

export type UserPermissions = {
  itAccess: boolean;
  itInventory: boolean;
  consumables: boolean;
  tickets: boolean;
  officeSupplies: boolean;
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
  | "medicine";

export type OfficeUnit =
  | "piece"
  | "ream"
  | "box"
  | "roll"
  | "pack"
  | "bottle"
  | "gallon";

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
  createdAt: string;
  updatedAt: string;
}

export interface StockTransaction {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  type:
    | "ticket_deduction"
    | "manual_adjustment"
    | "delivery"
    | "supply_request_fulfilled"; // ← added
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
  | "rejected";

export type SupplyRequestItem = {
  itemId: string;
  itemName: string;
  itemCode: string;
  category: string;
  quantityRequested: number;
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
};
export type ITStatus = "Deployed" | "Spare" | "Defective";
export type ITCategory =
  | "Laptop" | "Monitor" | "Desktop" | "UPS" | "Network Device" | "Server";
export type ITLocation =
  | "Unit 1 & 2" | "Unit 3" | "BDO Makati" | "Triumph" | "WFH";

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
export type EditAssetInput = Omit<ITInventory, "assetTag" | "createdAt" | "updatedAt">;


// ─── Add or replace ITConsumable in your types.ts ────────────────────────────

export interface ITConsumable {
  id:             string;
  name:           string;
  model:          string;
  status:         "Spare" | "Deployed" | "Defective";
  location:       "Unit 1 & 2" | "Unit 3" | "BDO Makati" | "Triumph" | "WFH";
  ipAddress:      string;
  macAddress:     string;
  black:          number;
  photoBlack:     number;
  cyan:           number;
  magenta:        number;
  yellow:         number;
  maintenanceBox: number;
  createdAt?:     any;
  updatedAt?:     any;
}
