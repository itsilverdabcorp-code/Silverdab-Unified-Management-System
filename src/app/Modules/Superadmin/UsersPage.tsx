import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ADUser, UserPermissions } from "../../../../types";
import { useTheme } from "../../../theme/ThemeContext";
import {
  clearUsers,
  loadUsers,
  updateUserPermissions,
} from "../../../utils/users";

type EnrichedUser = ADUser & { hasLoggedIn: boolean };
type Props = { currentUser?: ADUser };
const fallbackUser: ADUser = {
  username: "hpatenio",
  displayName: "Henrick Patenio",
  email: "hpatenio@ocgbim.com",
  department: "IT",
  title: "Developer",
  phone: "",
  role: "superadmin",
  permissions: {
    itAccess: true,
    itInventory: true,
    consumables: true,
    tickets: true,
    officeSupplies: true,
  },
};

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> =
  {
    superadmin: { bg: "#1e3a5f", text: "#93c5fd", label: "Superadmin" },
    admin: { bg: "#3b1f5e", text: "#d8b4fe", label: "Admin" },
    employee: { bg: "#2d3748", text: "#cbd5e0", label: "Employee" },
  };

const POSITIVE = { bg: "#052e1b", text: "#4ade80" };
const STAT_ACCENTS = {
  superadmin: "#60a5fa",
  admin: "#c084fc",
  positive: "#4ade80",
};

function getRoleStyle(role: string) {
  return (
    ROLE_STYLES[role] ?? { bg: "#2d3748", text: "#cbd5e0", label: "Employee" }
  );
}

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function SuperadminDashboard({ currentUser }: Props) {
  const { theme } = useTheme();
  const activeUser = currentUser ?? fallbackUser;
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function fetchUsers(forceSync = false) {
    forceSync ? setSyncing(true) : setLoading(true);
    setError("");
    try {
      const { users: loadedUsers } = await loadUsers(forceSync, false);
      setUsers(loadedUsers);
    } catch (err) {
      setError("Failed to load dashboard data.");
      console.error(err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  const totalSuperadmin = users.filter((u) => u.role === "superadmin").length;
  const totalAdmin = users.filter((u) => u.role === "admin").length;
  const totalEmployee = users.filter((u) => u.role === "employee").length;
  const totalLoggedIn = users.filter((u) => u.hasLoggedIn).length;

  if (loading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <ActivityIndicator color={theme.iconActive} size="large" />
        <Text className="mt-3 text-sm" style={{ color: theme.subtext }}>
          Loading superadmin overview...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: theme.background }}
      >
        <Text className="text-sm" style={{ color: theme.dangerText }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <View className="p-5 pb-3">
        <Text className="text-xl font-bold" style={{ color: theme.text }}>
          Superadmin Dashboard
        </Text>
        <Text className="text-xs mt-1" style={{ color: theme.subtext }}>
          Overview for {activeUser.displayName || activeUser.username}
        </Text>
      </View>

      <View className="flex-row gap-2.5 px-5 mb-4">
        {[
          { label: "Users", value: users.length, color: theme.text },
          {
            label: "Superadmins",
            value: totalSuperadmin,
            color: STAT_ACCENTS.superadmin,
          },
          { label: "Admins", value: totalAdmin, color: STAT_ACCENTS.admin },
          {
            label: "Logged In",
            value: totalLoggedIn,
            color: STAT_ACCENTS.positive,
          },
        ].map((stat) => (
          <View
            key={stat.label}
            className="flex-1 rounded-xl p-3"
            style={{
              backgroundColor: theme.bgActive,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text className="text-[10px] mb-1" style={{ color: theme.subtext }}>
              {stat.label}
            </Text>
            <Text className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>

      <View className="px-5 mb-4">
        <View
          className="rounded-2xl p-4"
          style={{
            backgroundColor: theme.bgActive,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text
            className="text-sm font-semibold mb-2"
            style={{ color: theme.text }}
          >
            Quick actions
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => void fetchUsers(true)}
              disabled={syncing}
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: theme.iconActive }}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={theme.primaryText} />
              ) : (
                <Text
                  className="text-sm font-semibold"
                  style={{ color: theme.primaryText }}
                >
                  Sync AD
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{
                backgroundColor: theme.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: theme.text }}
              >
                Manage Users
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View className="px-5 flex-1">
        <Text
          className="text-sm font-semibold mb-2"
          style={{ color: theme.text }}
        >
          Recent accounts
        </Text>
        {users.slice(0, 5).map((user) => {
          const role = getRoleStyle(user.role);
          return (
            <View
              key={user.username}
              className="flex-row items-center rounded-xl p-3 mb-2"
              style={{
                backgroundColor: theme.bgActive,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: role.bg }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: role.text }}
                >
                  {getInitials(user.displayName || user.username)}
                </Text>
              </View>
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold"
                  style={{ color: theme.text }}
                >
                  {user.displayName || user.username}
                </Text>
                <Text className="text-xs" style={{ color: theme.subtext }}>
                  {user.role} · {user.department || "No department"}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function UsersPage({ currentUser }: Props) {
  const { theme } = useTheme();
  const activeUser = currentUser ?? fallbackUser;

  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [filtered, setFiltered] = useState<EnrichedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lastSynced, setLastSynced] = useState<string>("");
  const [clearing, setClearing] = useState(false);
  const [permissionUser, setPermissionUser] = useState<EnrichedUser | null>(
    null,
  );
  const [savingPermissions, setSavingPermissions] = useState(false);

  const PERMISSION_LABELS: {
    key: keyof EnrichedUser["permissions"];
    label: string;
  }[] = [
    { key: "itAccess", label: "IT Access" },
    { key: "officeSupplies", label: "Office Supplies" },
  ];

  const [roleFilter, setRoleFilter] = useState<
    "all" | "superadmin" | "admin" | "employee"
  >("all");

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    let result = users;
    if (roleFilter !== "all")
      result = result.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.displayName?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.department?.toLowerCase().includes(q),
      );
    }
    setFiltered(result);
  }, [search, roleFilter, users]);

  async function fetchUsers(forceSync = false, resetRoles = false) {
    forceSync ? setSyncing(true) : setLoading(true);
    setError("");
    try {
      const { users: loadedUsers, synced } = await loadUsers(
        forceSync,
        resetRoles,
      );
      setUsers(loadedUsers);
      if (synced) setLastSynced(new Date().toLocaleString());
    } catch (err) {
      setError("Failed to load users. Check backend connection.");
      console.error(err);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  async function savePermissions(
    user: EnrichedUser,
    permissions: UserPermissions,
  ) {
    setSavingPermissions(true);
    try {
      await updateUserPermissions(user.username, permissions);
      setUsers((prev) =>
        prev.map((u) =>
          u.username === user.username ? { ...u, permissions } : u,
        ),
      );
      setPermissionUser(null);
    } catch (err) {
      console.error("Failed to save permissions:", err);
    } finally {
      setSavingPermissions(false);
    }
  }

  async function handleClearAndResync() {
    setClearing(true);
    try {
      await clearUsers();
      // New users always come back as "employee" — resetRoles just forces
      // any leftover rows back to employee too, per your instruction.
      await fetchUsers(true, true);
    } catch (err) {
      console.error("Clear error:", err);
    } finally {
      setClearing(false);
    }
  }

  const totalSuperadmin = users.filter((u) => u.role === "superadmin").length;
  const totalAdmin = users.filter((u) => u.role === "admin").length;
  const totalEmployee = users.filter((u) => u.role === "employee").length;
  const totalLoggedIn = users.filter((u) => u.hasLoggedIn).length;

  const roleTabs: Array<{ key: typeof roleFilter; label: string }> = [
    { key: "all", label: `All (${users.length})` },
    { key: "superadmin", label: `Superadmin (${totalSuperadmin})` },
    { key: "admin", label: `Admin (${totalAdmin})` },
    { key: "employee", label: `Employee (${totalEmployee})` },
  ];

  if (loading) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <ActivityIndicator color={theme.iconActive} size="large" />
        <Text className="mt-3 text-sm" style={{ color: theme.subtext }}>
          Fetching users from Active Directory...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: theme.background }}
      >
        <View
          style={{
            backgroundColor: theme.dangerBg,
            borderWidth: 1,
            borderColor: theme.dangerBorder,
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: theme.dangerText,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            ⚠ {error}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => fetchUsers()}
          className="rounded-xl px-5 py-2.5"
          style={{ backgroundColor: theme.iconActive }}
        >
          <Text
            style={{
              color: theme.primaryText,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      {/* Header */}
      <View className="p-5 pb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-xl font-bold" style={{ color: theme.text }}>
            User Accounts
          </Text>
          <Text className="text-xs mt-0.5" style={{ color: theme.subtext }}>
            {lastSynced
              ? `Last synced from AD · ${lastSynced}`
              : "Loaded from MySQL · ocgbim.com"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => fetchUsers(true)}
          disabled={syncing}
          className="flex-row items-center gap-1.5 rounded-xl px-3 py-1.5"
          style={{
            backgroundColor: theme.bgActive,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={theme.iconActive} />
          ) : (
            <Text style={{ fontSize: 14 }}>🔄</Text>
          )}
          <Text className="text-xs font-semibold" style={{ color: theme.text }}>
            {syncing ? "Syncing..." : "Sync AD"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stat cards */}
      <View className="flex-row gap-2.5 px-5 mb-4">
        {[
          { label: "Total", value: users.length, color: theme.text },
          {
            label: "Superadmin",
            value: totalSuperadmin,
            color: STAT_ACCENTS.superadmin,
          },
          { label: "Admin", value: totalAdmin, color: STAT_ACCENTS.admin },
          {
            label: "Logged In",
            value: totalLoggedIn,
            color: STAT_ACCENTS.positive,
          },
        ].map((stat) => (
          <View
            key={stat.label}
            className="flex-1 rounded-xl p-3"
            style={{
              backgroundColor: theme.bgActive,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text className="text-[10px] mb-1" style={{ color: theme.subtext }}>
              {stat.label}
            </Text>
            <Text className="text-2xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View className="px-5 mb-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, username, department…"
          placeholderTextColor={theme.subtext}
          className="rounded-xl px-3.5 py-2.5 text-sm"
          style={{
            backgroundColor: theme.bgActive,
            borderWidth: 1,
            borderColor: theme.border,
            color: theme.text,
          }}
        />
      </View>

      {/* Role tabs */}
      <View className="flex-row gap-1.5 px-5 mb-3">
        {roleTabs.map((tab) => {
          const active = roleFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setRoleFilter(tab.key)}
              className="px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: active ? theme.iconActive : theme.bgActive,
                borderWidth: 1,
                borderColor: active ? theme.iconActive : theme.border,
              }}
            >
              <Text
                className="text-[11px] font-semibold"
                style={{ color: active ? theme.primaryText : theme.subtext }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* User list */}
      {filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm" style={{ color: theme.subtext }}>
            No users found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.username}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 32,
            gap: 8,
          }}
          renderItem={({ item }) => {
            const role = getRoleStyle(item.role);
            const isSuperadmin = activeUser.role === "superadmin";

            const card = (
              <View
                className="rounded-2xl p-3.5 flex-row items-center gap-3"
                style={{
                  backgroundColor: theme.bgActive,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                {/* Avatar */}
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: role.bg }}
                >
                  <Text
                    className="text-sm font-bold"
                    style={{ color: role.text }}
                  >
                    {getInitials(item.displayName || item.username)}
                  </Text>
                </View>

                {/* Info */}
                <View className="flex-1">
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: theme.text }}
                  >
                    {item.displayName || item.username}
                  </Text>
                  <Text
                    className="text-xs mt-0.5"
                    style={{ color: theme.subtext }}
                  >
                    {item.username} · {item.department || "No department"}
                  </Text>

                  <View className="flex-row flex-wrap gap-1 mt-1.5">
                    {PERMISSION_LABELS.map(({ key, label }) => {
                      const granted = item.permissions?.[key] ?? false;
                      return (
                        <View
                          key={key}
                          className="rounded-full px-2 py-0.5"
                          style={{
                            backgroundColor: granted
                              ? POSITIVE.bg
                              : theme.surfaceRaised,
                          }}
                        >
                          <Text
                            className="text-[10px] font-semibold"
                            style={{
                              color: granted ? POSITIVE.text : theme.subtext,
                            }}
                          >
                            {granted ? "✓ " : "✗ "}
                            {label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Badges */}
                <View className="items-end gap-1">
                  <View
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: role.bg }}
                  >
                    <Text
                      className="text-[10px] font-semibold"
                      style={{ color: role.text }}
                    >
                      {role.label}
                    </Text>
                  </View>
                  <View
                    className="rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: item.hasLoggedIn
                        ? POSITIVE.bg
                        : theme.surfaceRaised,
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold"
                      style={{
                        color: item.hasLoggedIn ? POSITIVE.text : theme.subtext,
                      }}
                    >
                      {item.hasLoggedIn ? "Logged in" : "Never logged in"}
                    </Text>
                  </View>
                  {isSuperadmin && (
                    <Text
                      className="text-[10px] mt-0.5"
                      style={{ color: theme.subtext }}
                    >
                      Tap to edit →
                    </Text>
                  )}
                </View>
              </View>
            );

            if (!isSuperadmin) return card;

            return (
              <TouchableOpacity
                key={item.username}
                onPress={() => setPermissionUser(item)}
                activeOpacity={0.75}
              >
                {card}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Permission modal */}
      {permissionUser && (
        <View
          className="absolute inset-0 items-center justify-center p-6"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <View
            className="rounded-2xl p-6 w-full max-w-[400px]"
            style={{
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text
              className="text-base font-bold mb-1"
              style={{ color: theme.text }}
            >
              Edit Permissions
            </Text>
            <Text className="text-xs mb-5" style={{ color: theme.subtext }}>
              {permissionUser.displayName} · {permissionUser.username}
            </Text>

            {(["itAccess", "officeSupplies"] as const).map((key) => {
              const labels: Record<
                string,
                { label: string; description: string }
              > = {
                itAccess: {
                  label: "IT Access",
                  description:
                    "Shows Tickets, IT Inventory, Consumables under IT section",
                },
                officeSupplies: {
                  label: "Office Supplies",
                  description:
                    "Shows full Office Supplies section in the sidebar",
                },
              };
              const granted = permissionUser.permissions?.[key] ?? false;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() =>
                    setPermissionUser((prev) =>
                      prev
                        ? {
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              [key]: !granted,
                            },
                          }
                        : prev,
                    )
                  }
                  className="flex-row items-center justify-between rounded-xl p-3.5 mb-2.5"
                  style={{
                    backgroundColor: theme.bgActive,
                    borderWidth: 1,
                    borderColor: granted ? "#22c55e" : theme.border,
                  }}
                >
                  <View className="flex-1 pr-3">
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: theme.text }}
                    >
                      {labels[key].label}
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{ color: theme.subtext }}
                    >
                      {labels[key].description}
                    </Text>
                  </View>
                  <View
                    className="w-11 h-6 rounded-full justify-center px-1"
                    style={{
                      backgroundColor: granted ? "#22c55e" : theme.border,
                      alignItems: granted ? "flex-end" : "flex-start",
                    }}
                  >
                    <View className="w-[18px] h-[18px] rounded-full bg-white" />
                  </View>
                </TouchableOpacity>
              );
            })}

            <View className="flex-row gap-2.5 mt-2">
              <TouchableOpacity
                onPress={() => setPermissionUser(null)}
                className="flex-1 rounded-xl py-3 items-center"
                style={{
                  backgroundColor: theme.bgActive,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: theme.text }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  savePermissions(permissionUser, permissionUser.permissions)
                }
                disabled={savingPermissions}
                className="flex-1 rounded-xl py-3 items-center"
                style={{ backgroundColor: theme.iconActive }}
              >
                {savingPermissions ? (
                  <ActivityIndicator size="small" color={theme.primaryText} />
                ) : (
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: theme.primaryText }}
                  >
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
