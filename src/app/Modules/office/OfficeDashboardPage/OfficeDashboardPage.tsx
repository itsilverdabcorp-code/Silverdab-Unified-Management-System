import { ComponentType } from "react";
import { Platform } from "react-native";
import { ADUser } from "../../../../../types";
import { NavTarget, NavPayload, DashboardInventoryFilter } from "./useOfficeDashboardData";

type Props = {
  user?: ADUser;
  onNavigate?: (tab: NavTarget, filter?: DashboardInventoryFilter) => void;
  onNavigateWithPayload?: (payload: NavPayload) => void;
};

// require()'s return type is implicitly `any`, which would otherwise erase
// onNavigate/onNavigateWithPayload's parameter types at every call site
// (e.g. AppShell's `(tab, filter) => ...` silently becoming `(tab: any,
// filter: any) => ...`). This annotation restores the real type.
const OfficeDashboardPage: ComponentType<Props> =
  Platform.OS === "web"
    ? require("./OfficeDashboardPage.web").default
    : require("./OfficeDashboardPage.native").default;

export default OfficeDashboardPage;