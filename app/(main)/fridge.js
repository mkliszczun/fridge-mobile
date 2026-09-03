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
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const CARD_GRADIENTS = {
  normal: ["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"],
  warning: ["rgba(255,252,239,0.96)", "rgba(255,241,204,0.86)"],
  expired: ["rgba(255,247,244,0.96)", "rgba(249,226,220,0.86)"],
  reserved: ["rgba(239,241,239,0.94)", "rgba(224,228,225,0.88)"],
};

const formatAmount = (value) => {
  if (value == null) return "-";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num % 1 === 0 ? String(num) : num.toFixed(2);
};

const numericAmount = (value) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getReservationAmounts = (item) => {
  const total = Math.max(0, numericAmount(item?.amount));
  const reserved = Math.max(0, numericAmount(item?.reservedAmount));
  const responseAvailable = Number(item?.availableAmount);
  const available = item?.availableAmount != null && Number.isFinite(responseAvailable)
    ? Math.max(0, responseAvailable)
    : Math.max(0, total - reserved);

  return {
    total,
    reserved,
    available,
    fullyReserved: reserved > 0 && available <= 0,
    partiallyReserved: reserved > 0 && available > 0,
  };
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

const getExpiryValue = (item) => item?.effectiveExpireAt || item?.bestBeforeDate || null;

const getLocalDate = (value) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const isValidIsoDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
};

const formatDate = (value) => {
  const parsed = getLocalDate(value);
  if (!parsed) return "Brak daty przydatności";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
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

const dateStatus = (value) => {
  const parsed = getLocalDate(value);
  if (!parsed) return "normal";

  const today = new Date();
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diff = (target - today) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 3) return "warning";
  return "normal";
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
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalItem, setEditModalItem] = useState(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [editDateValue, setEditDateValue] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const sortedItems = useMemo(() => (
    items
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const reservationOrder = Number(getReservationAmounts(left.item).fullyReserved)
          - Number(getReservationAmounts(right.item).fullyReserved);
        return reservationOrder || left.index - right.index;
      })
      .map(({ item }) => item)
  ), [items]);

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
      const { total, available } = getReservationAmounts(item);
      if (amount > available) {
        Alert.alert("Błędna ilość", `Dostępna ilość to ${formatAmount(available)}.`);
        return;
      }

      try {
        const consumeAll = available === total && amount === total;
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
      const { available } = getReservationAmounts(item);
      if (available <= 0) {
        Alert.alert(
          "Produkt jest zarezerwowany",
          "Cała dostępna ilość została zarezerwowana dla zaplanowanych posiłków."
        );
        return;
      }
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

  const closeAmountModal = useCallback(() => {
    setAmountModalVisible(false);
    setAmountModalItem(null);
  }, []);

  const openEditModal = useCallback((item) => {
    if (!item) return;
    setEditModalItem(item);
    setEditAmountValue(formatAmount(item?.amount));
    setEditDateValue(String(item?.bestBeforeDate || item?.effectiveExpireAt || ""));
    setEditModalVisible(true);
  }, []);

  const closeEditModal = useCallback(() => {
    if (editSubmitting) return;
    setEditModalVisible(false);
    setEditModalItem(null);
  }, [editSubmitting]);

  const saveItemChanges = useCallback(async () => {
    const item = editModalItem;
    const itemId = item?.id || item?.itemId || item?.fridgeItemId;
    if (!itemId) {
      Alert.alert("Błąd", "Nie udało się zidentyfikować produktu.");
      return;
    }

    const amount = Number(String(editAmountValue).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Błędna ilość", "Podaj poprawną dodatnią wartość.");
      return;
    }

    const { reserved } = getReservationAmounts(item);
    if (amount < reserved) {
      Alert.alert(
        "Ilość jest zbyt mała",
        `Nie można ustawić mniej niż zarezerwowane ${formatAmount(reserved)} ${getLabel(item?.unit)}.`
      );
      return;
    }

    const bestBeforeDate = editDateValue.trim();
    if (!isValidIsoDate(bestBeforeDate)) {
      Alert.alert("Błędna data", "Wpisz datę w formacie RRRR-MM-DD, np. 2026-09-15.");
      return;
    }

    setEditSubmitting(true);
    try {
      const amountResponse = await fetch(`${API_BASE_URL}/api/fridge-items/${itemId}/amount`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ amount }),
      });
      const amountPayload = await amountResponse.json().catch(() => null);
      if (!amountResponse.ok) {
        throw new Error(amountPayload?.message || `HTTP ${amountResponse.status}`);
      }

      const dateResponse = await fetch(`${API_BASE_URL}/api/fridge-items/${itemId}/best-before-date`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ bestBeforeDate }),
      });
      const datePayload = await dateResponse.json().catch(() => null);
      if (!dateResponse.ok) {
        throw new Error(datePayload?.message || `HTTP ${dateResponse.status}`);
      }

      setEditModalVisible(false);
      setEditModalItem(null);
      await loadItems();
      Alert.alert("Zapisano", "Ilość i termin przydatności zostały zaktualizowane.");
    } catch (err) {
      await loadItems();
      Alert.alert("Błąd", err.message || "Nie udało się zaktualizować produktu.");
    } finally {
      setEditSubmitting(false);
    }
  }, [editAmountValue, editDateValue, editModalItem, headers, loadItems]);

  const handleAction = useCallback(
    (action, itemOverride) => {
      const current = itemOverride || selectedItem;
      if (!current) return;

      if (Platform.OS !== "ios") closeContextMenu();
      switch (action) {
        case "use":
          promptUseItem(current);
          break;
        case "edit":
          openEditModal(current);
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
    [closeContextMenu, discardItem, openEditModal, promptUseItem, selectedItem]
  );

  const openContextMenu = useCallback(
    (item) => {
      setSelectedItem(item);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      if (Platform.OS === "ios") {
        const { fullyReserved } = getReservationAmounts(item);
        const options = ["Użyj", "Edytuj", "Wyrzuć", "Anuluj"];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title:
              item?.customName || item?.name || item?.product?.name || "Produkt",
            options,
            cancelButtonIndex: 3,
            destructiveButtonIndex: 2,
            ...(fullyReserved ? { disabledButtonIndices: [0] } : {}),
            userInterfaceStyle: "light",
          },
          (buttonIndex) => {
            const actions = ["use", "edit", "throw"];
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
              <Text style={styles.eyebrow}>SPIŻARNIA</Text>
              <Text style={styles.title}>Moje produkty</Text>
              <Text style={styles.headerSubtitle}>
                {!activeFridge
                  ? "Wybierz aktywną lodówkę"
                  : loading
                    ? "Sprawdzam zawartość..."
                    : formatProductCount(items.length)}
              </Text>
            </View>
          </View>

          {!activeFridge ? (
            <LinearGradient
              colors={["rgba(255,252,239,0.96)", "rgba(255,241,204,0.84)"]}
              style={styles.warningBox}
            >
              <Text style={styles.warningEyebrow}>BRAK AKTYWNEJ LODÓWKI</Text>
              <Text style={styles.warningTitle}>Najpierw wybierz swoją lodówkę</Text>
              <Text style={styles.warningSubtitle}>
                Dopiero wtedy pokażemy jej produkty i terminy ważności.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.warningAction, pressed && styles.buttonPressed]}
                onPress={() => router.push("/fridges")}
              >
                <Text style={styles.warningActionText}>Moje lodówki</Text>
                <Text style={styles.warningActionArrow}>›</Text>
              </Pressable>
            </LinearGradient>
          ) : null}

          {error ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => loadItems()}>
                  <Text style={styles.retryText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Otwieram lodówkę...</Text>
            </View>
          ) : activeFridge ? (
            <FlatList
              data={sortedItems}
              keyExtractor={(item, index) => String(item?.id ?? index)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => loadItems(true)}
              ListHeaderComponent={items.length ? (
                <View style={styles.listHint}>
                  <Text style={styles.listHintDot}>•</Text>
                  <Text style={styles.listHintText}>Dotknij produktu, aby wybrać działanie</Text>
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
                  <Text style={styles.emptyTitle}>Tu jest jeszcze pusto</Text>
                  <Text style={styles.emptySubtitle}>
                    Zeskanuj produkt na ekranie Kuchnia, aby dodać go do lodówki.
                  </Text>
                </LinearGradient>
              )}
              renderItem={({ item }) => {
                const expiryValue = getExpiryValue(item);
                const status = dateStatus(expiryValue);
                const reservation = getReservationAmounts(item);
                const productName =
                  item?.customName || item?.name || item?.product?.name || item?.productName || "Bez nazwy";
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={reservation.fullyReserved
                      ? `${productName}, w całości zarezerwowany`
                      : productName}
                    accessibilityHint="Dotknij lub przytrzymaj, aby wybrać akcję"
                    onPress={() => openContextMenu(item)}
                    onLongPress={() => openContextMenu(item)}
                    delayLongPress={700}
                    style={({ pressed }) => [
                      styles.cardShell,
                      reservation.fullyReserved && styles.cardShellReserved,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <LinearGradient
                      colors={CARD_GRADIENTS[reservation.fullyReserved ? "reserved" : status]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.card}
                    >
                      <View style={[
                        styles.productIconBadge,
                        reservation.fullyReserved && styles.productIconBadgeReserved,
                      ]}>
                        <ProductGlyph />
                      </View>
                      <View style={styles.productCopy}>
                        <View style={styles.productHeadingRow}>
                          <Text
                            style={[
                              styles.productName,
                              reservation.fullyReserved && styles.productNameReserved,
                            ]}
                            numberOfLines={2}
                          >
                            {productName}
                          </Text>
                          {reservation.fullyReserved || status !== "normal" ? (
                            <View style={[
                              styles.statusBadge,
                              status === "expired" && styles.statusBadgeExpired,
                              reservation.fullyReserved && styles.statusBadgeReserved,
                            ]}>
                              <Text style={[
                                styles.statusBadgeText,
                                status === "expired" && styles.statusBadgeTextExpired,
                                reservation.fullyReserved && styles.statusBadgeTextReserved,
                              ]}>
                                {reservation.fullyReserved
                                  ? "ZAREZERWOWANE"
                                  : status === "expired"
                                    ? "PO TERMINIE"
                                    : "WKRÓTCE"}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {reservation.partiallyReserved ? (
                          <View style={styles.reservationAmounts}>
                            <Text style={styles.availableAmountText}>
                              Dostępne: {formatAmount(reservation.available)} {getLabel(item?.unit)}
                            </Text>
                            <Text style={styles.reservedAmountText}>
                              Zarezerwowane: {formatAmount(reservation.reserved)} {getLabel(item?.unit)}
                            </Text>
                          </View>
                        ) : reservation.fullyReserved ? (
                          <Text style={styles.fullyReservedAmountText}>
                            Zarezerwowano: {formatAmount(reservation.reserved)} {getLabel(item?.unit)}
                          </Text>
                        ) : (
                          <Text style={styles.amountText}>
                            {formatAmount(item?.amount)} {getLabel(item?.unit)}
                          </Text>
                        )}
                        <View style={styles.expiryRow}>
                          <View style={[
                            styles.expiryDot,
                            status === "warning" && styles.expiryDotWarning,
                            status === "expired" && styles.expiryDotExpired,
                            reservation.fullyReserved && styles.expiryDotReserved,
                          ]} />
                          <Text style={[
                            styles.expiryText,
                            status === "expired" && styles.expiryTextExpired,
                            reservation.fullyReserved && styles.expiryTextReserved,
                          ]}>
                            {formatDate(expiryValue)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[
                        styles.cardMore,
                        reservation.fullyReserved && styles.cardMoreReserved,
                      ]}>•••</Text>
                    </LinearGradient>
                  </Pressable>
                );
              }}
            />
          ) : (
            <View style={styles.listSpacer} />
          )}
        </View>
      </SafeAreaView>

      <Modal transparent visible={contextVisible} animationType="fade" onRequestClose={closeContextMenu}>
        <View style={styles.contextOverlay}>
          <Pressable style={styles.contextBackdrop} onPress={closeContextMenu} />
          <LinearGradient
            colors={["rgba(255,255,251,0.98)", "rgba(239,244,240,0.96)"]}
            style={styles.contextCard}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalProductRow}>
              <View style={styles.modalIconBadge}>
                <ProductGlyph />
              </View>
              <View style={styles.modalProductCopy}>
                <Text style={styles.modalEyebrow}>WYBRANY PRODUKT</Text>
                <Text style={styles.contextTitle} numberOfLines={2}>
                  {selectedItem?.customName || selectedItem?.name || selectedItem?.product?.name || "Produkt"}
                </Text>
              </View>
            </View>
            <Text style={styles.contextSubtitle}>Co chcesz zrobić?</Text>
            <Pressable
              disabled={getReservationAmounts(selectedItem).fullyReserved}
              style={({ pressed }) => [
                styles.contextAction,
                styles.contextActionPrimary,
                getReservationAmounts(selectedItem).fullyReserved && styles.contextActionDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => handleAction("use", selectedItem)}
            >
              <Text style={styles.contextActionPrimaryText}>Użyj produktu</Text>
              <Text style={styles.contextActionPrimaryArrow}>›</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.contextAction, styles.contextActionSecondary, pressed && styles.buttonPressed]}
              onPress={() => handleAction("edit", selectedItem)}
            >
              <Text style={styles.contextActionSecondaryText}>Edytuj</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.contextAction, styles.contextActionDanger, pressed && styles.buttonPressed]}
              onPress={() => handleAction("throw", selectedItem)}
            >
              <Text style={styles.contextActionDangerText}>Wyrzuć produkt</Text>
            </Pressable>
            <Pressable style={styles.contextCancel} onPress={closeContextMenu}>
              <Text style={styles.contextCancelText}>Anuluj</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>

      <Modal transparent visible={amountModalVisible} animationType="fade" onRequestClose={closeAmountModal}>
        <View style={styles.contextOverlay}>
          <Pressable style={styles.contextBackdrop} onPress={closeAmountModal} />
          <LinearGradient
            colors={["rgba(255,255,251,0.98)", "rgba(239,244,240,0.96)"]}
            style={styles.amountModal}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalEyebrow}>UŻYJ PRODUKTU</Text>
            <Text style={styles.amountTitle}>Podaj ilość</Text>
            <Text style={styles.amountHint}>
              Dostępne: {formatAmount(getReservationAmounts(amountModalItem).available)} {getLabel(amountModalItem?.unit)}
            </Text>
            <TextInput
              accessibilityLabel="Ilość do użycia"
              style={styles.amountInput}
              keyboardType="decimal-pad"
              value={amountModalValue}
              onChangeText={setAmountModalValue}
              placeholder="np. 1"
              placeholderTextColor="#98A2A3"
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalActionButton, styles.modalCancelButton]} onPress={closeAmountModal}>
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalConfirmButton]}
                onPress={() => {
                  const current = amountModalItem;
                  const value = amountModalValue;
                  closeAmountModal();
                  setTimeout(() => {
                    consumeItem(current, value);
                  }, 50);
                }}
              >
                <Text style={styles.modalConfirmText}>Potwierdź</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      <Modal transparent visible={editModalVisible} animationType="fade" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalKeyboardView}
        >
          <View style={styles.contextOverlay}>
            <Pressable style={styles.contextBackdrop} onPress={closeEditModal} />
            <LinearGradient
              colors={["rgba(255,255,251,0.98)", "rgba(239,244,240,0.96)"]}
              style={styles.amountModal}
            >
              <View style={styles.modalHandle} />
              <Text style={styles.modalEyebrow}>EDYTUJ PRODUKT</Text>
              <Text style={styles.amountTitle} numberOfLines={2}>
                {editModalItem?.customName || editModalItem?.name || editModalItem?.product?.name || "Produkt"}
              </Text>

              <View style={styles.editField}>
                <Text style={styles.editLabel}>Ilość ({getLabel(editModalItem?.unit)})</Text>
                <TextInput
                  accessibilityLabel="Nowa ilość produktu"
                  style={styles.amountInput}
                  keyboardType="decimal-pad"
                  value={editAmountValue}
                  onChangeText={setEditAmountValue}
                  placeholder="np. 2"
                  placeholderTextColor="#98A2A3"
                  editable={!editSubmitting}
                />
                {getReservationAmounts(editModalItem).reserved > 0 ? (
                  <Text style={styles.editHint}>
                    Zarezerwowane: {formatAmount(getReservationAmounts(editModalItem).reserved)} {getLabel(editModalItem?.unit)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.editField}>
                <Text style={styles.editLabel}>Termin przydatności</Text>
                <TextInput
                  accessibilityLabel="Nowy termin przydatności"
                  style={styles.amountInput}
                  value={editDateValue}
                  onChangeText={setEditDateValue}
                  placeholder="RRRR-MM-DD"
                  placeholderTextColor="#98A2A3"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!editSubmitting}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  disabled={editSubmitting}
                  style={[styles.modalActionButton, styles.modalCancelButton, editSubmitting && styles.contextActionDisabled]}
                  onPress={closeEditModal}
                >
                  <Text style={styles.modalCancelText}>Anuluj</Text>
                </Pressable>
                <Pressable
                  disabled={editSubmitting}
                  style={[styles.modalActionButton, styles.modalConfirmButton, editSubmitting && styles.contextActionDisabled]}
                  onPress={saveItemChanges}
                >
                  {editSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Zapisz</Text>
                  )}
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 20 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: {
    width: 260,
    height: 260,
    top: -80,
    right: -80,
    backgroundColor: "rgba(215,225,217,0.62)",
  },
  glowMiddle: {
    width: 280,
    height: 280,
    top: 330,
    left: -150,
    backgroundColor: "rgba(249,224,174,0.28)",
  },
  glowBottom: {
    width: 300,
    height: 300,
    bottom: -110,
    right: -130,
    backgroundColor: "rgba(189,214,211,0.42)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
    paddingTop: 16,
    paddingBottom: 22,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,250,0.76)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1, paddingTop: 1 },
  eyebrow: {
    color: "#7D9098",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: "#151917",
    fontSize: 35,
    lineHeight: 40,
    fontWeight: "700",
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
  },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 4 },
  warningBox: {
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 21,
    marginBottom: 16,
    shadowColor: "#7B652C",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  warningEyebrow: { color: "#9A6A14", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  warningTitle: { color: "#272317", fontSize: 22, lineHeight: 27, fontWeight: "700", marginTop: 7 },
  warningSubtitle: { color: "#776849", fontSize: 14, lineHeight: 20, marginTop: 7 },
  warningAction: {
    minHeight: 52,
    marginTop: 17,
    paddingHorizontal: 17,
    borderRadius: 18,
    backgroundColor: "#304B54",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  warningActionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  warningActionArrow: { position: "absolute", right: 17, color: "#D9E5E5", fontSize: 28, lineHeight: 29 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "rgba(255,247,244,0.90)",
    borderWidth: 1,
    borderColor: "rgba(164,73,62,0.12)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  errorIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A4493E",
  },
  errorIconText: { color: "#FFFFFF", fontWeight: "800" },
  errorCopy: { flex: 1 },
  errorText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  retryText: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { color: "#667579", fontSize: 14 },
  listContent: { paddingBottom: 34, gap: 14 },
  listHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingBottom: 2,
  },
  listHintDot: { color: "#7D9098", fontSize: 18, lineHeight: 18 },
  listHintText: { color: "#78888C", fontSize: 12, lineHeight: 17 },
  listSpacer: { flex: 1 },
  emptyBox: {
    alignItems: "center",
    paddingHorizontal: 26,
    paddingVertical: 42,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#173746",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  emptyIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,243,244,0.86)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  emptyTitle: { color: "#172222", fontSize: 22, fontWeight: "700", marginTop: 17 },
  emptySubtitle: { maxWidth: 280, color: "#667579", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7 },
  cardShell: {
    width: "100%",
    borderRadius: 25,
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardShellReserved: { shadowOpacity: 0.05, elevation: 1 },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  card: {
    minHeight: 126,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  productIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,243,244,0.84)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  productIconBadgeReserved: { backgroundColor: "rgba(210,216,212,0.78)", opacity: 0.62 },
  productCopy: { flex: 1, minWidth: 0 },
  productHeadingRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  productName: { flex: 1, color: "#151917", fontSize: 18, lineHeight: 23, fontWeight: "700" },
  productNameReserved: { color: "#707976" },
  amountText: { color: "#536A71", fontSize: 15, lineHeight: 21, marginTop: 4 },
  reservationAmounts: { marginTop: 5, gap: 2 },
  availableAmountText: { color: "#365E59", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  reservedAmountText: { color: "#7D8987", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  fullyReservedAmountText: { color: "#818986", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 5 },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  expiryDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8AA19F" },
  expiryDotWarning: { backgroundColor: "#C48619" },
  expiryDotExpired: { backgroundColor: "#A4493E" },
  expiryDotReserved: { backgroundColor: "#A1AAA7" },
  expiryText: { flex: 1, color: "#718287", fontSize: 12, lineHeight: 17 },
  expiryTextExpired: { color: "#93483E", fontWeight: "600" },
  expiryTextReserved: { color: "#929A97", fontWeight: "500" },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "rgba(196,134,25,0.12)",
  },
  statusBadgeExpired: { backgroundColor: "rgba(164,73,62,0.11)" },
  statusBadgeReserved: { backgroundColor: "rgba(105,116,112,0.10)" },
  statusBadgeText: { color: "#A66908", fontSize: 8, lineHeight: 10, fontWeight: "900", letterSpacing: 0.5 },
  statusBadgeTextExpired: { color: "#A4493E" },
  statusBadgeTextReserved: { color: "#737C79", fontSize: 7 },
  cardMore: { alignSelf: "flex-start", color: "#A2B0B2", fontSize: 13, letterSpacing: 1, marginTop: 2 },
  cardMoreReserved: { color: "#B5BBB8" },
  contextOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 24,
    position: "relative",
  },
  contextBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,35,39,0.34)" },
  contextCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 20,
    gap: 10,
    elevation: 10,
    shadowColor: "#173746",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(48,75,84,0.18)", marginBottom: 4 },
  modalProductRow: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 3 },
  modalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,243,244,0.86)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  modalProductCopy: { flex: 1 },
  modalEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.2 },
  contextTitle: { color: "#172222", fontSize: 20, lineHeight: 25, fontWeight: "700", marginTop: 2 },
  contextSubtitle: { color: "#708086", fontSize: 13, marginBottom: 3 },
  contextAction: {
    minHeight: 54,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  contextActionPrimary: { backgroundColor: "#304B54" },
  contextActionDisabled: { opacity: 0.36 },
  contextActionPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  contextActionPrimaryArrow: { position: "absolute", right: 17, color: "#D9E5E5", fontSize: 28, lineHeight: 29 },
  contextActionSecondary: { backgroundColor: "rgba(48,75,84,0.08)" },
  contextActionSecondaryText: { color: "#304B54", fontSize: 15, fontWeight: "700" },
  contextActionDanger: { backgroundColor: "rgba(164,73,62,0.09)" },
  contextActionDangerText: { color: "#A4493E", fontSize: 15, fontWeight: "700" },
  contextCancel: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  contextCancelText: { color: "#68777A", fontSize: 14, fontWeight: "600" },
  amountModal: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 20,
    gap: 10,
    elevation: 10,
    shadowColor: "#173746",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  amountTitle: { color: "#172222", fontSize: 26, lineHeight: 31, fontWeight: "700" },
  amountHint: { color: "#667579", fontSize: 14, lineHeight: 20 },
  amountInput: {
    minHeight: 56,
    backgroundColor: "rgba(238,244,242,0.80)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 17,
    paddingVertical: 14,
    color: "#162326",
    fontSize: 16,
  },
  modalKeyboardView: { flex: 1 },
  editField: { gap: 7 },
  editLabel: { color: "#33484D", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  editHint: { color: "#7D8987", fontSize: 12, lineHeight: 17 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalActionButton: { flex: 1, minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalCancelButton: { backgroundColor: "rgba(48,75,84,0.07)" },
  modalConfirmButton: { backgroundColor: "#304B54" },
  modalCancelText: { color: "#596B70", fontSize: 14, fontWeight: "700" },
  modalConfirmText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

const glyphStyles = StyleSheet.create({
  wrap: { width: 34, height: 39, alignItems: "center" },
  lid: { width: 24, height: 4, borderRadius: 2, backgroundColor: "#173746", marginBottom: 2 },
  jar: {
    width: 29,
    height: 31,
    borderWidth: 2.2,
    borderColor: "#173746",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { width: 15, height: 8, borderRadius: 3, backgroundColor: "rgba(23,55,70,0.18)" },
});
