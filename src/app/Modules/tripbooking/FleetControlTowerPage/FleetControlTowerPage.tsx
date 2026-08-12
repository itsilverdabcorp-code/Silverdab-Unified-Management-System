import { Platform } from "react-native";

export default Platform.OS === "web"
  ? require("./FleetControlTowerPage.web").default
  : require("./FleetControlTowerPage.native").default;