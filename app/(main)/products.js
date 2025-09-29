import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const extractLabel = (value) => {
  if (!value) return "(brak)";
  if (typeof value === "string") return value;
  return (
    value.name ||
    value.displayName ||
    value.label ||
    value.code ||
    value.symbol ||
    value.value ||
    "(brak)"
  );
};

export default function ProductsCatalogScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadProducts = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products`, {
        method: "GET",
        headers,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      setProducts(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || "Nie udało się pobrać produktów");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headers]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <LinearGradient
      colors={["#FFF8E6", "#FFE19A", "#FFF3C9"]}
      locations={[0, 0.55, 1]}
      style={styles.background}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backLabel}>←</Text>
          </Pressable>
          <Text style={styles.title}>Katalog produktów</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => loadProducts()}>
              <Text style={styles.retryText}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color="#1F6FEB" />
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => loadProducts(true)}
            ListEmptyComponent={() => (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Brak produktów</Text>
                <Text style={styles.emptySubtitle}>Dodaj produkt, aby pojawił się na liście.</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.productName}>{item?.name ?? "(bez nazwy)"}</Text>
                <Text style={styles.metaText}>Typ: {extractLabel(item?.productType)}</Text>
                <Text style={styles.metaText}>Jednostka: {extractLabel(item?.defaultUnit)}</Text>
              </View>
            )}
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  backLabel: { fontSize: 20, color: "#4A3B1B" },
  title: { fontSize: 24, fontWeight: "700", color: "#4A3B1B" },
  errorBanner: {
    backgroundColor: "rgba(214,69,80,0.12)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { color: "#B71C1C", fontWeight: "600", marginBottom: 6 },
  retryText: { color: "#1F6FEB", fontWeight: "700" },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 32, gap: 14 },
  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#3F3116" },
  emptySubtitle: { fontSize: 13, color: "#6F5833" },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    gap: 6,
  },
  productName: { fontSize: 16, fontWeight: "700", color: "#3F3116" },
  metaText: { fontSize: 13, color: "#6F5833" },
});
