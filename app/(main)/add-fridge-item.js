import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const getLabel = (value) => {
  if (!value) return "(brak)";
  if (typeof value === "string") return value;
  return (
    value.name ||
    value.displayName ||
    value.label ||
    value.typeName ||
    value.unitName ||
    value.code ||
    value.symbol ||
    value.value ||
    "(brak)"
  );
};

const getId = (value) => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return (
    value.id ??
    value.productId ??
    value.uuid ??
    value.code ??
    value.value ??
    value.key ??
    value.name ??
    null
  );
};

const normalizeSelection = (value) => {
  if (!value) return null;
  return {
    id: getId(value),
    label: getLabel(value),
    raw: value,
  };
};

const resolveUnitValue = (selection) => {
  if (!selection) return null;
  const raw = selection.raw;
  if (typeof raw === "string") return raw;
  const candidates = [raw?.value, raw?.code, raw?.symbol, raw?.key, raw?.id, selection.id];
  return candidates.find((item) => item !== undefined && item !== null && String(item).trim().length > 0) || null;
};

export default function AddFridgeItemScreen() {
  const router = useRouter();
  const { token, activeFridge } = useAuth();

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [selectedUnit, setSelectedUnit] = useState(null);

  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [bestBeforeDate, setBestBeforeDate] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [dateModalTarget, setDateModalTarget] = useState(null);
  const [tempDate, setTempDate] = useState({ year: null, month: null, day: null });
  const [submitting, setSubmitting] = useState(false);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
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
      setProductsError(err.message || "Nie udało się pobrać produktów");
    } finally {
      setProductsLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSubmit = async () => {
    if (!activeFridge) {
      Alert.alert("Brak lodówki", "Najpierw wybierz aktywną lodówkę.");
      return;
    }

    const numericAmount = Number(amount);
    if (!numericAmount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("Błędna ilość", "Podaj dodatnią ilość produktu.");
      return;
    }

    const unitValue = resolveUnitValue(selectedUnit);
    if (!unitValue) {
      Alert.alert("Brak jednostki", "Wybierz jednostkę.");
      return;
    }

    if (!selectedProduct?.id) {
      Alert.alert("Brak produktu", "Wybierz produkt z katalogu.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fridgeId: activeFridge,
        productId: selectedProduct?.id || null,
        customName: customName.trim() || null,
        amount: numericAmount,
        unit: unitValue,
        bestBeforeDate: bestBeforeDate || null,
        openDate: openDate || null,
      };

      const res = await fetch(`${API_BASE_URL}/api/fridge-items`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const responseBody = await res.json().catch(() => null);
      if (!res.ok) {
        const message = responseBody?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }

      Alert.alert("Dodano", responseBody?.message || "Produkt został dodany.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert("Błąd", err.message || "Nie udało się dodać produktu do lodówki.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (year, month, day) => {
    if (!year || !month || !day) return "";
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  };

  const parseDateString = (value) => {
    if (!value) return null;
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  };

  const openDateSelector = (target) => {
    const currentValue = target === "bestBefore" ? bestBeforeDate : openDate;
    const parsed = parseDateString(currentValue);
    const today = new Date();
    setTempDate(
      parsed || {
        year: today.getFullYear(),
        month: today.getMonth() + 1,
        day: today.getDate(),
      }
    );
    setDateModalTarget(target);
    setDateModalVisible(true);
  };

  const closeDateSelector = () => {
    setDateModalVisible(false);
    setDateModalTarget(null);
  };

  const handleConfirmDate = () => {
    if (!tempDate.year || !tempDate.month || !tempDate.day) {
      closeDateSelector();
      return;
    }
    const formatted = formatDate(tempDate.year, tempDate.month, tempDate.day);
    if (dateModalTarget === "bestBefore") setBestBeforeDate(formatted);
    if (dateModalTarget === "openDate") setOpenDate(formatted);
    closeDateSelector();
  };

  const handleClearDate = () => {
    if (dateModalTarget === "bestBefore") setBestBeforeDate("");
    if (dateModalTarget === "openDate") setOpenDate("");
    closeDateSelector();
  };

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const range = [];
    for (let y = now - 2; y <= now + 5; y += 1) range.push(y);
    return range;
  }, []);

  const months = useMemo(
    () => [
      { value: 1, label: "Styczeń" },
      { value: 2, label: "Luty" },
      { value: 3, label: "Marzec" },
      { value: 4, label: "Kwiecień" },
      { value: 5, label: "Maj" },
      { value: 6, label: "Czerwiec" },
      { value: 7, label: "Lipiec" },
      { value: 8, label: "Sierpień" },
      { value: 9, label: "Wrzesień" },
      { value: 10, label: "Październik" },
      { value: 11, label: "Listopad" },
      { value: 12, label: "Grudzień" },
    ],
    []
  );

  const daysInMonth = useCallback((year, month) => {
    if (!year || !month) return 31;
    return new Date(year, month, 0).getDate();
  }, []);

  const days = useMemo(() => {
    const total = daysInMonth(tempDate.year || new Date().getFullYear(), tempDate.month || 1);
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }, [tempDate.year, tempDate.month, daysInMonth]);

  const renderProductItem = ({ item }) => {
    const isSelected = selectedProduct?.id && String(selectedProduct.id) === String(getId(item));
    return (
      <Pressable
        onPress={() => {
          const normalized = normalizeSelection(item);
          setSelectedProduct(normalized);
          if (!customName.trim()) setCustomName(item?.name || "");
          const unit = item?.defaultUnit || item?.unit || item?.productUnit;
          if (unit) setSelectedUnit(normalizeSelection(unit));
          else setSelectedUnit(null);
          setShowProductPicker(false);
        }}
        style={({ pressed }) => [styles.optionRow, isSelected && styles.optionSelected, pressed && styles.optionPressed]}
      >
        <Text style={styles.optionTitle}>{item?.name ?? "(bez nazwy)"}</Text>
        <Text style={styles.optionSubtitle}>Typ: {getLabel(item?.productType)}</Text>
      </Pressable>
    );
  };

  return (
    <LinearGradient
      colors={["#FFF8E6", "#FFE19A", "#FFF3C9"]}
      locations={[0, 0.55, 1]}
      style={styles.background}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backLabel}>←</Text>
          </Pressable>
          <Text style={styles.title}>Dodaj do lodówki</Text>
        </View>

        {!activeFridge ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Brak aktywnej lodówki</Text>
            <Text style={styles.warningSubtitle}>Wybierz lodówkę na liście, aby dodać produkty.</Text>
            <Pressable style={styles.warningAction} onPress={() => router.push("/fridges")}> 
              <Text style={styles.warningActionText}>Przejdź do listy lodówek</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Produkt z katalogu</Text>
          <Pressable
            style={[styles.selector, showProductPicker && styles.selectorActive]}
            onPress={() => setShowProductPicker(true)}
            disabled={productsLoading}
          >
            {productsLoading ? (
              <ActivityIndicator color="#1F6FEB" />
            ) : (
              <Text style={styles.selectorText}>
                {selectedProduct?.label || "Wybierz produkt"}
              </Text>
            )}
          </Pressable>
          {productsError ? (
            <Pressable style={styles.errorBanner} onPress={loadProducts}>
              <Text style={styles.errorText}>{productsError}</Text>
              <Text style={styles.retryText}>Dotknij, aby spróbować ponownie</Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>Nazwa własna (opcjonalnie)</Text>
          <TextInput
            placeholder="np. Jogurt brzoskwiniowy"
            value={customName}
            onChangeText={setCustomName}
            style={styles.input}
          />

          <Text style={styles.label}>Ilość</Text>
          <TextInput
            placeholder="np. 1.5"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            style={styles.input}
          />

          <Text style={styles.label}>Jednostka</Text>
          <View style={[styles.selector, styles.selectorDisabled]}>
            <Text style={[styles.selectorText, !selectedUnit?.label && styles.selectorPlaceholder]}>
              {selectedUnit?.label || "Wybierz produkt, aby uzupełnić"}
            </Text>
          </View>

          <Text style={styles.label}>Data przydatności</Text>
          <Pressable style={styles.selector} onPress={() => openDateSelector("bestBefore")}>
            <Text style={[styles.selectorText, !bestBeforeDate && styles.selectorPlaceholder]}>
              {bestBeforeDate || "Wybierz datę"}
            </Text>
          </Pressable>

          <Text style={styles.label}>Data otwarcia</Text>
          <Pressable style={styles.selector} onPress={() => openDateSelector("openDate")}>
            <Text style={[styles.selectorText, !openDate && styles.selectorPlaceholder]}>
              {openDate || "Wybierz datę"}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.submitButton, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Dodaj produkt</Text>
            )}
          </Pressable>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <Modal
        visible={showProductPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProductPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wybierz produkt</Text>
              <Pressable onPress={() => setShowProductPicker(false)}>
                <Text style={styles.modalClose}>Zamknij</Text>
              </Pressable>
            </View>
            {productsLoading ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color="#1F6FEB" />
              </View>
            ) : (
              <FlatList
                data={products}
                keyExtractor={(item, index) => String(item?.id ?? index)}
                renderItem={renderProductItem}
                contentContainerStyle={styles.modalList}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDateSelector}
      >
        <View style={styles.modalOverlayCentered}>
          <View style={styles.dateModal}>
            <Text style={styles.modalTitle}>Wybierz datę</Text>
            <View style={styles.datePickersRow}>
              <View style={styles.dateColumn}>
                <Text style={styles.dateColumnLabel}>Rok</Text>
                <FlatList
                  data={years}
                  keyExtractor={(item) => String(item)}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() =>
                        setTempDate((prev) => {
                          const updated = { ...prev, year: item };
                          const limit = daysInMonth(item, prev.month || 1);
                          if (updated.day && updated.day > limit) updated.day = limit;
                          return updated;
                        })
                      }
                      style={[styles.dateOption, tempDate.year === item && styles.dateOptionSelected]}
                    >
                      <Text style={[styles.dateOptionText, tempDate.year === item && styles.dateOptionTextSelected]}>
                        {item}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
              <View style={styles.dateColumn}>
                <Text style={styles.dateColumnLabel}>Miesiąc</Text>
                <FlatList
                  data={months}
                  keyExtractor={(item) => String(item.value)}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() =>
                        setTempDate((prev) => {
                          const updated = { ...prev, month: item.value };
                          const limit = daysInMonth(prev.year || new Date().getFullYear(), item.value);
                          if (updated.day && updated.day > limit) updated.day = limit;
                          return updated;
                        })
                      }
                      style={[styles.dateOption, tempDate.month === item.value && styles.dateOptionSelected]}
                    >
                      <Text style={[styles.dateOptionText, tempDate.month === item.value && styles.dateOptionTextSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
              <View style={styles.dateColumn}>
                <Text style={styles.dateColumnLabel}>Dzień</Text>
                <FlatList
                  data={days}
                  keyExtractor={(item) => String(item)}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setTempDate((prev) => ({ ...prev, day: item }))}
                      style={[styles.dateOption, tempDate.day === item && styles.dateOptionSelected]}
                    >
                      <Text style={[styles.dateOptionText, tempDate.day === item && styles.dateOptionTextSelected]}>
                        {item}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            </View>
            <View style={styles.dateActions}>
              <Pressable style={[styles.modalActionBtn, styles.modalCancelBtn]} onPress={handleClearDate}>
                <Text style={styles.modalCancelText}>Wyczyść</Text>
              </Pressable>
              <Pressable style={[styles.modalActionBtn, styles.modalConfirmBtn]} onPress={handleConfirmDate}>
                <Text style={styles.modalConfirmText}>Zapisz</Text>
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
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
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 20,
    padding: 22,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  label: { fontWeight: "700", color: "#3F3116", fontSize: 14 },
  input: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,190,120,0.4)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  selector: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,190,120,0.4)",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorDisabled: { backgroundColor: "rgba(255,255,255,0.6)" },
  selectorActive: { borderColor: "#1F6FEB" },
  selectorText: { fontSize: 15, color: "#3F3116" },
  selectorPlaceholder: { color: "#999" },
  errorBanner: {
    backgroundColor: "rgba(214,69,80,0.12)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  errorText: { color: "#B71C1C", fontWeight: "600" },
  retryText: { color: "#1F6FEB", fontWeight: "600" },
  submitButton: {
    backgroundColor: "#1F6FEB",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  optionRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F6F6FB",
    gap: 4,
  },
  optionSelected: {
    backgroundColor: "rgba(31,111,235,0.12)",
    borderWidth: 1,
    borderColor: "#1F6FEB",
  },
  optionPressed: { opacity: 0.85 },
  optionTitle: { fontWeight: "700", color: "#3F3116" },
  optionSubtitle: { fontSize: 12, color: "#6F5833" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalClose: { color: "#1F6FEB", fontWeight: "700" },
  modalLoader: { padding: 20, alignItems: "center" },
  modalList: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dateModal: {
    width: "100%",
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  datePickersRow: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
  dateColumn: { flex: 1, maxHeight: 220 },
  dateColumnLabel: { fontWeight: "700", color: "#3F3116", marginBottom: 8 },
  dateOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F6F6FB",
    marginBottom: 6,
  },
  dateOptionSelected: {
    backgroundColor: "rgba(31,111,235,0.12)",
    borderWidth: 1,
    borderColor: "#1F6FEB",
  },
  dateOptionText: { color: "#3F3116", fontSize: 14 },
  dateOptionTextSelected: { color: "#1F6FEB", fontWeight: "700" },
  dateActions: { flexDirection: "row", gap: 12 },
  modalActionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalCancelBtn: { backgroundColor: "#EFEFF5" },
  modalConfirmBtn: { backgroundColor: "#1F6FEB" },
  modalCancelText: { color: "#111", fontWeight: "600" },
  modalConfirmText: { color: "#fff", fontWeight: "700" },
});
