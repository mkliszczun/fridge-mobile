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
  ActionSheetIOS,
  Platform,
  TextInput,
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
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amountModalValue, setAmountModalValue] = useState("1");
  const [amountModalItem, setAmountModalItem] = useState(null);

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

  const discardItem = useCallback(
    async (item) => {
      if (!item) return;
      const itemId = item?.id || item?.itemId || item?.fridgeItemId;
      if (!itemId) {
        Alert.alert("Błąd", "Nie udało się zidentyfikować produktu do wyrzucenia.");
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/fridge-items/${itemId}/discard`, {
          method: "POST",
          headers,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message = payload?.message || `HTTP ${res.status}`;
          throw new Error(message);
        }
        Alert.alert("Wyrzucono", payload?.message || "Produkt został oznaczony jako wyrzucony.");
        await loadItems();
      } catch (err) {
        Alert.alert("Błąd", err.message || "Nie udało się wyrzucić produktu.");
      }
    },
    [headers, loadItems]
  );

  const consumeItem = useCallback(
    async (item, value) => {
      if (!item) return;
      const itemId = item?.id || item?.itemId || item?.fridgeItemId;
      if (!itemId) {
        Alert.alert("Błąd", "Nie udało się zidentyfikować produktu.");
        return;
      }
      const amount = Number(String(value).replace(",", "."));
      if (!amount || !Number.isFinite(amount) || amount <= 0) {
        Alert.alert("Błędna ilość", "Podaj poprawną dodatnią wartość.");
        return;
      }
      const available = Number(item?.amount) || 0;
      if (amount > available) {
        Alert.alert("Błędna ilość", `Dostępna ilość to ${formatAmount(available)}.`);
        return;
      }

      try {
        const consumeAll = amount === available;
        const endpoint = consumeAll
          ? `${API_BASE_URL}/api/fridge-items/${itemId}/consume`
          : `${API_BASE_URL}/api/fridge-items/${itemId}/use`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          ...(!consumeAll ? { body: JSON.stringify({ amountUsed: amount }) } : {}),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message = payload?.message || `HTTP ${res.status}`;
          throw new Error(message);
        }

        Alert.alert("Sukces", payload?.message || "Produkt został wykorzystany.");
        await loadItems();
      } catch (err) {
        Alert.alert("Błąd", err.message || "Nie udało się zużyć produktu.");
      }
    },
    [headers, loadItems]
  );

  const promptUseItem = useCallback(
    (item) => {
      if (!item) return;
      const available = Number(item?.amount) || 0;
      const defaultValue = available > 0 ? String(available) : "1";

      if (Platform.OS === "ios") {
        Alert.prompt(
          "Użyj produktu",
          "Podaj ilość do użycia",
          [
            { text: "Anuluj", style: "cancel" },
            {
              text: "Potwierdź",
              onPress: (value) => consumeItem(item, value ?? defaultValue),
            },
          ],
          "plain-text",
          defaultValue,
          "decimal-pad"
        );
      } else {
        setAmountModalItem(item);
        setAmountModalValue(defaultValue);
        setAmountModalVisible(true);
      }
    },
    [consumeItem]
  );

  const closeContextMenu = useCallback(() => {
    setContextVisible(false);
    setSelectedItem(null);
  }, []);

  const handleAction = useCallback(
    (action, itemOverride) => {
      const current = itemOverride || selectedItem;
      if (!current) return;

      if (Platform.OS !== "ios") closeContextMenu();
      switch (action) {
        case "use":
          promptUseItem(current);
          break;
        case "throw":
          Alert.alert("Wyrzuć produkt", "Czy na pewno chcesz wyrzucić ten produkt?", [
            { text: "Anuluj", style: "cancel" },
            {
              text: "Wyrzuć",
              style: "destructive",
              onPress: () => discardItem(current),
            },
          ]);
          break;
        default:
          break;
      }
      if (Platform.OS === "ios") setSelectedItem(null);
    },
    [closeContextMenu, discardItem, promptUseItem, selectedItem]
  );

  const openContextMenu = useCallback(
    (item) => {
      setSelectedItem(item);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      if (Platform.OS === "ios") {
        const options = ["Użyj", "Wyrzuć", "Anuluj"];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title:
              item?.customName || item?.name || item?.product?.name || "Produkt",
            options,
            cancelButtonIndex: 2,
            destructiveButtonIndex: 1,
            userInterfaceStyle: "light",
          },
          (buttonIndex) => {
            const actions = ["use", "throw"];
            if (buttonIndex >= 0 && buttonIndex < actions.length) {
              handleAction(actions[buttonIndex], item);
            } else {
              setSelectedItem(null);
            }
          }
        );
        return;
      }

      setContextVisible(true);
    },
    [handleAction]
  );

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
            <Pressable style={styles.contextAction} onPress={() => handleAction("use", selectedItem)}>
              <Text style={styles.contextActionText}>Użyj</Text>
            </Pressable>
            <Pressable style={styles.contextAction} onPress={() => handleAction("throw", selectedItem)}>
              <Text style={styles.contextActionText}>Wyrzuć</Text>
            </Pressable>
            <Pressable style={[styles.contextAction, styles.contextCancel]} onPress={closeContextMenu}>
              <Text style={[styles.contextActionText, styles.contextCancelText]}>Anuluj</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={amountModalVisible} animationType="fade" onRequestClose={() => setAmountModalVisible(false)}>
        <View style={styles.contextOverlay}>
          <Pressable
            style={styles.contextBackdrop}
            onPress={() => {
              setAmountModalVisible(false);
              setAmountModalItem(null);
            }}
          />
          <View style={styles.amountModal}>
            <Text style={styles.contextTitle}>Podaj ilość do użycia</Text>
            <Text style={styles.amountHint}>
              Dostępne: {formatAmount(amountModalItem?.amount)} {getLabel(amountModalItem?.unit)}
            </Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="decimal-pad"
              value={amountModalValue}
              onChangeText={setAmountModalValue}
              placeholder="np. 1"
            />
            <View style={styles.dateActions}>
              <Pressable
                style={[styles.modalActionBtn, styles.modalCancelBtn]}
                onPress={() => setAmountModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionBtn, styles.modalConfirmBtn]}
                onPress={() => {
                  setAmountModalVisible(false);
                  const current = amountModalItem;
                  const value = amountModalValue;
                  setTimeout(() => {
                    consumeItem(current, value);
                  }, 50);
                  setAmountModalItem(null);
                }}
              >
                <Text style={styles.modalConfirmText}>Potwierdź</Text>
              </Pressable>
            </View>
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
  amountModal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  amountHint: { color: "#6F5833", fontSize: 13 },
  amountInput: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(31,111,235,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
