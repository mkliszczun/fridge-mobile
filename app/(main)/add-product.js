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
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

export default function AddProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuth();
  const [form, setForm] = useState({ name: "", ean: "", defaultUnit: "" });
  const [selectedType, setSelectedType] = useState(null);
  const [types, setTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [unitOptions, setUnitOptions] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(null);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [brand, setBrand] = useState("");
  const [categoryHints, setCategoryHints] = useState([]);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const readParam = (value) => {
    if (Array.isArray(value)) return value[0];
    return value ?? null;
  };

  const loadTypes = useCallback(async () => {
    setTypesLoading(true);
    setTypesError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/product-types`, {
        method: "GET",
        headers,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      if (Array.isArray(payload)) {
        setTypes(payload);
      } else {
        setTypes([]);
      }
    } catch (err) {
      setTypesError(err.message || "Nie udało się pobrać typów produktów");
    } finally {
      setTypesLoading(false);
    }
  }, [headers]);

  const loadUnits = useCallback(async () => {
    setUnitsLoading(true);
    setUnitsError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/units`, {
        method: "GET",
        headers,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      if (Array.isArray(payload)) {
        setUnitOptions(payload);
      } else {
        setUnitOptions([]);
      }
    } catch (err) {
      setUnitsError(err.message || "Nie udało się pobrać jednostek");
    } finally {
      setUnitsLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    loadTypes();
    loadUnits();
  }, [loadTypes, loadUnits]);

  useEffect(() => {
    if (prefillApplied) return;

    const nameParam = readParam(params?.prefillName);
    const eanParam = readParam(params?.prefillEan);
    const brandParam = readParam(params?.prefillBrand);
    const categoriesParam = readParam(params?.prefillCategories);

    if (!nameParam && !eanParam && !brandParam && !categoriesParam) return;

    setForm((prev) => ({
      ...prev,
      name: nameParam ? String(nameParam) : prev.name,
      ean: eanParam ? String(eanParam) : prev.ean,
    }));

    if (brandParam) setBrand(String(brandParam));

    if (typeof categoriesParam === "string" && categoriesParam) {
      try {
        const parsed = JSON.parse(categoriesParam);
        if (Array.isArray(parsed)) setCategoryHints(parsed);
      } catch {}
    }

    setPrefillApplied(true);
  }, [params, prefillApplied]);

  useEffect(() => {
    if (!prefillApplied || !types.length || selectedType) return;
    if (!categoryHints.length) return;

    const match = types.find((type) => {
      const label = getDisplayName(type)?.toLowerCase();
      if (!label) return false;
      return categoryHints.some((tag) => {
        if (!tag) return false;
        const normalized = String(tag).toLowerCase().split(":").pop();
        return normalized && label.includes(normalized);
      });
    });

    if (match) setSelectedType(normalizeSelection(match));
  }, [prefillApplied, types, selectedType, categoryHints]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Alert.alert("Brak nazwy", "Podaj nazwę produktu");
      return;
    }
    if (!selectedType?.id) {
      Alert.alert("Brak typu", "Wybierz typ produktu");
      return;
    }
    if (!selectedUnit?.id) {
      Alert.alert("Brak jednostki", "Wybierz domyślną jednostkę");
      return;
    }

    const productTypeValue = resolveProductTypeValue(selectedType);
    if (!productTypeValue) {
      Alert.alert("Brak typu", "Wybrany typ jest niepoprawny");
      return;
    }

    const unitValue = resolveUnitValue(selectedUnit);
    if (!unitValue) {
      Alert.alert("Brak jednostki", "Wybrana jednostka jest niepoprawna");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: form.name.trim(),
          ean: form.ean.trim() || null,
          productType: productTypeValue,
          defaultUnit: unitValue,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }

      Alert.alert("Dodano produkt", payload?.message || "Produkt został zapisany", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert("Błąd", err.message || "Nie udało się dodać produktu");
    } finally {
      setSubmitting(false);
    }
  };

const getDisplayName = (item) => {
  if (!item) return "(bez nazwy)";
  if (typeof item === "string") return item;
  const candidate =
    item.name ||
    item.displayName ||
    item.typeName ||
    item.unitName ||
    item.label ||
    item.code ||
    item.symbol ||
    item.value;
  return candidate || "(bez nazwy)";
};

const getItemId = (item) => {
  if (item == null) return null;
  if (typeof item === "string" || typeof item === "number") return String(item);
  return (
    item.id ??
    item.typeId ??
    item.unitId ??
    item.value ??
    item.code ??
    item.uuid ??
    item.key ??
    item.name ??
    item.displayName ??
    null
  );
};

const normalizeSelection = (item) => {
  if (!item) return null;
  const id = getItemId(item);
  return {
    id: id ? String(id) : null,
    label: getDisplayName(item),
    raw: item,
  };
};

const resolveProductTypeValue = (selection) => {
  if (!selection) return null;
  const raw = selection.raw;
  if (typeof raw === "string") return raw;
  const candidates = [
    raw?.value,
    raw?.code,
    raw?.type,
    raw?.symbol,
    raw?.key,
    raw?.name,
    selection.id,
  ];
  return candidates.find((item) => item !== undefined && item !== null && String(item).trim().length > 0) || null;
};

const resolveUnitValue = (selection) => {
  if (!selection) return null;
  const raw = selection.raw;
  if (typeof raw === "string") return raw;
  const candidates = [
    raw?.value,
    raw?.code,
    raw?.symbol,
    raw?.key,
    raw?.id,
    selection.id,
  ];
  return candidates.find((item) => item !== undefined && item !== null && String(item).trim().length > 0) || null;
};

  const renderTypeItem = ({ item }) => {
    const candidateId = getItemId(item);
    const isSelected = selectedType?.id && candidateId && String(selectedType.id) === String(candidateId);
    return (
      <Pressable
        onPress={() => {
          setSelectedType(normalizeSelection(item));
          setShowTypePicker(false);
        }}
        style={({ pressed }) => [styles.typeOption, isSelected && styles.typeOptionSelected, pressed && styles.typeOptionPressed]}
      >
        <Text style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}>
          {getDisplayName(item)}
        </Text>
      </Pressable>
    );
  };

  const renderUnitItem = ({ item }) => {
    const candidateId = getItemId(item);
    const isSelected = selectedUnit?.id && candidateId && String(selectedUnit.id) === String(candidateId);
    return (
      <Pressable
        onPress={() => {
          setSelectedUnit(normalizeSelection(item));
          setShowUnitPicker(false);
        }}
        style={({ pressed }) => [styles.typeOption, isSelected && styles.typeOptionSelected, pressed && styles.typeOptionPressed]}
      >
        <Text style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}>
          {getDisplayName(item)}
        </Text>
      </Pressable>
    );
  };

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
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                <Text style={styles.title}>Dodaj produkt</Text>
                <Text style={styles.headerSubtitle}>Uzupełnij dane produktu bazowego</Text>
              </View>
            </View>

            <LinearGradient
              colors={["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              {brand ? (
                <View style={styles.brandBox}>
                  <View style={styles.brandIcon}>
                    <Text style={styles.brandIconText}>✓</Text>
                  </View>
                  <View style={styles.brandCopy}>
                    <Text style={styles.brandLabel}>ROZPOZNANA MARKA</Text>
                    <Text style={styles.brandValue}>{brand}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nazwa produktu</Text>
                <TextInput
                  placeholder="np. Jogurt naturalny"
                  placeholderTextColor="#98A3A2"
                  value={form.name}
                  onChangeText={(value) => updateForm("name", value)}
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Kod EAN</Text>
                  <Text style={styles.optionalLabel}>OPCJONALNIE</Text>
                </View>
                <TextInput
                  placeholder="np. 5901234123457"
                  placeholderTextColor="#98A3A2"
                  value={form.ean}
                  keyboardType="number-pad"
                  onChangeText={(value) => updateForm("ean", value)}
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Domyślna jednostka</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.selector,
                    showUnitPicker && styles.selectorActive,
                    pressed && styles.selectorPressed,
                  ]}
                  onPress={() => setShowUnitPicker(true)}
                  disabled={unitsLoading}
                >
                  {unitsLoading ? (
                    <ActivityIndicator color="#304B54" />
                  ) : (
                    <>
                      <Text style={[styles.selectorText, !selectedUnit && styles.selectorPlaceholder]}>
                        {selectedUnit?.label || "Wybierz jednostkę"}
                      </Text>
                      <Text style={styles.selectorChevron}>⌄</Text>
                    </>
                  )}
                </Pressable>
                {unitsError ? (
                  <Pressable style={styles.typesError} onPress={loadUnits}>
                    <Text style={styles.typesErrorText}>{unitsError}</Text>
                    <Text style={styles.typesErrorReload}>Dotknij, aby spróbować ponownie</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Typ produktu</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.selector,
                    showTypePicker && styles.selectorActive,
                    pressed && styles.selectorPressed,
                  ]}
                  onPress={() => setShowTypePicker(true)}
                  disabled={typesLoading}
                >
                  {typesLoading ? (
                    <ActivityIndicator color="#304B54" />
                  ) : (
                    <>
                      <Text style={[styles.selectorText, !selectedType && styles.selectorPlaceholder]}>
                        {selectedType?.label || "Wybierz typ"}
                      </Text>
                      <Text style={styles.selectorChevron}>⌄</Text>
                    </>
                  )}
                </Pressable>
                {typesError ? (
                  <Pressable style={styles.typesError} onPress={loadTypes}>
                    <Text style={styles.typesErrorText}>{typesError}</Text>
                    <Text style={styles.typesErrorReload}>Dotknij, aby spróbować ponownie</Text>
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  submitting && styles.submitDisabled,
                  pressed && !submitting && styles.submitPressed,
                ]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Zapisz produkt</Text>
                    <Text style={styles.submitArrow}>›</Text>
                  </>
                )}
              </Pressable>
            </LinearGradient>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={showTypePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.typeModal}>
            <View style={styles.modalHandle} />
            <View style={styles.typeModalHeader}>
              <Text style={styles.typeModalTitle}>Wybierz typ produktu</Text>
              <Pressable onPress={() => setShowTypePicker(false)}>
                <Text style={styles.typeModalClose}>Zamknij</Text>
              </Pressable>
            </View>
            {typesLoading ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color="#304B54" />
              </View>
            ) : (
              <FlatList
                data={types}
                keyExtractor={(item, index) => String(item?.id ?? index)}
                renderItem={renderTypeItem}
                contentContainerStyle={styles.typeList}
                ListEmptyComponent={() => (
                  <View style={styles.emptyTypeBox}>
                    <Text style={styles.emptyTypeText}>Brak dostępnych typów</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showUnitPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUnitPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.typeModal}>
            <View style={styles.modalHandle} />
            <View style={styles.typeModalHeader}>
              <Text style={styles.typeModalTitle}>Wybierz jednostkę</Text>
              <Pressable onPress={() => setShowUnitPicker(false)}>
                <Text style={styles.typeModalClose}>Zamknij</Text>
              </Pressable>
            </View>
            {unitsLoading ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color="#304B54" />
              </View>
            ) : (
              <FlatList
                data={unitOptions}
                keyExtractor={(item, index) => String(item?.id ?? index)}
                renderItem={renderUnitItem}
                contentContainerStyle={styles.typeList}
                ListEmptyComponent={() => (
                  <View style={styles.emptyTypeBox}>
                    <Text style={styles.emptyTypeText}>Brak dostępnych jednostek</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -80, right: -80, backgroundColor: "rgba(215,225,217,0.62)" },
  glowMiddle: { width: 280, height: 280, top: 330, left: -150, backgroundColor: "rgba(249,224,174,0.28)" },
  glowBottom: { width: 300, height: 300, bottom: -110, right: -130, backgroundColor: "rgba(189,214,211,0.42)" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
    paddingBottom: 22,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,250,0.76)",
    alignItems: "center",
    justifyContent: "center",
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
  card: {
    borderRadius: 28,
    padding: 22,
    gap: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#173746",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  fieldGroup: { gap: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontWeight: "700", color: "#33484D", fontSize: 14, lineHeight: 20 },
  optionalLabel: { color: "#91A0A2", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  input: {
    minHeight: 54,
    backgroundColor: "rgba(255,255,255,0.68)",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(73,102,108,0.14)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#182326",
  },
  selector: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.68)",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(73,102,108,0.14)",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  selectorActive: { borderColor: "rgba(48,75,84,0.62)" },
  selectorPressed: { opacity: 0.8 },
  selectorText: { flex: 1, fontSize: 16, color: "#182326" },
  selectorPlaceholder: { color: "#98A3A2" },
  selectorChevron: { color: "#789097", fontSize: 22, lineHeight: 24, marginLeft: 12 },
  typesError: {
    backgroundColor: "rgba(255,247,244,0.90)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(164,73,62,0.12)",
    padding: 12,
    alignItems: "center",
  },
  typesErrorText: { color: "#913D34", fontWeight: "600", textAlign: "center" },
  typesErrorReload: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  submitButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#304B54",
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 16,
    marginTop: 2,
    shadowColor: "#19343D",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  submitButtonText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  submitArrow: { position: "absolute", right: 22, color: "#FFFFFF", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  submitDisabled: { opacity: 0.7 },
  submitPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(23,37,42,0.36)",
    justifyContent: "flex-end",
  },
  typeModal: {
    backgroundColor: "#F7F7F1",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 28,
    maxHeight: "72%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#C8D0CE", marginTop: 10 },
  typeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(55,78,84,0.16)",
  },
  typeModalTitle: { color: "#182326", fontSize: 19, fontWeight: "800" },
  typeModalClose: { color: "#365964", fontWeight: "800" },
  modalLoader: { padding: 20, alignItems: "center" },
  typeList: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  emptyTypeBox: { padding: 40, alignItems: "center" },
  emptyTypeText: { color: "#697A7D" },
  typeOption: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.74)",
    borderWidth: 1,
    borderColor: "rgba(73,102,108,0.10)",
  },
  typeOptionSelected: {
    backgroundColor: "rgba(208,225,222,0.70)",
    borderWidth: 1,
    borderColor: "rgba(48,75,84,0.44)",
  },
  typeOptionPressed: { opacity: 0.8 },
  typeOptionText: { fontSize: 16, color: "#33484D" },
  typeOptionTextSelected: { color: "#203F49", fontWeight: "800" },
  brandBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "rgba(220,234,229,0.62)",
    borderRadius: 17,
    padding: 13,
    borderWidth: 1,
    borderColor: "rgba(69,100,102,0.10)",
  },
  brandIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#4F7472" },
  brandIconText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  brandCopy: { flex: 1 },
  brandLabel: { fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1, color: "#698083" },
  brandValue: { fontSize: 15, lineHeight: 20, fontWeight: "800", color: "#27454C" },
});
