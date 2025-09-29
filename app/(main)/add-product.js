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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

export default function AddProductScreen() {
  const router = useRouter();
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

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

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
      colors={["#FFF8E6", "#FFE19A", "#FFF3C9"]}
      locations={[0, 0.55, 1]}
      style={styles.background}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backLabel}>←</Text>
          </Pressable>
          <Text style={styles.title}>Dodaj produkt</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Nazwa</Text>
          <TextInput
            placeholder="np. Jogurt naturalny"
            value={form.name}
            onChangeText={(value) => updateForm("name", value)}
            style={styles.input}
          />

          <Text style={styles.label}>Kod EAN</Text>
          <TextInput
            placeholder="opcjonalnie"
            value={form.ean}
            keyboardType="number-pad"
            onChangeText={(value) => updateForm("ean", value)}
            style={styles.input}
          />

          <Text style={styles.label}>Domyślna jednostka</Text>
          <Pressable
            style={[styles.selector, showUnitPicker && styles.selectorActive]}
            onPress={() => setShowUnitPicker(true)}
            disabled={unitsLoading}
          >
            {unitsLoading ? (
              <ActivityIndicator color="#1F6FEB" />
            ) : (
              <Text style={styles.selectorText}>
                {selectedUnit?.label || "Wybierz jednostkę"}
              </Text>
            )}
          </Pressable>
          {unitsError ? (
            <Pressable style={styles.typesError} onPress={loadUnits}>
              <Text style={styles.typesErrorText}>{unitsError}</Text>
              <Text style={styles.typesErrorReload}>Dotknij, aby spróbować ponownie</Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>Typ produktu</Text>
          <Pressable
            style={[styles.selector, showTypePicker && styles.selectorActive]}
            onPress={() => setShowTypePicker(true)}
            disabled={typesLoading}
          >
            {typesLoading ? (
              <ActivityIndicator color="#1F6FEB" />
            ) : (
              <Text style={styles.selectorText}>
                {selectedType?.label || "Wybierz typ"}
              </Text>
            )}
          </Pressable>
          {typesError ? (
            <Pressable style={styles.typesError} onPress={loadTypes}>
              <Text style={styles.typesErrorText}>{typesError}</Text>
              <Text style={styles.typesErrorReload}>Dotknij, aby spróbować ponownie</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.submitButton, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Zapisz produkt</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showTypePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.typeModal}>
            <View style={styles.typeModalHeader}>
              <Text style={styles.typeModalTitle}>Wybierz typ produktu</Text>
              <Pressable onPress={() => setShowTypePicker(false)}>
                <Text style={styles.typeModalClose}>Zamknij</Text>
              </Pressable>
            </View>
            {typesLoading ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color="#1F6FEB" />
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
            <View style={styles.typeModalHeader}>
              <Text style={styles.typeModalTitle}>Wybierz jednostkę</Text>
              <Pressable onPress={() => setShowUnitPicker(false)}>
                <Text style={styles.typeModalClose}>Zamknij</Text>
              </Pressable>
            </View>
            {unitsLoading ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="large" color="#1F6FEB" />
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
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
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
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,190,120,0.4)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  selector: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,190,120,0.4)",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorActive: {
    borderColor: "#1F6FEB",
  },
  selectorText: { fontSize: 15, color: "#3F3116" },
  typesError: {
    backgroundColor: "rgba(214,69,80,0.1)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  typesErrorText: { color: "#B71C1C", fontWeight: "600" },
  typesErrorReload: { color: "#1F6FEB", fontWeight: "600", marginTop: 4 },
  submitButton: {
    backgroundColor: "#1F6FEB",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  submitDisabled: { opacity: 0.7 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  typeModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  typeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  typeModalTitle: { fontSize: 18, fontWeight: "700" },
  typeModalClose: { color: "#1F6FEB", fontWeight: "700" },
  modalLoader: { padding: 20, alignItems: "center" },
  typeList: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  emptyTypeBox: { padding: 40, alignItems: "center" },
  emptyTypeText: { color: "#666" },
  typeOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F6F6FB",
  },
  typeOptionSelected: {
    backgroundColor: "rgba(31,111,235,0.12)",
    borderWidth: 1,
    borderColor: "#1F6FEB",
  },
  typeOptionPressed: { opacity: 0.8 },
  typeOptionText: { fontSize: 15, color: "#3F3116" },
  typeOptionTextSelected: { color: "#1F6FEB", fontWeight: "700" },
});
