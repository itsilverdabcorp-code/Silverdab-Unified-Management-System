import { Save, Trash2 } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../theme/ThemeContext"; // same path as the other pages

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  variant = "danger",
  busy = false,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { theme } = useTheme();
  if (!visible) return null;

  const danger = variant === "danger";
  const accent = danger ? "#dc2626" : theme.iconActive;
  const Icon = danger ? Trash2 : Save;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(10,14,20,0.55)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: 20,
      }}
    >
      <View
        style={{
          width: 400,
          maxWidth: "100%",
          backgroundColor: theme.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.navBorder,
          padding: 22,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            backgroundColor: danger ? "rgba(220,38,38,0.12)" : theme.bgActive,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <Icon size={20} color={accent} />
        </View>

        <Text style={{ fontFamily: "Outfit-Bold", fontSize: 18, color: theme.textActive }}>
          {title}
        </Text>
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 13.5,
            lineHeight: 20,
            color: theme.textInactive,
            marginTop: 6,
          }}
        >
          {message}
        </Text>

        {error ? (
          <Text style={{ fontFamily: "Outfit-medium", fontSize: 12.5, color: "#dc2626", marginTop: 10 }}>
            {error}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <TouchableOpacity
            onPress={onCancel}
            disabled={busy}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 15,
              paddingVertical: 9,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.navBorder,
              backgroundColor: theme.surface,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 13.5, color: theme.textActive }}>
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onConfirm}
            disabled={busy}
            activeOpacity={0.8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 15,
              paddingVertical: 9,
              borderRadius: 8,
              backgroundColor: accent,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 13.5, color: "#fff" }}>
              {confirmLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}