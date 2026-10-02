import AsyncStorage from "@react-native-async-storage/async-storage";
import { Eye, Pencil, Plus, RefreshCw, Search } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { ADUser } from "../../../../types"; // adjust to your actual path
import { useTheme } from "../../../theme/ThemeContext"; // adjust to your actual path

/* ============================================================================
   Saved Statements of Account (FPD) — list of everything saved via
   POST /fpd/statements. Pick one to View (read-only) or Edit, or start a New one.
   ============================================================================ */

const API_URL = "https://api.silvergraph.ai";
const TOKEN_KEY = "AD_AUTH_TOKEN";

type SavedStatement = {
  id: string;
  statementNo: string;
  date: string | null;
  billToName: string;
  currency: string;
  totalAmount: number;
  preparedBy: string;
  createdBy: string | null;
  createdAt: string;
};

const money = (cur: string, n: number) =>
  `${cur || "₱"}${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (v: string | null) => {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

type Props = {
  user: ADUser;
  onBack: () => void; // back to the form
  onView: (statementNo: string) => void;
  onEdit: (statementNo: string) => void;
  onNew: () => void;
};

export default function SavedStatementsPage({ onBack, onView, onEdit, onNew }: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 760;

  const [items, setItems] = useState<SavedStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error("Your session has expired. Please log in again.");
      const res = await fetch(`${API_URL}/fpd/statements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setItems(data.statements ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (s) =>
        s.statementNo.toLowerCase().includes(q) ||
        (s.billToName || "").toLowerCase().includes(q) ||
        (s.preparedBy || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const Btn = ({
    label,
    onPress,
    Icon,
    primary,
    small,
  }: {
    label: string;
    onPress: () => void;
    Icon?: any;
    primary?: boolean;
    small?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: small ? 10 : 15,
        paddingVertical: small ? 6 : 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: primary ? theme.iconActive : theme.navBorder,
        backgroundColor: primary ? theme.iconActive : theme.surface,
      }}
    >
      {Icon ? <Icon size={small ? 14 : 15} color={primary ? "#fff" : theme.textActive} /> : null}
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: small ? 12 : 13.5,
          color: primary ? "#fff" : theme.textActive,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const cell = (flex: number, align: "left" | "right" = "left") =>
    ({ flex, textAlign: align, paddingRight: 10 }) as const;

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface }}>
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
            Saved Statements
          </Text>
          <Text style={{ fontFamily: "Outfit", fontSize: 12.5, color: theme.textInactive }}>
            Statement of Account (FPD) · {items.length} saved
          </Text>
        </View>

        <Btn label="Refresh" Icon={RefreshCw} onPress={load} />
        <Btn label="New statement" Icon={Plus} onPress={onNew} primary />
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        {/* search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: theme.navBorder,
            borderRadius: 8,
            paddingHorizontal: 11,
            backgroundColor: theme.surface,
            marginBottom: 14,
            maxWidth: 460,
          }}
        >
          <Search size={15} color={theme.textInactive} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by statement no., client or preparer"
            placeholderTextColor={theme.textInactive}
            style={{
              flex: 1,
              paddingVertical: 9,
              fontFamily: "Outfit",
              fontSize: 13.5,
              color: theme.textActive,
              ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
            }}
          />
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={theme.iconActive} />
          </View>
        ) : error ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.navBorder,
              borderRadius: 12,
              padding: 20,
              backgroundColor: theme.bgHover,
            }}
          >
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 14, color: theme.textActive }}>
              Couldn't load statements
            </Text>
            <Text style={{ fontFamily: "Outfit", fontSize: 12.5, color: theme.textInactive, marginTop: 4 }}>
              {error}
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.navBorder,
              borderStyle: "dashed",
              borderRadius: 12,
              padding: 40,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 14, color: theme.textActive }}>
              {items.length === 0 ? "No statements saved yet" : "No matches"}
            </Text>
            <Text style={{ fontFamily: "Outfit", fontSize: 12.5, color: theme.textInactive, marginTop: 4, marginBottom: 14 }}>
              {items.length === 0
                ? "Create your first Statement of Account."
                : "Try a different search term."}
            </Text>
            {items.length === 0 ? <Btn label="New statement" Icon={Plus} onPress={onNew} primary /> : null}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.navBorder,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* header row */}
            {!compact && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: theme.bgHover,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.navBorder,
                }}
              >
                {[
                  ["STATEMENT NO.", 1.3, "left"],
                  ["DATE", 1, "left"],
                  ["BILLED TO", 2.4, "left"],
                  ["TOTAL", 1.3, "right"],
                  ["PREPARED BY", 1.6, "left"],
                ].map(([h, f, a]) => (
                  <Text
                    key={h as string}
                    style={[
                      { fontFamily: "Outfit-Bold", fontSize: 10.5, letterSpacing: 0.7, color: theme.textInactive },
                      cell(f as number, a as "left" | "right"),
                    ]}
                  >
                    {h as string}
                  </Text>
                ))}
                <View style={{ width: 150 }} />
              </View>
            )}

            {filtered.map((s, i) => (
              <View
                key={s.id}
                style={{
                  flexDirection: compact ? "column" : "row",
                  alignItems: compact ? "stretch" : "center",
                  gap: compact ? 6 : 0,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                  borderBottomColor: theme.navBorder,
                }}
              >
                {compact ? (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: "Outfit-Bold", fontSize: 13.5, color: theme.iconActive }}>
                        {s.statementNo}
                      </Text>
                      <Text style={{ fontFamily: "Outfit-Bold", fontSize: 13.5, color: theme.textActive }}>
                        {money(s.currency, s.totalAmount)}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.textActive }}>
                      {s.billToName}
                    </Text>
                    <Text style={{ fontFamily: "Outfit", fontSize: 12, color: theme.textInactive }}>
                      {fmtDate(s.date)}
                      {s.preparedBy ? ` · ${s.preparedBy}` : ""}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[{ fontFamily: "Outfit-Bold", fontSize: 13, color: theme.iconActive }, cell(1.3)]}>
                      {s.statementNo}
                    </Text>
                    <Text style={[{ fontFamily: "Outfit", fontSize: 13, color: theme.textActive }, cell(1)]}>
                      {fmtDate(s.date)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[{ fontFamily: "Outfit", fontSize: 13, color: theme.textActive }, cell(2.4)]}
                    >
                      {s.billToName}
                    </Text>
                    <Text style={[{ fontFamily: "Outfit-Bold", fontSize: 13, color: theme.textActive }, cell(1.3, "right")]}>
                      {money(s.currency, s.totalAmount)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[{ fontFamily: "Outfit", fontSize: 13, color: theme.textInactive }, cell(1.6)]}
                    >
                      {s.preparedBy}
                    </Text>
                  </>
                )}
                <View
                  style={{
                    width: compact ? undefined : 150,
                    flexDirection: "row",
                    gap: 6,
                    justifyContent: compact ? "flex-start" : "flex-end",
                    marginTop: compact ? 4 : 0,
                  }}
                >
                  <Btn label="View" Icon={Eye} small onPress={() => onView(s.statementNo)} />
                  <Btn label="Edit" Icon={Pencil} small onPress={() => onEdit(s.statementNo)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
