import { Platform } from "react-native";

export default Platform.OS === "web"
  ? require("./FleetAllTripsPage.web").default
  : require("./FleetAllTripsPage.native").default;
