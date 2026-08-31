import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const formatFridgeCount = (count) => {
  if (count === 1) return "1 lodówka";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} lodówki`;
  }
  return `${count} lodówek`;
};

const formatRole = (role) => {
  const normalized = String(role || "").toUpperCase();
  if (normalized === "OWNER") return "Właściciel";
  if (normalized === "ADMIN") return "Administrator";
  if (normalized === "MEMBER" || normalized === "USER") return "Domownik";
  return role || "Domownik";
};

function FridgeGlyph() {
  return (
    <View style={glyphStyles.fridge}>
      <View style={glyphStyles.divider} />
      <View style={[glyphStyles.handle, glyphStyles.handleTop]} />
      <View style={[glyphStyles.handle, glyphStyles.handleBottom]} />
    </View>
  );
}

export default function FridgeListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, activeFridge, setActiveFridge } = useAuth();
  const [fridges, setFridges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(null);
  const [addVisible, setAddVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadFridges = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setListError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fridges`, {
        method: "GET",
        headers: authHeaders,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      setFridges(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setListError(err.message || "Nie udało się pobrać lodówek");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadFridges();
  }, [loadFridges]);

  const openAddModal = () => {
    setNewName("");
    setModalError(null);
    setAddVisible(true);
  };

  const closeAddModal = () => {
    if (!saving) setAddVisible(false);
  };

  const handleAddFridge = async () => {
    if (!newName.trim()) {
      setModalError("Podaj nazwę lodówki");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fridges`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: newName.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }

      if (payload && payload.id) {
        setFridges((prev) => [payload, ...prev]);
        setActiveFridge(String(payload.id));
      } else {
        await loadFridges();
      }
      setAddVisible(false);
    } catch (err) {
      setModalError(err.message || "Nie udało się dodać lodówki");
    } finally {
      setSaving(false);
    }
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
              <Text style={styles.eyebrow}>USTAWIENIA</Text>
              <Text style={styles.title}>Moje lodówki</Text>
              <Text style={styles.headerSubtitle}>
                {loading ? "Sprawdzam listę..." : formatFridgeCount(fridges.length)}
              </Text>
            </View>
          </View>

          {listError && !loading ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorBannerText}>{listError}</Text>
                <Pressable onPress={() => loadFridges()}>
                  <Text style={styles.errorBannerAction}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Otwieram listę lodówek...</Text>
            </View>
          ) : (
            <FlatList
              data={fridges}
              keyExtractor={(item, index) => String(item?.id ?? index)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => loadFridges(true)}
              ListHeaderComponent={fridges.length ? (
                <View style={styles.listHint}>
                  <Text style={styles.listHintDot}>•</Text>
                  <Text style={styles.listHintText}>Dotknij lodówki, aby ustawić ją jako aktywną</Text>
                </View>
              ) : null}
              ListEmptyComponent={() => (
                <LinearGradient
                  colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                  style={styles.emptyBox}
                >
                  <View style={styles.emptyIconBadge}>
                    <FridgeGlyph />
                  </View>
                  <Text style={styles.emptyTitle}>Dodaj pierwszą lodówkę</Text>
                  <Text style={styles.emptySubtitle}>
                    Utwórz miejsce, w którym będziesz przechowywać produkty i terminy ważności.
                  </Text>
                </LinearGradient>
              )}
              renderItem={({ item }) => {
                const isActive = Boolean(activeFridge) && String(item?.id) === String(activeFridge);
                const itemName = item?.name || "Bez nazwy";
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={itemName}
                    accessibilityState={{ selected: isActive }}
                    onPress={() => setActiveFridge(item?.id)}
                    style={({ pressed }) => [styles.cardShell, pressed && styles.cardPressed]}
                  >
                    <LinearGradient
                      colors={isActive
                        ? ["rgba(239,249,246,0.96)", "rgba(221,239,234,0.88)"]
                        : ["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.card, isActive && styles.cardActive]}
                    >
                      <View style={[styles.fridgeIconBadge, isActive && styles.fridgeIconBadgeActive]}>
                        <FridgeGlyph />
                      </View>
                      <View style={styles.cardCopy}>
                        <View style={styles.cardHeadingRow}>
                          <Text style={styles.itemName} numberOfLines={2}>{itemName}</Text>
                          {isActive ? (
                            <View style={styles.activeBadge}>
                              <Text style={styles.activeBadgeCheck}>✓</Text>
                              <Text style={styles.activeBadgeText}>AKTYWNA</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.itemRole}>{formatRole(item?.roleOfCurrentUser)}</Text>
                      </View>
                      {!isActive ? <Text style={styles.cardChevron}>›</Text> : null}
                    </LinearGradient>
                  </Pressable>
                );
              }}
            />
          )}

          <View style={[styles.addArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dodaj nową lodówkę"
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              onPress={openAddModal}
            >
              <View style={styles.addIconCircle}>
                <Text style={styles.addIcon}>+</Text>
              </View>
              <Text style={styles.addButtonText}>Dodaj lodówkę</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={closeAddModal}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeAddModal} />
            <LinearGradient
              colors={["rgba(255,255,251,0.98)", "rgba(239,244,240,0.96)"]}
              style={styles.modalCard}
            >
              <View style={styles.modalHandle} />
              <Text style={styles.modalEyebrow}>NOWE MIEJSCE</Text>
              <Text style={styles.modalTitle}>Dodaj lodówkę</Text>
              <Text style={styles.modalSubtitle}>Nadaj jej krótką, łatwą do rozpoznania nazwę.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Nazwa</Text>
                <TextInput
                  accessibilityLabel="Nazwa lodówki"
                  placeholder="np. Kuchnia"
                  placeholderTextColor="#98A2A3"
                  value={newName}
                  onChangeText={setNewName}
                  style={styles.modalInput}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAddFridge}
                  editable={!saving}
                />
              </View>

              {modalError ? (
                <View style={styles.modalErrorBox}>
                  <Text style={styles.modalErrorIcon}>!</Text>
                  <Text style={styles.errorText}>{modalError}</Text>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.modalCancel]}
                  onPress={closeAddModal}
                  disabled={saving}
                >
                  <Text style={styles.modalCancelText}>Anuluj</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalConfirm, saving && styles.modalDisabled]}
                  onPress={handleAddFridge}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Dodaj</Text>
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
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { color: "#667579", fontSize: 14 },
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
  errorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A4493E" },
  errorIconText: { color: "#FFFFFF", fontWeight: "800" },
  errorCopy: { flex: 1 },
  errorBannerText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  errorBannerAction: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  listContent: { paddingBottom: 24, gap: 14 },
  listHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingBottom: 2 },
  listHintDot: { color: "#7D9098", fontSize: 18, lineHeight: 18 },
  listHintText: { color: "#78888C", fontSize: 12, lineHeight: 17 },
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
  emptySubtitle: { maxWidth: 285, color: "#667579", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7 },
  cardShell: {
    width: "100%",
    borderRadius: 25,
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  card: {
    minHeight: 112,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  cardActive: { borderColor: "rgba(255,255,255,1)" },
  fridgeIconBadge: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,243,244,0.84)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  fridgeIconBadgeActive: { backgroundColor: "rgba(217,239,232,0.94)" },
  cardCopy: { flex: 1, minWidth: 0 },
  cardHeadingRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  itemName: { flex: 1, color: "#151917", fontSize: 19, lineHeight: 24, fontWeight: "700" },
  itemRole: { color: "#667579", fontSize: 14, lineHeight: 20, marginTop: 5 },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "rgba(48,100,81,0.11)",
  },
  activeBadgeCheck: { color: "#376C59", fontSize: 10, lineHeight: 11, fontWeight: "900" },
  activeBadgeText: { color: "#376C59", fontSize: 8, lineHeight: 10, fontWeight: "900", letterSpacing: 0.5 },
  cardChevron: { alignSelf: "flex-start", color: "#A4B5BA", fontSize: 35, lineHeight: 35, fontWeight: "300", marginTop: 4 },
  addArea: { paddingTop: 10 },
  addButton: {
    minHeight: 66,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#304B54",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.30)",
    shadowColor: "#173746",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  addButtonPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  addIconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.13)" },
  addIcon: { color: "#FFFFFF", fontSize: 25, lineHeight: 27, fontWeight: "400" },
  addButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 18 },
  modalRoot: { flex: 1 },
  modalOverlay: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 24 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,35,39,0.34)" },
  modalCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 20,
    gap: 10,
    shadowColor: "#173746",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(48,75,84,0.18)", marginBottom: 4 },
  modalEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.2 },
  modalTitle: { color: "#172222", fontSize: 26, lineHeight: 31, fontWeight: "700" },
  modalSubtitle: { color: "#667579", fontSize: 14, lineHeight: 20, marginBottom: 4 },
  fieldGroup: { gap: 7 },
  inputLabel: { color: "#52666D", fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginLeft: 4 },
  modalInput: {
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
  modalErrorBox: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, backgroundColor: "rgba(164,73,62,0.09)" },
  modalErrorIcon: { width: 22, height: 22, borderRadius: 11, overflow: "hidden", textAlign: "center", lineHeight: 22, color: "#FFFFFF", backgroundColor: "#A4493E", fontWeight: "800" },
  errorText: { flex: 1, color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalButton: { flex: 1, minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalCancel: { backgroundColor: "rgba(48,75,84,0.07)" },
  modalConfirm: { backgroundColor: "#304B54" },
  modalDisabled: { opacity: 0.7 },
  modalCancelText: { color: "#596B70", fontSize: 14, fontWeight: "700" },
  modalConfirmText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

const glyphStyles = StyleSheet.create({
  fridge: { width: 29, height: 40, borderWidth: 2.2, borderColor: "#173746", borderRadius: 6 },
  divider: { position: "absolute", left: 0, right: 0, top: 17, height: 2, backgroundColor: "#173746" },
  handle: { position: "absolute", right: 5, width: 2.5, height: 7, borderRadius: 2, backgroundColor: "#173746" },
  handleTop: { top: 6 },
  handleBottom: { top: 23 },
});
