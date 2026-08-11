import { Platform } from "react-native";

export default Platform.OS === "web"
  ? require("./SupplyRequestsPage.web").default
  : require("./SupplyRequestsPage.native").default;