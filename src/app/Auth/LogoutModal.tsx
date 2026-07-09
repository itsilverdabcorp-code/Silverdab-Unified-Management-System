import { Modal, View, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../../theme/ThemeContext";

type Props = {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function LogoutModal({ visible, onConfirm, onCancel }: Props) {
  const { theme } = useTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.overlay,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 28,
            width: 320,
            shadowColor: theme.shadow,
            shadowOpacity: 1,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit",
              fontWeight: "500",
              fontSize: 16,
              color: theme.text,
              marginBottom: 8,
            }}
          >
            Log out
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontWeight: "400",
              fontSize: 13.5,
              color: theme.subtext,
              marginBottom: 24,
            }}
          >
            Are you sure you want to log out?
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontWeight: "500",
                  fontSize: 13.5,
                  color: theme.subtext,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: theme.primary,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontWeight: "500",
                  fontSize: 13.5,
                  color: theme.primaryText,
                }}
              >
                Log out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}