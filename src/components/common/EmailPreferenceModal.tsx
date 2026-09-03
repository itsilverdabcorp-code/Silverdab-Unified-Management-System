import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Mail, CheckCircle, X } from "lucide-react-native";
import { useTheme } from "../../theme/ThemeContext";
import {
  getEmailPreference,
  saveEmailPreference,
} from "../../services/emailPreference";

type Props = {
  visible: boolean;
  username: string;
  onDone: () => void; // called after save (or if there's nothing to ask)
  // When true, always show the modal with the current preference pre-selected,
  // instead of auto-closing for users who already have one saved. Used when
  // opened manually from Settings, as opposed to the one-time post-login prompt.
  alwaysShow?: boolean;
};

export default function EmailPreferenceModal({
  visible,
  username,
  onDone,
  alwaysShow = false,
}: Props) {
  const { theme } = useTheme();
  const primary = theme.primary ?? "#4169E1";
  const { width: SCREEN_W } = useWindowDimensions();
  const isNarrow = SCREEN_W < 420;
  const MODAL_W = isNarrow ? SCREEN_W - 24 : Math.min(SCREEN_W * 0.9, 440);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<{
    silverdab: string;
    ocgbim: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Only true once we've confirmed the user actually has no preference saved
  // yet — keeps the modal from flashing on screen for users who already
  // have one, since that check requires an async fetch.
  const [shouldPrompt, setShouldPrompt] = useState(false);

  useEffect(() => {
    if (!visible || !username) {
      setShouldPrompt(false);
      return;
    }

    setLoading(true);
    setError("");
    getEmailPreference(username)
      .then((pref) => {
        if (!pref) {
          setError("Couldn't load email options.");
          return;
        }
        // Already has a preference saved — nothing to ask, close immediately,
        // without ever showing the modal. Doesn't apply when opened
        // deliberately from Settings (alwaysShow), where an existing
        // preference should be shown pre-selected instead.
        if (pref.current && !alwaysShow) {
          onDone();
          return;
        }
        setOptions(pref.options);
        setSelected(pref.current ?? pref.options.silverdab); // pre-select current, else default
        setShouldPrompt(true);
      })
      .finally(() => setLoading(false));
  }, [visible, username, alwaysShow]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await saveEmailPreference(username, selected);
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible && shouldPrompt} animationType="fade" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <View
          style={{
            width: MODAL_W,
            backgroundColor: theme.surface,
            borderRadius: 18,
            padding: 22,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 24,
            elevation: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: primary + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mail size={20} color={primary} />
            </View>

            <TouchableOpacity
              onPress={onDone}
              activeOpacity={0.7}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontFamily: "Outfit-SemiBold",
              fontSize: 17,
              color: theme.textActive,
              marginBottom: 6,
            }}
          >
            Where should we send updates?
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 12,
              color: theme.subtext,
              marginBottom: 18,
              lineHeight: 18,
            }}
          >
            Choose which email you'd like to receive request notifications
            on. You can change this anytime from Settings.
          </Text>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator size="small" color={primary} />
            </View>
          ) : options ? (
            <>
              {[
                { label: "Silverdab", value: options.silverdab },
                ...(options.ocgbim
                  ? [{ label: "OCGBIM", value: options.ocgbim }]
                  : []),
              ].map((opt) => {
                const isSelected = selected === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setSelected(opt.value)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 13,
                      borderWidth: 1.5,
                      borderColor: isSelected ? primary : theme.border,
                      backgroundColor: isSelected
                        ? primary + "10"
                        : theme.background,
                      borderRadius: 12,
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: isSelected ? primary : theme.border,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 11,
                      }}
                    >
                      {isSelected && (
                        <View
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 4.5,
                            backgroundColor: primary,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Outfit-SemiBold",
                          fontSize: 12,
                          color: theme.subtext,
                          marginBottom: 2,
                        }}
                      >
                        {opt.label}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 13,
                          color: theme.textActive,
                        }}
                      >
                        {opt.value}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {error ? (
                <Text
                  style={{
                    fontFamily: "Outfit",
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 4,
                    marginBottom: 4,
                  }}
                >
                  {error}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={handleConfirm}
                disabled={!selected || saving}
                activeOpacity={0.8}
                style={{
                  backgroundColor: primary,
                  borderRadius: 10,
                  paddingVertical: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 8,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <CheckCircle size={15} color="#fff" />
                )}
                <Text
                  style={{
                    fontFamily: "Outfit-SemiBold",
                    fontSize: 14,
                    color: "#fff",
                  }}
                >
                  {saving ? "Saving…" : "Confirm"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text
              style={{
                fontFamily: "Outfit",
                color: "#EF4444",
                fontSize: 12,
                textAlign: "center",
                paddingVertical: 12,
              }}
            >
              {error || "Something went wrong."}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
