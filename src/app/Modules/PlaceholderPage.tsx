import { Text, View } from "react-native";
import { ADUser } from "../../../types";
import { useTheme } from "../../theme/ThemeContext";

type Props = {
  title: string;
  description?: string;
  currentUser?: ADUser;
};

export default function PlaceholderPage({
  title,
  description = "This page is not built yet.",
}: Props) {
  const { theme } = useTheme();

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: theme.background }}
    >
      <View
        className="w-full max-w-[420px] rounded-2xl p-6"
        style={{
          backgroundColor: theme.bgActive,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text className="text-xl font-bold mb-2" style={{ color: theme.text }}>
          {title}
        </Text>
        <Text className="text-sm" style={{ color: theme.subtext }}>
          {description}
        </Text>
      </View>
    </View>
  );
}
