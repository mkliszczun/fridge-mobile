import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";
import { formatMealDate, parseIsoDate, todayIso } from "../../utils/mealDates";

const MAX_MEALS = 10;

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const formatServings = (count) => {
  if (count === 1) return "1 porcja";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} porcje`;
  }
  return `${count} porcji`;
};

const formatAmount = ({ amount, unit }) => {
  if (amount === null || amount === undefined) return "Ilość do ustalenia";

  const numericAmount = Number(amount);
  const formattedAmount = Number.isFinite(numericAmount)
    ? numericAmount.toLocaleString("pl-PL", { maximumFractionDigits: 2 })
    : String(amount).replace(".", ",");
  const normalizedUnit = String(unit || "").toUpperCase();
  const unitLabel = {
    GRAM: "g",
    MILLILITER: "ml",
    PIECE: "szt.",
  }[normalizedUnit] || unit || "";

  return `${formattedAmount}${unitLabel ? ` ${unitLabel}` : ""}`;
};

const createItemKey = (item, index) => {
  const sourceIds = Array.isArray(item?.plannedMealIngredientIds)
    ? item.plannedMealIngredientIds.join("-")
    : "";
  return `${item?.name || "produkt"}-${item?.unit || ""}-${sourceIds}-${index}`;
};

function BasketGlyph() {
  return (
    <View style={glyphStyles.wrap}>
      <View style={glyphStyles.handle} />
      <View style={glyphStyles.basket}>
        <View style={glyphStyles.line} />
        <View style={glyphStyles.line} />
        <View style={glyphStyles.line} />
      </View>
    </View>
  );
}

export default function ShoppingListScreen() {
  const router = useRouter();
  const { token, activeFridge } = useAuth();
  const [meals, setMeals] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectionError, setSelectionError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [checkedItems, setCheckedItems] = useState(() => new Set());

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadMeals = useCallback(async (showRefreshing = false) => {
    if (!activeFridge) {
      setMeals([]);
      setSelectedIds([]);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/planned-meals`,
        { method: "GET", headers }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const today = todayIso();
      const upcomingMeals = (Array.isArray(payload) ? payload : [])
        .filter((meal) => meal?.id && parseIsoDate(meal?.plannedDate) && meal.plannedDate >= today)
        .sort((left, right) => {
          const dateComparison = left.plannedDate.localeCompare(right.plannedDate);
          if (dateComparison) return dateComparison;
          return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""));
        });

      setMeals(upcomingMeals);
      setSelectedIds(upcomingMeals.slice(0, MAX_MEALS).map((meal) => String(meal.id)));
      setSelectionError(null);
      setGenerationError(null);
      setProposal(null);
      setCheckedItems(new Set());
    } catch (error) {
      setLoadError(error.message || "Nie udało się pobrać zaplanowanych posiłków");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFridge, headers]);

  useFocusEffect(
    useCallback(() => {
      loadMeals();
    }, [loadMeals])
  );

  const toggleMeal = (mealId) => {
    const normalizedId = String(mealId);
    const isSelected = selectedIds.includes(normalizedId);
    if (!isSelected && selectedIds.length >= MAX_MEALS) {
      setSelectionError(`Możesz wybrać maksymalnie ${MAX_MEALS} posiłków.`);
      return;
    }

    setSelectedIds((current) => (
      isSelected
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId]
    ));
    setSelectionError(null);
    setGenerationError(null);
    setProposal(null);
    setCheckedItems(new Set());
  };

  const generateShoppingList = async () => {
    if (!activeFridge) {
      setGenerationError("Najpierw wybierz aktywną lodówkę.");
      return;
    }
    if (!selectedIds.length) {
      setGenerationError("Wybierz przynajmniej jeden zaplanowany posiłek.");
      return;
    }

    setGenerating(true);
    setGenerationError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/ai/shopping-lists/generate`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ plannedMealIds: selectedIds }),
        }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        const fallback = response.status === 503
          ? "Generowanie listy jest chwilowo niedostępne."
          : `HTTP ${response.status}`;
        throw new Error(payload?.message || payload?.error || fallback);
      }
      if (!Array.isArray(payload?.items)) {
        throw new Error("Serwer zwrócił niepełną listę zakupów.");
      }

      setProposal({
        ...payload,
        items: payload.items.map((item, index) => ({
          ...item,
          clientKey: createItemKey(item, index),
        })),
      });
      setCheckedItems(new Set());
    } catch (error) {
      setGenerationError(error.message || "Nie udało się wygenerować listy zakupów");
    } finally {
      setGenerating(false);
    }
  };

  const toggleShoppingItem = (key) => {
    setCheckedItems((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const headerSubtitle = !activeFridge
    ? "Wybierz aktywną lodówkę"
    : `${selectedIds.length} z ${MAX_MEALS} posiłków wybranych`;

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
              style={({ pressed }) => [styles.roundButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.backLabel}>‹</Text>
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>ZAKUPY</Text>
              <Text style={styles.title}>Lista zakupów</Text>
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            </View>
          </View>

          {loadError ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorText}>{loadError}</Text>
                <Pressable onPress={() => loadMeals()}>
                  <Text style={styles.retryText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Pobieram zaplanowane posiłki...</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={(
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadMeals(true)}
                  tintColor="#304B54"
                />
              )}
            >
              {!activeFridge || !meals.length ? (
                <LinearGradient
                  colors={["rgba(255,255,251,0.93)", "rgba(246,247,240,0.82)"]}
                  style={styles.emptyBox}
                >
                  <View style={styles.emptyIconBadge}>
                    <BasketGlyph />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {activeFridge ? "Brak zaplanowanych posiłków" : "Wybierz aktywną lodówkę"}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {activeFridge
                      ? "Lista zakupów powstaje na podstawie posiłków zaplanowanych na najbliższe dni."
                      : "Lista zakupów jest obliczana dla zapasów konkretnej lodówki."}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(activeFridge ? "/plan-meals" : "/fridges")}
                    style={({ pressed }) => [styles.emptyAction, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.emptyActionText}>
                      {activeFridge ? "Zaplanuj posiłki" : "Wybierz lodówkę"}
                    </Text>
                  </Pressable>
                </LinearGradient>
              ) : (
                <>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>WYBIERZ POSIŁKI</Text>
                      <Text style={styles.sectionTitle}>Co planujesz ugotować?</Text>
                    </View>
                    <View style={styles.counterBadge}>
                      <Text style={styles.counterText}>{selectedIds.length}/{MAX_MEALS}</Text>
                    </View>
                  </View>

                  <Text style={styles.sectionHint}>
                    Zaznaczyliśmy najbliższe posiłki. Możesz zmienić wybór przed generowaniem.
                  </Text>

                  <View style={styles.mealList}>
                    {meals.map((meal) => {
                      const selected = selectedIds.includes(String(meal.id));
                      return (
                        <Pressable
                          key={String(meal.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => toggleMeal(meal.id)}
                          style={({ pressed }) => [
                            styles.mealCard,
                            selected && styles.mealCardSelected,
                            pressed && styles.cardPressed,
                          ]}
                        >
                          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                            {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                          </View>
                          <View style={styles.mealCopy}>
                            <Text style={styles.mealDate}>{formatMealDate(meal.plannedDate)}</Text>
                            <Text style={styles.mealName} numberOfLines={2}>
                              {meal?.recipe?.name || "Posiłek bez nazwy"}
                            </Text>
                            <Text style={styles.mealServings}>
                              {formatServings(Number(meal?.servings) || 0)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  {selectionError || generationError ? (
                    <View style={styles.inlineError}>
                      <Text style={styles.inlineErrorText}>{selectionError || generationError}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: generating || !selectedIds.length }}
                    disabled={generating || !selectedIds.length}
                    onPress={generateShoppingList}
                    style={({ pressed }) => [
                      styles.generateButton,
                      (generating || !selectedIds.length) && styles.buttonDisabled,
                      pressed && !generating && selectedIds.length && styles.buttonPressed,
                    ]}
                  >
                    {generating ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.generateIcon}>✦</Text>
                    )}
                    <Text style={styles.generateButtonText}>
                      {generating ? "Generuję listę..." : "Generuj listę zakupów"}
                    </Text>
                  </Pressable>

                  <View style={styles.infoBox}>
                    <Text style={styles.infoIcon}>i</Text>
                    <Text style={styles.infoText}>
                      Lista uwzględnia zapasy i rezerwacje, ale nie jest zapisywana i niczego nie rezerwuje.
                    </Text>
                  </View>

                  {proposal ? (
                    <View style={styles.resultSection}>
                      <View style={styles.sectionHeader}>
                        <View>
                          <Text style={styles.sectionEyebrow}>DO KUPIENIA</Text>
                          <Text style={styles.sectionTitle}>
                            {proposal.items.length
                              ? `${proposal.items.length} ${proposal.items.length === 1 ? "pozycja" : "pozycji"}`
                              : "Masz już wszystko"}
                          </Text>
                        </View>
                        {proposal.items.length ? (
                          <Text style={styles.doneCount}>
                            {checkedItems.size}/{proposal.items.length}
                          </Text>
                        ) : null}
                      </View>

                      {proposal.items.length ? (
                        <View style={styles.shoppingItems}>
                          {proposal.items.map((item) => {
                            const checked = checkedItems.has(item.clientKey);
                            return (
                              <Pressable
                                key={item.clientKey}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked }}
                                onPress={() => toggleShoppingItem(item.clientKey)}
                                style={({ pressed }) => [
                                  styles.shoppingItem,
                                  checked && styles.shoppingItemChecked,
                                  pressed && styles.cardPressed,
                                ]}
                              >
                                <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
                                  {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                                </View>
                                <View style={styles.shoppingItemCopy}>
                                  <Text
                                    style={[styles.shoppingItemName, checked && styles.checkedText]}
                                    numberOfLines={2}
                                  >
                                    {item?.name || "Produkt"}
                                  </Text>
                                  <Text style={[styles.shoppingItemAmount, checked && styles.checkedText]}>
                                    {formatAmount(item)}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <LinearGradient
                          colors={["rgba(237,247,242,0.95)", "rgba(246,249,242,0.86)"]}
                          style={styles.completeBox}
                        >
                          <Text style={styles.completeMark}>✓</Text>
                          <Text style={styles.completeTitle}>Brak brakujących składników</Text>
                          <Text style={styles.completeText}>
                            Według aktualnych zapasów nie musisz niczego dokupować.
                          </Text>
                        </LinearGradient>
                      )}

                      <Text style={styles.localNote}>
                        Odhaczenia są tymczasowe i znikną po opuszczeniu ekranu.
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 15, paddingTop: 16, paddingBottom: 20 },
  roundButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  buttonDisabled: { opacity: 0.45 },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1, paddingTop: 1 },
  eyebrow: { color: "#7D9098", fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#151917", fontSize: 35, lineHeight: 40, fontWeight: "700", marginTop: 2, fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }) },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 4 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,247,244,0.90)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 18, padding: 14, marginBottom: 16 },
  errorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A4493E" },
  errorIconText: { color: "#FFFFFF", fontWeight: "800" },
  errorCopy: { flex: 1 },
  errorText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  retryText: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  loaderText: { color: "#687A7F", fontSize: 14, marginTop: 12 },
  scrollContent: { paddingBottom: 40, flexGrow: 1 },
  emptyBox: { flex: 1, minHeight: 390, borderRadius: 28, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", padding: 28, marginTop: 8, shadowColor: "#173746", shadowOpacity: 0.10, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  emptyIconBadge: { width: 84, height: 84, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.82)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  emptyTitle: { color: "#182326", fontSize: 21, fontWeight: "800", marginTop: 18, textAlign: "center" },
  emptySubtitle: { color: "#697A7D", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7, maxWidth: 290 },
  emptyAction: { minHeight: 50, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#304B54", paddingHorizontal: 22, marginTop: 19 },
  emptyActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 8 },
  sectionEyebrow: { color: "#7D9098", fontSize: 11, lineHeight: 15, fontWeight: "800", letterSpacing: 1.2 },
  sectionTitle: { color: "#172222", fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 3 },
  sectionHint: { color: "#66787D", fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 13 },
  counterBadge: { minWidth: 54, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" },
  counterText: { color: "#294B57", fontSize: 13, fontWeight: "800" },
  mealList: { gap: 9 },
  mealCard: { minHeight: 91, borderRadius: 22, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", backgroundColor: "rgba(255,255,251,0.78)", padding: 14, flexDirection: "row", alignItems: "center", gap: 13, shadowColor: "#173746", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  mealCardSelected: { backgroundColor: "rgba(237,246,244,0.94)", borderColor: "rgba(107,145,145,0.42)" },
  checkbox: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.8, borderColor: "#A8B7B8", backgroundColor: "rgba(255,255,255,0.72)" },
  checkboxSelected: { borderColor: "#345A63", backgroundColor: "#345A63" },
  checkmark: { color: "#FFFFFF", fontSize: 17, lineHeight: 20, fontWeight: "900" },
  mealCopy: { flex: 1 },
  mealDate: { color: "#71858A", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.65, textTransform: "uppercase" },
  mealName: { color: "#172222", fontSize: 17, lineHeight: 22, fontWeight: "800", marginTop: 2 },
  mealServings: { color: "#65767A", fontSize: 12, lineHeight: 17, marginTop: 2 },
  inlineError: { backgroundColor: "rgba(255,247,244,0.90)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 15, padding: 12, marginTop: 13 },
  inlineErrorText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  generateButton: { minHeight: 58, borderRadius: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#304B54", marginTop: 15, paddingHorizontal: 18, shadowColor: "#173746", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  generateIcon: { color: "#FFFFFF", fontSize: 22, lineHeight: 25 },
  generateButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  infoBox: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 17, backgroundColor: "rgba(234,242,239,0.76)", borderWidth: 1, borderColor: "rgba(255,255,255,0.86)", padding: 13, marginTop: 12 },
  infoIcon: { width: 24, height: 24, borderRadius: 12, textAlign: "center", textAlignVertical: "center", color: "#FFFFFF", backgroundColor: "#6F8989", fontSize: 14, lineHeight: 24, fontWeight: "800" },
  infoText: { flex: 1, color: "#5C7074", fontSize: 12, lineHeight: 17 },
  resultSection: { marginTop: 27 },
  doneCount: { color: "#60787B", fontSize: 14, fontWeight: "800" },
  shoppingItems: { gap: 9, marginTop: 14 },
  shoppingItem: { minHeight: 72, borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", backgroundColor: "rgba(255,255,251,0.86)", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 13, shadowColor: "#173746", shadowOpacity: 0.07, shadowRadius: 11, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  shoppingItemChecked: { opacity: 0.58, backgroundColor: "rgba(235,240,236,0.78)" },
  shoppingItemCopy: { flex: 1 },
  shoppingItemName: { color: "#172222", fontSize: 16, lineHeight: 21, fontWeight: "800" },
  shoppingItemAmount: { color: "#60757A", fontSize: 13, lineHeight: 18, marginTop: 2 },
  checkedText: { textDecorationLine: "line-through", color: "#7D8A8B" },
  completeBox: { alignItems: "center", borderRadius: 24, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", padding: 24, marginTop: 14 },
  completeMark: { width: 42, height: 42, borderRadius: 21, textAlign: "center", textAlignVertical: "center", color: "#FFFFFF", backgroundColor: "#587B70", fontSize: 23, lineHeight: 42, fontWeight: "900" },
  completeTitle: { color: "#1D3934", fontSize: 18, fontWeight: "800", marginTop: 12 },
  completeText: { color: "#637A75", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 5 },
  localNote: { color: "#7A8889", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 13 },
});

const glyphStyles = StyleSheet.create({
  wrap: { width: 43, height: 46, alignItems: "center", justifyContent: "flex-end" },
  handle: { position: "absolute", top: 0, width: 21, height: 15, borderWidth: 2.4, borderBottomWidth: 0, borderColor: "#173746", borderTopLeftRadius: 11, borderTopRightRadius: 11 },
  basket: { width: 41, height: 36, borderWidth: 2.4, borderColor: "#173746", borderRadius: 7, paddingHorizontal: 9, paddingTop: 9, gap: 5 },
  line: { width: "100%", height: 2, borderRadius: 1, backgroundColor: "#173746" },
});
