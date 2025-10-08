import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Modal,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const formatAmount = (value) => {
  if (value == null) return "-";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num % 1 === 0 ? String(num) : num.toFixed(2);
};

const getLabel = (value) => {
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

const dateStatus = (value) => {
  if (!value) return "normal";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "normal";

  const today = new Date();
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diff = (target - today) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 1) return "warning";
  return "normal";
};

export default function FridgeScreen() {
  const router = useRouter();
  const { token, activeFridge } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [contextVisible, setContextVisible] = useState(false);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadItems = useCallback(async (showRefreshing = false) => {
    if (!activeFridge) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fridge-items/${activeFridge}`, {
        method: "GET",
        headers,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      setItems(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || "Nie udało się pobrać produktów w lodówce");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headers, activeFridge]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const openContextMenu = useCallback((item) => {
    setSelectedItem(item);
    setContextVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextVisible(false);
    setSelectedItem(null);
  }, []);

  const handleAction = useCallback((action) => {
    closeContextMenu();
    switch (action) {
      case "use":
        Alert.alert("Użyj", "Funkcja do zaimplementowania");
        break;
      case "throw":
        Alert.alert("Wyrzuć", "Funkcja do zaimplementowania");
        break;
      case "amount":
        Alert.alert("Zmień ilość", "Funkcja do zaimplementowania");
        break;
      case "date":
        Alert.alert("Zmień datę przydatności", "Funkcja do zaimplementowania");
        break;
      default:
        break;
    }
  }, [closeContextMenu]);

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
          <Text style={styles.title}>Twoja lodówka</Text>
        </View>

        {!activeFridge ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Brak aktywnej lodówki</Text>
            <Text style={styles.warningSubtitle}>Wybierz lodówkę, aby zobaczyć jej zawartość.</Text>
            <Pressable style={styles.warningAction} onPress={() => router.push("/fridges")}> 
              <Text style={styles.warningActionText}>Przejdź do listy lodówek</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => loadItems()}>
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
            data={items}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => loadItems(true)}
            ListEmptyComponent={() => (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Lodówka jest pusta</Text>
                <Text style={styles.emptySubtitle}>Dodaj produkt, aby pojawił się na liście.</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const status = dateStatus(item?.bestBeforeDate);
              return (
                <Pressable
                  onLongPress={() => openContextMenu(item)}
                  delayLongPress={1000}
                  android_ripple={{ color: "rgba(0,0,0,0.05)" }}
                  style={[
                    styles.card,
                    status === "expired" && styles.cardExpired,
                    status === "warning" && styles.cardWarning,
                  ]}
                >
                  <Text style={styles.productName}>
                    {item?.customName || item?.name || item?.product?.name || item?.productName || "(bez nazwy)"}
                  </Text>
                  <Text style={styles.metaText}>
                    Ilość: {formatAmount(item?.amount)} {getLabel(item?.unit)}
                  </Text>
                  <Text style={styles.metaText}>
                    Ważne do: {item?.bestBeforeDate || "brak informacji"}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
      <Modal transparent visible={contextVisible} animationType="fade" onRequestClose={closeContextMenu}>
        <View style={styles.contextOverlay}>
          <Pressable style={styles.contextBackdrop} onPress={closeContextMenu} />
          <View style={styles.contextCard}>
            <Text style={styles.contextTitle}>
              {selectedItem?.customName || selectedItem?.name || selectedItem?.product?.name || "Produkt"}
            </Text>
            <Pressable style={styles.contextAction} onPress={() => handleAction("use")}>
              <Text style={styles.contextActionText}>Użyj</Text>
            </Pressable>
            <Pressable style={styles.contextAction} onPress={() => handleAction("throw")}>
              <Text style={styles.contextActionText}>Wyrzuć</Text>
            </Pressable>
            <Pressable style={styles.contextAction} onPress={() => handleAction("amount")}>
              <Text style={styles.contextActionText}>Zmień ilość</Text>
            </Pressable>
            <Pressable style={styles.contextAction} onPress={() => handleAction("date")}>
              <Text style={styles.contextActionText}>Zmień datę przydatności</Text>
            </Pressable>
            <Pressable style={[styles.contextAction, styles.contextCancel]} onPress={closeContextMenu}>
              <Text style={[styles.contextActionText, styles.contextCancelText]}>Anuluj</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  warningBox: {
    backgroundColor: "rgba(255,207,0,0.15)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  warningTitle: { fontSize: 16, fontWeight: "700", color: "#6A4E00" },
  warningSubtitle: { fontSize: 13, color: "#6A4E00", marginTop: 4 },
  warningAction: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(31,111,235,0.15)",
    alignItems: "center",
  },
  warningActionText: { color: "#1F6FEB", fontWeight: "700" },
  errorBanner: {
    backgroundColor: "rgba(214,69,80,0.12)",
    borderRadius: 12,
    padding: 12,
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
    gap: 4,
  },
  cardWarning: {
    backgroundColor: "rgba(255, 200, 0, 0.18)",
    borderColor: "rgba(255, 200, 0, 0.4)",
    borderWidth: 1,
  },
  cardExpired: {
    backgroundColor: "rgba(255, 82, 82, 0.18)",
    borderColor: "rgba(255, 82, 82, 0.45)",
    borderWidth: 1,
  },
  productName: { fontSize: 16, fontWeight: "700", color: "#3F3116" },
  metaText: { fontSize: 13, color: "#6F5833" },
  contextOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    position: "relative",
  },
  contextBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  contextCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 8,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  contextTitle: { fontSize: 16, fontWeight: "700", color: "#3F3116", marginBottom: 4 },
  contextAction: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(31,111,235,0.08)",
  },
  contextActionText: { fontWeight: "700", color: "#1F6FEB" },
  contextCancel: { backgroundColor: "rgba(0,0,0,0.05)", marginTop: 4 },
  contextCancelText: { color: "#333" },
});
