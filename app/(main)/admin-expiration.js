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

const TYPE_ORDER = Object.keys(TYPE_LABELS);

const formatRuleCount = (count) => {
  if (count === 1) return "1 skonfigurowany typ";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} skonfigurowane typy`;
  }
  return `${count} skonfigurowanych typów`;
};

const formatDays = (value) => {
  if (value === null || value === undefined) return "Nie ustawiono";
  const days = Number(value);
  if (days === 1) return "1 dzień";
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${days} dni`;
  }
  return `${days} dni`;
};

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const responseError = (response, payload, fallback) => {
  if (response.status === 403) return "To konto nie ma uprawnień administratora.";
  if (response.status === 401) return "Sesja wygasła. Zaloguj się ponownie.";
  return payload?.message || fallback || `HTTP ${response.status}`;
};

function ExpirationGlyph() {
  return (
    <View style={glyphStyles.calendar}>
      <View style={glyphStyles.calendarTop} />
      <View style={glyphStyles.ringLeft} />
      <View style={glyphStyles.ringRight} />
      <View style={glyphStyles.clockHandVertical} />
      <View style={glyphStyles.clockHandHorizontal} />
    </View>
  );
}

export default function AdminExpirationScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editorValue, setEditorValue] = useState("");
  const [editorError, setEditorError] = useState(null);
  const [saving, setSaving] = useState(false);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadRules = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/expiration`, {
        method: "GET",
        headers,
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(responseError(response, payload, "Nie udało się pobrać terminów"));
      }
      const nextRules = Array.isArray(payload) ? payload : [];
      nextRules.sort((left, right) => {
        const leftIndex = TYPE_ORDER.indexOf(left?.productType);
        const rightIndex = TYPE_ORDER.indexOf(right?.productType);
        return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
      });
      setRules(nextRules);
    } catch (err) {
      setError(err.message || "Nie udało się pobrać terminów");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headers]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const openEditor = (rule, field) => {
    setEditor({ productType: rule.productType, field });
    setEditorValue(rule?.[field] === null || rule?.[field] === undefined ? "" : String(rule[field]));
    setEditorError(null);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setEditorValue("");
    setEditorError(null);
  };

  const saveRule = async () => {
    if (!editor) return;
    const rawValue = editorValue.trim();
    if (!/^\d+$/.test(rawValue)) {
      setEditorError("Podaj pełną liczbę dni równą lub większą od zera.");
      return;
    }
    const days = Number(rawValue);
    if (!Number.isSafeInteger(days)) {
      setEditorError("Podana liczba jest zbyt duża.");
      return;
    }

    const isDefault = editor.field === "defaultExpirationDays";
    const path = isDefault ? "default" : "after-opening";
    const body = isDefault
      ? { defaultExpirationDays: days }
      : { expirationDaysAfterOpening: days };

    setSaving(true);
    setEditorError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/expiration/${path}?productType=${encodeURIComponent(editor.productType)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(responseError(response, payload, "Nie udało się zapisać terminu"));
      }

      setRules((current) => current.map((rule) => (
        rule.productType === editor.productType
          ? { ...rule, [editor.field]: days }
          : rule
      )));
      setEditor(null);
      setEditorValue("");
    } catch (err) {
      setEditorError(err.message || "Nie udało się zapisać terminu");
    } finally {
      setSaving(false);
    }
  };

  const editorIsDefault = editor?.field === "defaultExpirationDays";
  const editorTypeLabel = TYPE_LABELS[editor?.productType] || editor?.productType || "Typ produktu";

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
              <Text style={styles.eyebrow}>REGUŁY</Text>
              <Text style={styles.title}>Domyślne terminy</Text>
              <Text style={styles.headerSubtitle}>
                {loading ? "Sprawdzam ustawienia..." : formatRuleCount(rules.length)}
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
                <Pressable onPress={() => loadRules()}>
                  <Text style={styles.retryText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Pobieram reguły...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorSpacer} />
          ) : (
            <FlatList
              data={rules}
              keyExtractor={(item, index) => String(item?.productType ?? index)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => loadRules(true)}
              ListHeaderComponent={rules.length ? (
                <View style={styles.listHint}>
                  <Text style={styles.listHintDot}>•</Text>
                  <Text style={styles.listHintText}>Dotknij wartości, którą chcesz zmienić</Text>
                </View>
              ) : null}
              ListEmptyComponent={() => (
                <LinearGradient
                  colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                  style={styles.emptyBox}
                >
                  <View style={styles.emptyIconBadge}>
                    <ExpirationGlyph />
                  </View>
                  <Text style={styles.emptyTitle}>Brak reguł do edycji</Text>
                  <Text style={styles.emptySubtitle}>
                    Panel pokaże typy produktów, gdy zostaną skonfigurowane w systemie.
                  </Text>
                </LinearGradient>
              )}
              renderItem={({ item }) => {
                const typeLabel = TYPE_LABELS[item?.productType] || item?.productType || "Inny typ";
                return (
                  <LinearGradient
                    colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.card}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.typeIconBadge}>
                        <ExpirationGlyph />
                      </View>
                      <View style={styles.cardHeaderCopy}>
                        <Text style={styles.cardEyebrow}>{item?.productType}</Text>
                        <Text style={styles.cardTitle}>{typeLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.rulesBox}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Termin domyślny: ${formatDays(item?.defaultExpirationDays)}`}
                        onPress={() => openEditor(item, "defaultExpirationDays")}
                        style={({ pressed }) => [styles.ruleRow, pressed && styles.ruleRowPressed]}
                      >
                        <View style={styles.ruleCopy}>
                          <Text style={styles.ruleLabel}>Termin domyślny</Text>
                          <Text style={styles.ruleDescription}>Od dodania produktu</Text>
                        </View>
                        <Text style={styles.ruleValue}>{formatDays(item?.defaultExpirationDays)}</Text>
                        <Text style={styles.ruleChevron}>›</Text>
                      </Pressable>

                      <View style={styles.ruleDivider} />

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Po otwarciu: ${formatDays(item?.expirationDaysAfterOpening)}`}
                        onPress={() => openEditor(item, "expirationDaysAfterOpening")}
                        style={({ pressed }) => [styles.ruleRow, pressed && styles.ruleRowPressed]}
                      >
                        <View style={styles.ruleCopy}>
                          <Text style={styles.ruleLabel}>Po otwarciu</Text>
                          <Text style={styles.ruleDescription}>Czas od pierwszego otwarcia</Text>
                        </View>
                        <Text style={styles.ruleValue}>{formatDays(item?.expirationDaysAfterOpening)}</Text>
                        <Text style={styles.ruleChevron}>›</Text>
                      </Pressable>
                    </View>
                  </LinearGradient>
                );
              }}
            />
          )}
        </View>
      </SafeAreaView>

      <Modal visible={Boolean(editor)} transparent animationType="fade" onRequestClose={closeEditor}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeEditor} />
            <LinearGradient
              colors={["rgba(255,255,251,0.98)", "rgba(239,244,240,0.96)"]}
              style={styles.modalCard}
            >
              <View style={styles.modalHandle} />
              <Text style={styles.modalEyebrow}>{editorTypeLabel.toUpperCase()}</Text>
              <Text style={styles.modalTitle}>
                {editorIsDefault ? "Termin domyślny" : "Termin po otwarciu"}
              </Text>
              <Text style={styles.modalSubtitle}>
                {editorIsDefault
                  ? "Liczba dni ważności od dodania produktu."
                  : "Liczba dni ważności od pierwszego otwarcia."}
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Liczba dni</Text>
                <TextInput
                  accessibilityLabel="Liczba dni"
                  value={editorValue}
                  onChangeText={setEditorValue}
                  style={styles.modalInput}
                  placeholder="np. 7"
                  placeholderTextColor="#98A2A3"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={saveRule}
                  editable={!saving}
                  autoFocus
                  selectTextOnFocus
                />
              </View>

              {editorError ? (
                <View style={styles.modalErrorBox}>
                  <Text style={styles.modalErrorIcon}>!</Text>
                  <Text style={styles.modalErrorText}>{editorError}</Text>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.modalCancel]}
                  onPress={closeEditor}
                  disabled={saving}
                >
                  <Text style={styles.modalCancelText}>Anuluj</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalConfirm, saving && styles.modalDisabled]}
                  onPress={saveRule}
                  disabled={saving}
                >
                  {saving ? (
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
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "700",
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
  },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 5 },
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
  errorText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  retryText: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  errorSpacer: { flex: 1 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { color: "#667579", fontSize: 14 },
  listContent: { paddingBottom: 34, gap: 14 },
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
  emptyIconBadge: { width: 72, height: 72, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.86)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  emptyTitle: { color: "#172222", fontSize: 22, fontWeight: "700", marginTop: 17 },
  emptySubtitle: { maxWidth: 285, color: "#667579", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7 },
  card: {
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 17,
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 15 },
  typeIconBadge: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.86)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  cardHeaderCopy: { flex: 1 },
  cardEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.1 },
  cardTitle: { color: "#151917", fontSize: 21, lineHeight: 26, fontWeight: "700", marginTop: 2 },
  rulesBox: { borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(235,242,239,0.66)" },
  ruleRow: { minHeight: 69, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 9 },
  ruleRowPressed: { backgroundColor: "rgba(48,75,84,0.06)" },
  ruleCopy: { flex: 1 },
  ruleLabel: { color: "#253A40", fontSize: 14, lineHeight: 19, fontWeight: "700" },
  ruleDescription: { color: "#7A898D", fontSize: 11, lineHeight: 15, marginTop: 2 },
  ruleValue: { color: "#304B54", fontSize: 14, fontWeight: "800" },
  ruleChevron: { color: "#A4B5BA", fontSize: 28, lineHeight: 29, fontWeight: "300" },
  ruleDivider: { height: StyleSheet.hairlineWidth, marginLeft: 14, backgroundColor: "rgba(48,75,84,0.13)" },
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
  modalInput: { minHeight: 56, backgroundColor: "rgba(238,244,242,0.80)", borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", paddingHorizontal: 17, paddingVertical: 14, color: "#162326", fontSize: 16 },
  modalErrorBox: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, backgroundColor: "rgba(164,73,62,0.09)" },
  modalErrorIcon: { width: 22, height: 22, borderRadius: 11, overflow: "hidden", textAlign: "center", lineHeight: 22, color: "#FFFFFF", backgroundColor: "#A4493E", fontWeight: "800" },
  modalErrorText: { flex: 1, color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalButton: { flex: 1, minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalCancel: { backgroundColor: "rgba(48,75,84,0.07)" },
  modalConfirm: { backgroundColor: "#304B54" },
  modalDisabled: { opacity: 0.7 },
  modalCancelText: { color: "#596B70", fontSize: 14, fontWeight: "700" },
  modalConfirmText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});

const glyphStyles = StyleSheet.create({
  calendar: { width: 34, height: 34, borderWidth: 2.2, borderColor: "#173746", borderRadius: 6, marginTop: 3 },
  calendarTop: { position: "absolute", left: 0, right: 0, top: 8, height: 2, backgroundColor: "#173746" },
  ringLeft: { position: "absolute", left: 7, top: -5, width: 3, height: 9, borderRadius: 2, backgroundColor: "#173746" },
  ringRight: { position: "absolute", right: 7, top: -5, width: 3, height: 9, borderRadius: 2, backgroundColor: "#173746" },
  clockHandVertical: { position: "absolute", left: 15, top: 16, width: 2.2, height: 8, borderRadius: 2, backgroundColor: "#173746" },
  clockHandHorizontal: { position: "absolute", left: 15, top: 22, width: 7, height: 2.2, borderRadius: 2, backgroundColor: "#173746" },
});
