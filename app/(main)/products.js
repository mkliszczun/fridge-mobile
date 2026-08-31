import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const TYPE_LABELS = {
  DAIRY: "Nabiał",
  MEAT: "Mięso",
  FISH: "Ryby",
  VEGETABLE: "Warzywa",
  FRUIT: "Owoce",
  BAKERY: "Pieczywo",
  DRY: "Produkty suche",
  BEVERAGE: "Napoje",
  OTHER: "Inne",
};

const extractLabel = (value) => {
  if (!value) return "Brak informacji";
  if (typeof value === "string") return TYPE_LABELS[value] || value;
  const label =
    value.name ||
    value.displayName ||
    value.label ||
    value.code ||
    value.symbol ||
    value.value;
  return TYPE_LABELS[label] || label || "Brak informacji";
};

const formatProductCount = (count) => {
  if (count === 1) return "1 produkt";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} produkty`;
  }
  return `${count} produktów`;
};

function ProductGlyph() {
  return (
    <View style={glyphStyles.wrap}>
      <View style={glyphStyles.lid} />
      <View style={glyphStyles.jar}>
        <View style={glyphStyles.label} />
      </View>
    </View>
  );
}

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
      colors={["#F4F3EB", "#E8EEE9", "#F7F1E5"]}
      locations={[0, 0.58, 1]}
      style={styles.background}
    >
      <StatusBar style="dark" />
      <View pointerEvents="none" style={[styles.glow, styles.glowTop]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowMiddle]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowBottom]} />

      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wróć"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.backLabel}>‹</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>KATALOG</Text>
              <Text style={styles.title}>Lista produktów</Text>
              <Text style={styles.headerSubtitle}>
                {loading ? "Sprawdzam katalog..." : formatProductCount(products.length)}
              </Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => loadProducts()}>
                  <Text style={styles.retryText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Otwieram katalog...</Text>
            </View>
          ) : error && !products.length ? (
            <View style={styles.errorSpacer} />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item, index) => String(item?.id ?? index)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => loadProducts(true)}
              ListHeaderComponent={products.length ? (
                <View style={styles.listHint}>
                  <Text style={styles.listHintDot}>•</Text>
                  <Text style={styles.listHintText}>Przeciągnij listę w dół, aby ją odświeżyć</Text>
                </View>
              ) : null}
              ListEmptyComponent={() => (
                <LinearGradient
                  colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                  style={styles.emptyBox}
                >
                  <View style={styles.emptyIconBadge}>
                    <ProductGlyph />
                  </View>
                  <Text style={styles.emptyTitle}>Katalog jest pusty</Text>
                  <Text style={styles.emptySubtitle}>
                    Dodaj pierwszy produkt z panelu administratora.
                  </Text>
                </LinearGradient>
              )}
              renderItem={({ item }) => (
                <LinearGradient
                  colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.card}
                >
                  <View style={styles.productIconBadge}>
                    <ProductGlyph />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.productName} numberOfLines={2}>
                      {item?.name || "Bez nazwy"}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={styles.metaPill}>
                        <Text style={styles.metaPillText}>{extractLabel(item?.productType)}</Text>
                      </View>
                      <Text style={styles.unitText}>{extractLabel(item?.defaultUnit)}</Text>
                    </View>
                  </View>
                </LinearGradient>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -80, right: -80, backgroundColor: "rgba(215,225,217,0.62)" },
  glowMiddle: { width: 280, height: 280, top: 330, left: -150, backgroundColor: "rgba(249,224,174,0.28)" },
  glowBottom: { width: 300, height: 300, bottom: -110, right: -130, backgroundColor: "rgba(189,214,211,0.42)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 15, paddingTop: 16, paddingBottom: 22 },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,250,0.76)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1, paddingTop: 1 },
  eyebrow: { color: "#7D9098", fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.4 },
  title: {
    color: "#151917",
    fontSize: 35,
    lineHeight: 40,
    fontWeight: "700",
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
  },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 4 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,247,244,0.90)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 18, padding: 14, marginBottom: 16 },
  errorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A4493E" },
  errorIconText: { color: "#FFFFFF", fontWeight: "800" },
  errorCopy: { flex: 1 },
  errorText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  retryText: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  errorSpacer: { flex: 1 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { color: "#667579", fontSize: 14 },
  listContent: { paddingBottom: 34, gap: 14 },
  listHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingBottom: 2 },
  listHintDot: { color: "#7D9098", fontSize: 18, lineHeight: 18 },
  listHintText: { color: "#78888C", fontSize: 12, lineHeight: 17 },
  emptyBox: { alignItems: "center", paddingHorizontal: 26, paddingVertical: 42, borderRadius: 28, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4 },
  emptyIconBadge: { width: 72, height: 72, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.86)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  emptyTitle: { color: "#172222", fontSize: 22, fontWeight: "700", marginTop: 17 },
  emptySubtitle: { maxWidth: 285, color: "#667579", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7 },
  card: {
    minHeight: 112,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  productIconBadge: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.84)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  cardCopy: { flex: 1, minWidth: 0 },
  productName: { color: "#151917", fontSize: 18, lineHeight: 23, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 9 },
  metaPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: "rgba(48,75,84,0.08)" },
  metaPillText: { color: "#476068", fontSize: 11, lineHeight: 14, fontWeight: "700" },
  unitText: { color: "#718287", fontSize: 12, lineHeight: 17 },
});

const glyphStyles = StyleSheet.create({
  wrap: { width: 34, height: 39, alignItems: "center" },
  lid: { width: 24, height: 4, borderRadius: 2, backgroundColor: "#173746", marginBottom: 2 },
  jar: { width: 29, height: 31, borderWidth: 2.2, borderColor: "#173746", borderRadius: 7, alignItems: "center", justifyContent: "center" },
  label: { width: 15, height: 8, borderRadius: 3, backgroundColor: "rgba(23,55,70,0.18)" },
});
