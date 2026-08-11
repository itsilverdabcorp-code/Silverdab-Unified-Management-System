import { Platform } from "react-native";

export default Platform.OS === "web"
  ? require("./OfficeInventoryPage.web").default
  : require("./OfficeInventoryPage.native").default;