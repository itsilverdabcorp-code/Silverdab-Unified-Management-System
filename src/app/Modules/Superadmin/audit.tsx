import { StyleSheet, Text, View } from "react-native";

export default function AuditPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audit Trail</Text>
      <Text style={styles.body}>
        This page is ready for your audit trail content.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  body: { fontSize: 14, color: "#64748b" },
});
