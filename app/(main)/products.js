import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

const getErrorMessage = (payload, status, fallback) => {
  if (payload?.message) return payload.message;
  if (Array.isArray(payload?.details) && payload.details.length) return payload.details.join("\n");
  if (payload?.error) return payload.error;
  return fallback || `HTTP ${status}`;
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
  const [editProduct, setEditProduct] = useState(null);
  const [shelfLifeValue, setShelfLifeValue] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);

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

  const openEditProduct = useCallback((product) => {
    setEditProduct(product);
    setShelfLifeValue(
      product?.shelfLifeAfterOpeningDays == null
        ? ""
        : String(product.shelfLifeAfterOpeningDays)
    );
  }, []);

  const closeEditProduct = useCallback(() => {
    if (savingProduct) return;
    setEditProduct(null);
    setShelfLifeValue("");
  }, [savingProduct]);

  const saveProduct = useCallback(async () => {
    const productId = editProduct?.id;
    if (!productId) {
      Alert.alert("Błąd", "Nie udało się zidentyfikować produktu.");
      return;
    }

    const trimmedValue = shelfLifeValue.trim();
    const shelfLifeAfterOpeningDays = trimmedValue === "" ? null : Number(trimmedValue);
    if (
      shelfLifeAfterOpeningDays !== null
      && (!Number.isInteger(shelfLifeAfterOpeningDays) || shelfLifeAfterOpeningDays < 0)
    ) {
      Alert.alert("Błędna wartość", "Podaj liczbę pełnych dni równą 0 lub większą.");
      return;
    }

    setSavingProduct(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${productId}/shelf-life-after-opening`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ shelfLifeAfterOpeningDays }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getErrorMessage(payload, res.status, "Nie udało się zaktualizować produktu."));
      }

      setProducts((current) => current.map((product) => (
        product?.id === productId ? { ...product, ...payload } : product
      )));
      setEditProduct(null);
      setShelfLifeValue("");
      Alert.alert("Zapisano", "Czas przydatności po otwarciu został zaktualizowany.");
    } catch (err) {
      Alert.alert("Błąd", err.message || "Nie udało się zaktualizować produktu.");
    } finally {
      setSavingProduct(false);
    }
  }, [editProduct, headers, shelfLifeValue]);

  const deleteProduct = useCallback((product) => {
    const productId = product?.id;
    if (!productId) {
      Alert.alert("Błąd", "Nie udało się zidentyfikować produktu.");
      return;
    }

    Alert.alert(
      "Usuń produkt",
      `Czy na pewno chcesz usunąć „${product?.name || "Bez nazwy"}”?`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            setDeletingProductId(productId);
            try {
              const res = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
                method: "DELETE",
                headers,
              });
              const payload = await res.json().catch(() => null);
              if (!res.ok) {
                throw new Error(getErrorMessage(payload, res.status, "Nie udało się usunąć produktu."));
              }

              setProducts((current) => current.filter((item) => item?.id !== productId));
            } catch (err) {
              Alert.alert("Błąd", err.message || "Nie udało się usunąć produktu.");
            } finally {
              setDeletingProductId(null);
            }
          },
        },
      ]
    );
  }, [headers]);

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
                    <Text style={styles.shelfLifeText}>
                      {item?.shelfLifeAfterOpeningDays == null
                        ? "Po otwarciu: czas domyślny dla typu"
                        : `Po otwarciu: ${item.shelfLifeAfterOpeningDays} dni`}
                    </Text>
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edytuj ${item?.name || "produkt"}`}
                      disabled={deletingProductId === item?.id}
                      onPress={() => openEditProduct(item)}
                      style={({ pressed }) => [
                        styles.cardAction,
                        styles.editAction,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.editActionText}>Edytuj</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Usuń ${item?.name || "produkt"}`}
                      disabled={deletingProductId === item?.id}
                      onPress={() => deleteProduct(item)}
                      style={({ pressed }) => [
                        styles.cardAction,
                        styles.deleteAction,
                        deletingProductId === item?.id && styles.actionDisabled,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      {deletingProductId === item?.id ? (
                        <ActivityIndicator size="small" color="#A4493E" />
                      ) : (
                        <Text style={styles.deleteActionText}>Usuń</Text>
                      )}
                    </Pressable>
                  </View>
                </LinearGradient>
              )}
            />
          )}
        </View>
      </SafeAreaView>

      <Modal transparent visible={Boolean(editProduct)} animationType="fade" onRequestClose={closeEditProduct}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalKeyboardView}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeEditProduct} />
            <LinearGradient
              colors={["rgba(255,255,251,0.98)", "rgba(239,244,240,0.96)"]}
              style={styles.editModal}
            >
              <View style={styles.modalHandle} />
              <Text style={styles.modalEyebrow}>EDYTUJ PRODUKT</Text>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {editProduct?.name || "Bez nazwy"}
              </Text>
              <Text style={styles.modalSubtitle}>
                Ustaw indywidualny czas przydatności po otwarciu. Puste pole przywraca wartość domyślną dla typu produktu.
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Liczba dni po otwarciu</Text>
                <TextInput
                  accessibilityLabel="Liczba dni po otwarciu"
                  value={shelfLifeValue}
                  onChangeText={setShelfLifeValue}
                  keyboardType="number-pad"
                  placeholder="Wartość domyślna"
                  placeholderTextColor="#98A2A3"
                  editable={!savingProduct}
                  style={styles.input}
                />
              </View>
              <View style={styles.modalActions}>
                <Pressable
                  disabled={savingProduct}
                  onPress={closeEditProduct}
                  style={[styles.modalActionButton, styles.modalCancelButton, savingProduct && styles.actionDisabled]}
                >
                  <Text style={styles.modalCancelText}>Anuluj</Text>
                </Pressable>
                <Pressable
                  disabled={savingProduct}
                  onPress={saveProduct}
                  style={[styles.modalActionButton, styles.modalSaveButton, savingProduct && styles.actionDisabled]}
                >
                  {savingProduct ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveText}>Zapisz</Text>
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
  shelfLifeText: { color: "#718287", fontSize: 11, lineHeight: 16, marginTop: 7 },
  cardActions: { gap: 7, alignSelf: "stretch", justifyContent: "center" },
  cardAction: { minWidth: 68, minHeight: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  editAction: { backgroundColor: "rgba(48,75,84,0.09)" },
  editActionText: { color: "#304B54", fontSize: 12, fontWeight: "800" },
  deleteAction: { backgroundColor: "rgba(164,73,62,0.09)" },
  deleteActionText: { color: "#A4493E", fontSize: 12, fontWeight: "800" },
  actionDisabled: { opacity: 0.45 },
  modalKeyboardView: { flex: 1 },
  modalOverlay: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 24 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,35,39,0.34)" },
  editModal: { width: "100%", maxWidth: 430, borderRadius: 30, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", padding: 20, gap: 11, elevation: 10, shadowColor: "#173746", shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(48,75,84,0.18)", marginBottom: 4 },
  modalEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.2 },
  modalTitle: { color: "#172222", fontSize: 25, lineHeight: 30, fontWeight: "700" },
  modalSubtitle: { color: "#667579", fontSize: 13, lineHeight: 19 },
  fieldGroup: { gap: 7, marginTop: 2 },
  fieldLabel: { color: "#33484D", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  input: { minHeight: 56, backgroundColor: "rgba(238,244,242,0.80)", borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", paddingHorizontal: 17, paddingVertical: 14, color: "#162326", fontSize: 16 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalActionButton: { flex: 1, minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalCancelButton: { backgroundColor: "rgba(48,75,84,0.07)" },
  modalSaveButton: { backgroundColor: "#304B54" },
  modalCancelText: { color: "#596B70", fontSize: 14, fontWeight: "700" },
  modalSaveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

const glyphStyles = StyleSheet.create({
  wrap: { width: 34, height: 39, alignItems: "center" },
  lid: { width: 24, height: 4, borderRadius: 2, backgroundColor: "#173746", marginBottom: 2 },
  jar: { width: 29, height: 31, borderWidth: 2.2, borderColor: "#173746", borderRadius: 7, alignItems: "center", justifyContent: "center" },
  label: { width: 15, height: 8, borderRadius: 3, backgroundColor: "rgba(23,55,70,0.18)" },
});
