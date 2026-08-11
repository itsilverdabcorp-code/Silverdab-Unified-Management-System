import { Platform } from "react-native";

export default Platform.OS === "web"
  ? require("./ActivityPage.web").default
  : require("./ActivityPage.native").default;
