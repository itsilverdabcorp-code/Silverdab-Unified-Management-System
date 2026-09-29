import { Plus, Search } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../../theme/ThemeContext"; // adjust to your actual path
import { ADUser } from "../../../../../types"; // adjust to your actual path

const API_URL = "https://api.silvergraph.ai";
const TOKEN_KEY = "AD_AUTH_TOKEN";

type SheetRow = {
  refNo: string;
  name: string;
  department: string;
  issuedNo: string;
  date: string | null;
  deliveredBy: { name: string; date: string | null };
  approvedBy: { name: string; date: string | null };
};

const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const fmtDate = (v: string | null) => {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  if (!isoOk(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  return `${m}/${d}/${y}`;
};

type Props = {
  user?: ADUser;
  onEdit?: (refNo: string) => void;
  onView?: (refNo: string) => void;
  onBack?: () => void;
  onNew?: () => void;
};

export default function SavedFormsPage({ user, onEdit, onView, onBack, onNew }: Props) {
  const { theme } = useTheme();
  console.log("SavedFormsPage handlers:", { onNew: !!onNew, onView: !!onView, onEdit: !!onEdit });
  const [sheets, setSheets] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error("Your session has expired. Please log in again.");
      const res = await fetch(`${API_URL}/it/eia-sign-sheets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${detail.slice(0, 120)}`);
      }
      const data = await res.json();
      setSheets(data.sheets ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load saved forms.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sheets;
    return sheets.filter(
      (s) =>
        s.refNo?.toLowerCase().includes(q) ||
        s.name?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q) ||
        s.issuedNo?.toLowerCase().includes(q),
    );
  }, [sheets, query]);

  const S = {
    input: {
      fontFamily: "Outfit",
      fontSize: 13.5,
      color: theme.textActive,
      borderWidth: 1,
      borderColor: theme.navBorder,
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 9,
      backgroundColor: theme.surface,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
    } as const,
  };

  const COLS = [
    { key: "refNo", label: "Ref. No.", flex: 1.6 },
    { key: "name", label: "Name", flex: 1.6 },
    { key: "department", label: "Department", flex: 1.2 },
    { key: "issuedNo", label: "Issued No.", flex: 1 },
    { key: "date", label: "Date", flex: 1 },
    { key: "delivered", label: "Delivered", flex: 1.4 },
    { key: "approved", label: "Approved", flex: 1.4 },
    { key: "actions", label: "", flex: 1.4 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* top bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.navBorder,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ fontFamily: "Outfit-Bold", fontSize: 20, color: theme.textActive }}>
            Equipment Issuance Agreement (EIA) Sign Sheets
          </Text>
          <Text style={{ fontFamily: "Outfit", fontSize: 12.5, color: theme.textInactive }}>
            Equipment Issuance Agreement · saved records
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, width: 260 }}>
          <Search size={15} color={theme.textInactive} style={{ marginRight: -28, marginLeft: 8, zIndex: 1 }} />
          <TextInput
            style={[S.input, { flex: 1, paddingLeft: 30 }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search ref no, name, dept…"
            placeholderTextColor={theme.textInactive}
          />
        </View>

        <TouchableOpacity
          onPress={onNew}
          activeOpacity={0.8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            paddingHorizontal: 13,
            paddingVertical: 9,
            borderRadius: 8,
            backgroundColor: theme.iconActive,
          }}
        >
          <Plus size={14} color="#fff" />
          <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#fff" }}>New Form</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.iconActive} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
          <Text style={{ fontFamily: "Outfit", color: theme.dangerText, textAlign: "center" }}>{error}</Text>
        </View>
      ) : (
                <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
          <View style={{ flex: 1, padding: 20 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* header row */}
              <View
                style={{
                  flexDirection: "row",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                  backgroundColor: theme.surfaceRaised,
                }}
              >
                {COLS.map((c) => (
                  <Text
                    key={c.key}
                    style={{
                      flex: c.flex,
                      minWidth: c.key === "actions" ? 160 : 110,
                      fontFamily: "Outfit-medium",
                      fontSize: 11,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: theme.subtext,
                    }}
                  >
                    {c.label}
                  </Text>
                ))}
              </View>

              {filtered.length === 0 ? (
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 13,
                    color: theme.subtext,
                    padding: 20,
                    textAlign: "center",
                    backgroundColor: theme.surface,
                  }}
                >
                  No saved sign sheets found.
                </Text>
              ) : (
                filtered.map((s, index) => {
                  const cell = {
                    minWidth: 110,
                    fontFamily: "Outfit",
                    fontSize: 12.5,
                    color: theme.text,
                  } as const;
                  return (
                    <TouchableOpacity
                      key={s.refNo}
                      activeOpacity={0.7}
                      onPress={() => onEdit?.(s.refNo)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderBottomWidth: index === filtered.length - 1 ? 0 : 1,
                        borderBottomColor: theme.border,
                        backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
                        ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
                      }}
                    >
                      <Text style={[cell, { flex: 1.6, fontFamily: "Outfit-medium" }]}>{s.refNo}</Text>
                      <Text style={[cell, { flex: 1.6 }]}>{s.name || "—"}</Text>
                      <Text style={[cell, { flex: 1.2 }]}>{s.department || "—"}</Text>
                      <Text style={[cell, { flex: 1 }]}>{s.issuedNo || "—"}</Text>
                      <Text style={[cell, { flex: 1 }]}>{fmtDate(s.date)}</Text>
                      <Text style={[cell, { flex: 1.4 }]}>{s.deliveredBy?.name || "—"}</Text>
                      <Text style={[cell, { flex: 1.4 }]}>{s.approvedBy?.name || "—"}</Text>
                      <View style={{ flex: 1.4, minWidth: 160, flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => onView?.(s.refNo)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 7,
                            borderWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.text }}>View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onEdit?.(s.refNo)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 7,
                            backgroundColor: theme.primary,
                          }}
                        >
                          <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.primaryText }}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}