import MyTicketsPage from "@/app/Modules/employee/MyTicketsPage";
import ITInventoryPage from "@/app/Modules/it/inventory/ITInventoryPage";
import ActivityPage from "@/app/Modules/office/ActivityPage";
import MonthlyReportPage from "@/app/Modules/office/MonthlyReportPage";
import OfficeDashboardPage, {
  NavPayload,
} from "@/app/Modules/office/OfficeDashboardPage";
import SupplyRequestsPage from "@/app/Modules/office/SupplyRequestsPage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { ADUser, OfficeInventoryItem } from "../../../types"; // adjust to your actual saved path
import PlaceholderPage from "../../app/Modules/PlaceholderPage";
import UsersPage, {
  SuperadminDashboard,
} from "../../app/Modules/Superadmin/UsersPage"; // adjust to your actual saved path
import OfficeInventoryPage, {
  InventoryFilter,
} from "../../app/Modules/office/OfficeInventoryPage";
import { getKeyFromHref, getNavSectionsForUser } from "./NavItems"; // adjust to your actual saved path
import Sidebar from "./Sidebar"; // adjust to your actual saved path
import MobileNavbar from "./MobileNavbar"; // adjust to your actual saved path
import AuditTrailPage from "@/app/Modules/it/AuditTrailPage";
import ConsumablesPage from "@/app/Modules/it/consumables/ConsumablesPage";

const LAST_PAGE_KEY = "SUMS_LAST_PAGE";

type Props = {
  user: ADUser;
  onLogout: () => void;
};

// The office dashboard's KPI cards / "Needs attention" quick actions /
// pending-requests "Details" buttons call onNavigate / onNavigateWithPayload
// with a *logical* target ("inventory", "supply_requests",
// "inventory_deliver", ...). This maps those logical targets to the actual
// Sidebar nav keys used by renderPage's switch below.
type OfficeNavTarget =
  | "inventory"
  | "supply_requests"
  | "monthly_report"
  | "activity"
  | "inventory_deliver";

function mapOfficeTabToNavKey(tab: OfficeNavTarget): string {
  switch (tab) {
    case "inventory":
    case "inventory_deliver":
      return "officeinventory";
    case "supply_requests":
      return "supplyrequest";
    case "monthly_report":
      return "monthlyreport";
    case "activity":
      return "activity";
    default:
      return "officeinventory";
  }
}

// Single place that maps a nav item's `key` to the screen it renders.
// Add a case here each time you build out a new page.
function renderPage(
  activeKey: string,
  user: ADUser,
  office: {
    inventoryFilter: InventoryFilter;
    deliverItem: OfficeInventoryItem | null;
    onDeliverModalOpened: () => void;
    onOfficeNavigate: (tab: OfficeNavTarget, filter?: InventoryFilter) => void;
    onOfficeNavigateWithPayload: (payload: NavPayload) => void;
  },
) {
  switch (activeKey) {
    case "dashboard":
      return <PlaceholderPage
          title="Dashboard"
          description="Dashboard page is coming soon."
          currentUser={user}
        />
    case "users":
      return <UsersPage currentUser={user} />;
    case "audit":
      return (
        <AuditTrailPage />
      );
    case "tickets":
      return (
        <PlaceholderPage
          title="IT Tickets"
          description="Tickets page is coming soon."
          currentUser={user}
        />
      );
    case "inventory":
      return <ITInventoryPage user={user} />;
    case "consumables":
      return (
        <ConsumablesPage user={user} />
      );
    case "officedashboard":
      return (
        <OfficeDashboardPage
          user={user}
          onNavigate={(tab, filter) =>
            office.onOfficeNavigate(tab as OfficeNavTarget, filter ?? null)
          }
          onNavigateWithPayload={office.onOfficeNavigateWithPayload}
        />
      );
    case "officeinventory":
      return (
        <OfficeInventoryPage
          isSuperAdmin={user.role === "superadmin"}
          initialFilter={office.inventoryFilter}
          initialDeliverItem={office.deliverItem}
          onDeliverModalOpened={office.onDeliverModalOpened}
        />
      );
    case "supplyrequest":
      return <SupplyRequestsPage user={user} />;
    case "monthlyreport":
      return <MonthlyReportPage user={user} />;
    case "activity":
      return <ActivityPage />;
    case "submitticket":
      return (
        <PlaceholderPage
          title="Submit Ticket"
          description="Submit ticket page is coming soon."
          currentUser={user}
        />
      );
    case "mytickets":
      return <MyTicketsPage user={user} />;
    case "supplyinventory":
      return (
        <PlaceholderPage
          title="Supply Inventory"
          description="Supply inventory page is coming soon."
          currentUser={user}
        />
      );
    case "settings":
      return (
        <PlaceholderPage
          title="Settings"
          description="Settings page is coming soon."
          currentUser={user}
        />
      );
    default:
      return (
        <PlaceholderPage
          title="Page"
          description="This page is not available yet."
          currentUser={user}
        />
      );
  }
}

export default function AppShell({ user, onLogout }: Props) {
  const sections = getNavSectionsForUser(user);
  const [activeKey, setActiveKey] = useState<string>(
    user.role === "superadmin" ? "dashboard" : "users",
  );
  const [restored, setRestored] = useState(false);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // ── Cross-page state for the office module ──────────────────────────────
  // OfficeDashboardPage's KPI cards / quick actions don't render their own
  // navigation — they call onNavigate / onNavigateWithPayload and expect
  // AppShell to (a) switch tabs and (b) hand the target page whatever
  // context it needs (a stock-status filter, or an item to pre-fill the
  // Add Delivery modal with). This is that shared state.
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>(null);
  const [deliverItem, setDeliverItem] = useState<OfficeInventoryItem | null>(
    null,
  );

  // On mount: prefer the current browser URL (so a refresh/shared link lands
  // on the right page), falling back to the last page cached in
  // AsyncStorage, matching how the rest of the app persists nav state.
  useEffect(() => {
    const restore = async () => {
      let keyFromUrl: string | null = null;
      if (typeof window !== "undefined" && window.location) {
        keyFromUrl = getKeyFromHref(sections, window.location.pathname);
      }

      if (keyFromUrl) {
        setActiveKey(keyFromUrl);
      } else {
        try {
          const saved = await AsyncStorage.getItem(LAST_PAGE_KEY);
          if (saved) setActiveKey(saved);
        } catch (err) {
          console.error("Failed to restore last page:", err);
        }
      }
      setRestored(true);
    };
    restore();
  }, []);

  const handleNavigate = (key: string) => {
    setActiveKey(key);
    AsyncStorage.setItem(LAST_PAGE_KEY, key).catch((err) =>
      console.error("Failed to persist last page:", err),
    );
  };

  // ── Office dashboard → office inventory wiring ───────────────────────────
  // Called when a KPI card ("Out of stock", "Low stock", etc.) is clicked.
  const handleOfficeNavigate = (
    tab: OfficeNavTarget,
    filter?: InventoryFilter,
  ) => {
    if (tab === "inventory") {
      setInventoryFilter(filter ?? null);
    }
    handleNavigate(mapOfficeTabToNavKey(tab));
  };

  // Called for the "Needs attention → + Add stock" quick action and the
  // "Pending requests → Details" button, which carry an actual item/request
  // payload rather than just a filter.
  const handleOfficeNavigateWithPayload = (payload: NavPayload) => {
    if (payload.tab === "inventory_deliver") {
      setDeliverItem(payload.deliverItem ?? null);
    }
    // NOTE: payload.approvalRequest (for "supply_requests") isn't wired to
    // SupplyRequestsPage yet — that page doesn't currently accept an
    // "open this request" prop. Add one (e.g. initialApprovalRequest) and
    // pass payload.approvalRequest through here if you want the dashboard's
    // "Details" button to deep-link straight into a request.
    handleNavigate(mapOfficeTabToNavKey(payload.tab as OfficeNavTarget));
  };

  // Clears the pending deliverItem once OfficeInventoryPage has consumed it
  // (opened the Add Delivery modal), so navigating away and back to
  // Inventory later doesn't reopen the same modal.
  const handleDeliverModalOpened = () => setDeliverItem(null);

  if (!restored) return null;

  return (
    <View style={{ flex: 1, flexDirection: isMobile ? "column" : "row" }}>
      {isMobile ? (
        <MobileNavbar
          user={user}
          activeKey={activeKey}
          onNavigate={handleNavigate}
          onLogout={onLogout}
        />
      ) : (
        <Sidebar
          user={user}
          activeKey={activeKey}
          onNavigate={handleNavigate}
          onLogout={onLogout}
        />
      )}
      <View style={{ flex: 1, paddingTop: isMobile ? 56 : 0 }}>
        {renderPage(activeKey, user, {
          inventoryFilter,
          deliverItem,
          onDeliverModalOpened: handleDeliverModalOpened,
          onOfficeNavigate: handleOfficeNavigate,
          onOfficeNavigateWithPayload: handleOfficeNavigateWithPayload,
        })}
      </View>
    </View>
  );
}
