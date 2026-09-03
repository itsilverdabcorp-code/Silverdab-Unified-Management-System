import { ComponentType } from "react";
import { Platform } from "react-native";
import { ADUser } from "../../../../../types";

type Props = { user: ADUser };

// require()'s return type is implicitly `any`, which would otherwise erase
// the `user` prop's type at every call site. This annotation restores it.
const TicketHubPage: ComponentType<Props> =
  Platform.OS === "web"
    ? require("./TicketHubPage.web").default
    : require("./TicketHubPage.native").default;

export default TicketHubPage;