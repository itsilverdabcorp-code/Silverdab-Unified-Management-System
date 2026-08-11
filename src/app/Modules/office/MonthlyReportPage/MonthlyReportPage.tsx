// app/Modules/office/MonthlyReportPage/MonthlyReportPage.tsx
import { Platform } from "react-native";

export default Platform.OS === "web"
  ? require("./MonthlyReportPage.web").default
  : require("./MonthlyReportPage.native").default;