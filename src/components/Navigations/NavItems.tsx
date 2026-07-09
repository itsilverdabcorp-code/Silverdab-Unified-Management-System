import { ChartColumn } from "lucide-react-native";
import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Theme } from "../../theme/ThemeContext";

export type NavItem = {
  key: string;
  label: string;
  icon: React.FC<{ color: string; size?: number }>;
  // Browser-bar URL this item represents. There's no router library wired
  // up, so this is purely for history.pushState / bookmarking — Sidebar
  // still drives the actual page switch via `key`.
  href: string;
};

// Replace the static C object with a function that takes the theme
export const getNavColors = (theme: Theme) => ({
  iconActive: theme.iconActive,
  iconInactive: theme.iconInactive,
  textActive: theme.textActive,
  textInactive: theme.textInactive,
  bgActive: theme.bgActive,
  bgHover: theme.bgHover,
  activeBar: theme.activeBar,
  sidebarBg: theme.sidebarBg,
  border: theme.navBorder,
});

// ─── Icons ────────────────────────────────────────────────────────────────────

export const DashboardIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="8" height="8" rx="1.5" fill={color} />
    <Rect
      x="13"
      y="3"
      width="8"
      height="8"
      rx="1.5"
      fill={color}
      opacity="0.7"
    />
    <Rect
      x="3"
      y="13"
      width="8"
      height="8"
      rx="1.5"
      fill={color}
      opacity="0.7"
    />
    <Rect
      x="13"
      y="13"
      width="8"
      height="8"
      rx="1.5"
      fill={color}
      opacity="0.4"
    />
  </Svg>
);

export const TicketsIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Rect
      x="9"
      y="3"
      width="6"
      height="4"
      rx="1"
      stroke={color}
      strokeWidth="2"
    />
    <Path
      d="M9 12h6M9 16h4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const InventoryIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20 7H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"
      stroke={color}
      strokeWidth="2"
    />
    <Path
      d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"
      stroke={color}
      strokeWidth="2"
    />
    <Path
      d="M12 12v4M10 14h4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const ConsumablesIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      x="4"
      y="8"
      width="16"
      height="9"
      rx="1.5"
      stroke={color}
      strokeWidth="2"
    />
    <Path
      d="M7 8V5a1 1 0 011-1h8a1 1 0 011 1v3"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Path
      d="M7 17v2a1 1 0 001 1h8a1 1 0 001-1v-2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Circle cx="17" cy="12.5" r="1.2" fill={color} />
  </Svg>
);

export const AnalyticsIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => <ChartColumn color={color} size={size} />;

export const ReportsIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Path
      d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const UsersIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="9" cy="7" r="4" stroke={color} strokeWidth="2" />
    <Path
      d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <Path
      d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const SettingsIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
    <Path
      d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      stroke={color}
      strokeWidth="2"
    />
  </Svg>
);

// ─── Employee-specific icons ──────────────────────────────────────────────────

export const SubmitTicketIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      width="8"
      height="4"
      x="8"
      y="2"
      rx="1"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9 14h6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 17v-6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const MyTicketsIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M14 2v5a1 1 0 0 0 1 1h5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M16 22a4 4 0 0 0-8 0"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx="12" cy="15" r="3" stroke={color} strokeWidth="2" />
  </Svg>
);

export const SuppliesIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      width="20"
      height="5"
      x="2"
      y="3"
      rx="1"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M10 12h4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ─── Audit Trail icon ─────────────────────────────────────────────────────────

export const AuditIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Document body with folded corner */}
    <Path
      d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Fold corner */}
    <Path
      d="M14 2v4a2 2 0 0 0 2 2h4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Clock face */}
    <Circle cx="8" cy="16" r="6" stroke={color} strokeWidth="2" />
    {/* Clock hands */}
    <Path
      d="M9.5 17.5 8 16.25V14"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ─── Office section icons ─────────────────────────────────────────────────────

export const OfficeDashboardIcon: React.FC<{
  color: string;
  size?: number;
}> = ({ color, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="7" height="7" rx="1.5" fill={color} />
    <Rect
      x="14"
      y="8"
      width="2.5"
      height="2"
      rx="0.5"
      fill={color}
      opacity="0.9"
    />
    <Rect
      x="17"
      y="5"
      width="2.5"
      height="5"
      rx="0.5"
      fill={color}
      opacity="0.9"
    />
    <Rect
      x="11"
      y="6"
      width="2.5"
      height="4"
      rx="0.5"
      fill={color}
      opacity="0.9"
    />
    <Path
      d="M4 18l3-3 2.5 2 3-3.5"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle
      cx="18"
      cy="18"
      r="3.5"
      stroke={color}
      strokeWidth="2"
      opacity="0.7"
    />
    <Path
      d="M18 14.5v1.8"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.9"
    />
  </Svg>
);

export const OfficeSuppliesIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M16 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M10 6h4M10 10h4M10 14h2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const SupplyRequestIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Rect
      x="9"
      y="3"
      width="6"
      height="4"
      rx="1"
      stroke={color}
      strokeWidth="2"
    />
    <Path
      d="M12 12v4M10 14h4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

export const MonthlyReportIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      x="3"
      y="4"
      width="18"
      height="18"
      rx="2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M16 2v4M8 2v4M3 10h18"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </Svg>
);

export const ActivityIcon: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 20,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M22 12h-4l-3 9L9 3l-3 9H2"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ─── Route map ──────────────────────────────────────────────────────────────
// Single source of truth for "key -> browser URL". Adjust these to whatever
// paths make sense for your app (they don't have to match real files since
// there's no router — they just show up in the address bar via
// history.pushState so pages are bookmarkable/shareable/refresh-safe).
const ROUTE_BY_KEY: Record<string, string> = {
  dashboard: "/dashboard",
  users: "/users",
  audit: "/audit-trail",
  tickets: "/it/tickets",
  inventory: "/it/inventory",
  consumables: "/it/consumables",
  officedashboard: "/office/dashboard",
  officeinventory: "/office/supplies",
  supplyrequest: "/office/request",
  monthlyreport: "/office/monthly-report",
  activity: "/office/activity",
  submitticket: "/submit-ticket",
  mytickets: "/my-tickets",
  supplyinventory: "/supply-inventory",
  settings: "/settings",
};

function href(key: string): string {
  return ROUTE_BY_KEY[key] ?? `/${key}`;
}

// ─── Menu config ──────────────────────────────────────────────────────────────

export type NavSection = {
  sectionLabel?: string; // undefined = no header, just items
  items: NavItem[];
};

export const MENU_BY_ROLE: Record<string, NavSection[]> = {
  superadmin: [
    {
      sectionLabel: "Superadmin",
      items: [
        {
          key: "dashboard",
          label: "Dashboard",
          icon: DashboardIcon,
          href: href("dashboard"),
        },
        {
          key: "users",
          label: "User Page",
          icon: UsersIcon,
          href: href("users"),
        },
        
      ],
    },
    {
      sectionLabel: "IT",
      items: [
        {
          key: "tickets",
          label: "Tickets",
          icon: TicketsIcon,
          href: href("tickets"),
        },
        {
          key: "inventory",
          label: "IT Inventory",
          icon: InventoryIcon,
          href: href("inventory"),
        },
        {
          key: "consumables",
          label: "IT Consumables",
          icon: ConsumablesIcon,
          href: href("consumables"),
        },
        {
          key: "audit",
          label: "Audit Trail",
          icon: AuditIcon,
          href: href("audit"),
        },
      ],
    },
    {
      sectionLabel: "Office Supplies",
      items: [
        {
          key: "officedashboard",
          label: "Dashboard",
          icon: OfficeDashboardIcon,
          href: href("officedashboard"),
        },
        {
          key: "officeinventory",
          label: "Office Supplies",
          icon: OfficeSuppliesIcon,
          href: href("officeinventory"),
        },
        {
          key: "supplyrequest",
          label: "Supply Request",
          icon: SupplyRequestIcon,
          href: href("supplyrequest"),
        },
        {
          key: "monthlyreport",
          label: "Monthly Report",
          icon: MonthlyReportIcon,
          href: href("monthlyreport"),
        },
        {
          key: "activity",
          label: "Activity",
          icon: ActivityIcon,
          href: href("activity"),
        },
      ],
    },
    {
      sectionLabel: "Employee",
      items: [
        {
          key: "submitticket",
          label: "Submit Ticket",
          icon: SubmitTicketIcon,
          href: href("submitticket"),
        },
        {
          key: "mytickets",
          label: "My Tickets",
          icon: MyTicketsIcon,
          href: href("mytickets"),
        },
        {
          key: "supplyinventory",
          label: "Supply Inventory",
          icon: SuppliesIcon,
          href: href("supplyinventory"),
        },
      ],
    },
  ],
  admin: [
    {
      items: [
        {
          key: "dashboard",
          label: "Dashboard",
          icon: DashboardIcon,
          href: href("dashboard"),
        },
      ],
    },
    {
      sectionLabel: "IT",
      items: [
        {
          key: "tickets",
          label: "Tickets",
          icon: TicketsIcon,
          href: href("tickets"),
        },
        {
          key: "inventory",
          label: "IT Inventory",
          icon: InventoryIcon,
          href: href("inventory"),
        },
        {
          key: "consumables",
          label: "IT Consumables",
          icon: ConsumablesIcon,
          href: href("consumables"),
        },
      ],
    },
    {
      sectionLabel: "Office Supplies",
      items: [
        {
          key: "officedashboard",
          label: "Dashboard",
          icon: OfficeDashboardIcon,
          href: href("officedashboard"),
        },
        {
          key: "officeinventory",
          label: "Office Supplies",
          icon: OfficeSuppliesIcon,
          href: href("officeinventory"),
        },
        {
          key: "supplyrequest",
          label: "Supply Request",
          icon: SupplyRequestIcon,
          href: href("supplyrequest"),
        },
        {
          key: "monthlyreport",
          label: "Monthly Report",
          icon: MonthlyReportIcon,
          href: href("monthlyreport"),
        },
        {
          key: "activity",
          label: "Activity",
          icon: ActivityIcon,
          href: href("activity"),
        },
      ],
    },
  ],
  employee: [
    {
      items: [
        {
          key: "dashboard",
          label: "Dashboard",
          icon: DashboardIcon,
          href: href("dashboard"),
        },
        {
          key: "submitticket",
          label: "Submit Ticket",
          icon: SubmitTicketIcon,
          href: href("submitticket"),
        },
        {
          key: "mytickets",
          label: "My Tickets",
          icon: MyTicketsIcon,
          href: href("mytickets"),
        },
        {
          key: "supplyinventory",
          label: "Supply Inventory",
          icon: SuppliesIcon,
          href: href("supplyinventory"),
        },
      ],
    },
  ],
};

function normalizeRole(role?: string): "superadmin" | "admin" | "employee" {
  const normalizedRole = role?.toLowerCase();

  if (normalizedRole === "superadmin") return "superadmin";
  if (normalizedRole === "admin" || normalizedRole === "it") return "admin";

  return "employee";
}

export function getNavSectionsForUser(user: {
  role: string;
  permissions?: {
    itAccess?: boolean;
    itInventory?: boolean;
    consumables?: boolean;
    tickets?: boolean;
    officeSupplies?: boolean;
    officesupplies?: boolean;
  };
}): NavSection[] {
  const normalizedRole = normalizeRole(user.role);

  if (normalizedRole === "superadmin") return MENU_BY_ROLE.superadmin;
  if (normalizedRole === "admin") return MENU_BY_ROLE.admin;

  if (normalizedRole === "employee") {
    const baseSection: NavSection = {
      items: [
        // { key: "dashboard",       label: "Dashboard",        icon: DashboardIcon,    href: href("dashboard")       },
        // { key: "submitticket",    label: "Submit Ticket",    icon: SubmitTicketIcon, href: href("submitticket")    },
        // { key: "mytickets",       label: "My Tickets",       icon: MyTicketsIcon,    href: href("mytickets")       },
        // { key: "supplyinventory", label: "Supply Inventory", icon: SuppliesIcon,     href: href("supplyinventory") },
      ],
    };

    // IT section — only if at least one IT permission is granted
    const itItems: NavItem[] = user.permissions?.itAccess
      ? [
          {
            key: "tickets",
            label: "Tickets",
            icon: TicketsIcon,
            href: href("tickets"),
          },
          {
            key: "inventory",
            label: "IT Inventory",
            icon: InventoryIcon,
            href: href("inventory"),
          },
          {
            key: "consumables",
            label: "IT Consumables",
            icon: ConsumablesIcon,
            href: href("consumables"),
          },
        ]
      : [];

    const hasOfficeSuppliesAccess = Boolean(
      user.permissions?.officeSupplies || user.permissions?.officesupplies,
    );

    // Office Supplies section — all 5 items, shown only if toggle is on
    const officeItems: NavItem[] = hasOfficeSuppliesAccess
      ? [
          {
            key: "officedashboard",
            label: "Dashboard",
            icon: OfficeDashboardIcon,
            href: href("officedashboard"),
          },
          {
            key: "officeinventory",
            label: "Office Supplies",
            icon: OfficeSuppliesIcon,
            href: href("officeinventory"),
          },
          {
            key: "supplyrequest",
            label: "Supply Request",
            icon: SupplyRequestIcon,
            href: href("supplyrequest"),
          },
          {
            key: "monthlyreport",
            label: "Monthly Report",
            icon: MonthlyReportIcon,
            href: href("monthlyreport"),
          },
          {
            key: "activity",
            label: "Activity",
            icon: ActivityIcon,
            href: href("activity"),
          },
        ]
      : [];

    const sections: NavSection[] = [baseSection];

    if (itItems.length > 0)
      sections.push({ sectionLabel: "IT", items: itItems });

    if (officeItems.length > 0)
      sections.push({ sectionLabel: "Office Supplies", items: officeItems });

    return sections;
  }

  return [];
}

// Keep getNavItemsForUser for backwards compatibility if used elsewhere
export function getNavItemsForUser(user: {
  role: string;
  permissions?: {
    itInventory?: boolean;
    consumables?: boolean;
    tickets?: boolean;
  };
}): NavItem[] {
  return getNavSectionsForUser(user).flatMap((s) => s.items);
}

// Returns permission-gated items for employees.
// Returns an empty array if the employee has no permissions at all.
export function getPermissionItemsForEmployee(user: {
  role: string;
  permissions?: {
    itInventory?: boolean;
    consumables?: boolean;
    tickets?: boolean;
  };
}): NavItem[] {
  if (normalizeRole(user.role) !== "employee") return [];

  const items: NavItem[] = [];

  if (user.permissions?.tickets)
    items.push({
      key: "tickets",
      label: "Tickets",
      icon: TicketsIcon,
      href: href("tickets"),
    });
  if (user.permissions?.itInventory)
    items.push({
      key: "inventory",
      label: "IT Inventory",
      icon: InventoryIcon,
      href: href("inventory"),
    });
  if (user.permissions?.consumables)
    items.push({
      key: "consumables",
      label: "IT Consumables",
      icon: ConsumablesIcon,
      href: href("consumables"),
    });

  return items;
}

// Given the sections currently visible to a user and a browser pathname
// (e.g. window.location.pathname), find which nav key it corresponds to.
// Used on app load / refresh to restore the right page from the URL.
export function getKeyFromHref(
  sections: NavSection[],
  path: string,
): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.href === path) return item.key;
    }
  }
  return null;
}
