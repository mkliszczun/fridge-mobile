import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";
import { addDaysToIso, formatMealDate, todayIso } from "../../utils/mealDates";

const DEFAULT_DAYS = 3;
const DEFAULT_SERVINGS = 2;
const MAX_DAYS = 10;

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const buildSlots = (startDate, days, current = []) => (
  Array.from({ length: days }, (_, index) => {
    const plannedDate = addDaysToIso(startDate, index);
    return current.find((slot) => slot.plannedDate === plannedDate) || {
      plannedDate,
      recipeId: null,
      recipeName: null,
      saved: false,
    };
  })
);

function Stepper({ label, value, min, max, onChange, disabled = false }) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Zmniejsz: ${label}`}
          disabled={disabled || value <= min}
          onPress={() => onChange(value - 1)}
          style={({ pressed }) => [
            styles.stepperButton,
            (disabled || value <= min) && styles.controlDisabled,
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Zwiększ: ${label}`}
          disabled={disabled || value >= max}
          onPress={() => onChange(value + 1)}
          style={({ pressed }) => [
            styles.stepperButton,
            (disabled || value >= max) && styles.controlDisabled,
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={styles.stepperButtonText}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PlanMealsScreen() {
  const router = useRouter();
  const { token, activeFridge } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState(null);
  const [startDate, setStartDate] = useState(todayIso);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [slots, setSlots] = useState(() => buildSlots(todayIso(), DEFAULT_DAYS));
  const [pickerDate, setPickerDate] = useState(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [includeFridgeContents, setIncludeFridgeContents] = useState(true);
  const [aiGuidelines, setAiGuidelines] = useState("");
  const [aiError, setAiError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadRecipes = useCallback(async () => {
    setLoadingRecipes(true);
    setRecipesError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/recipes`, {
        method: "GET",
        headers,
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      setRecipes(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setRecipesError(err.message || "Nie udało się pobrać przepisów");
    } finally {
      setLoadingRecipes(false);
    }
  }, [headers]);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

  const hasSavedSlots = slots.some((slot) => slot.saved);
  const filledCount = slots.filter((slot) => slot.recipeId).length;

  const changeStartDate = (difference) => {
    if (hasSavedSlots) return;
    const nextDate = addDaysToIso(startDate, difference);
    if (nextDate < todayIso()) return;
    setStartDate(nextDate);
    setSlots((current) => buildSlots(nextDate, days, current));
    setSaveError(null);
  };

  const changeDays = (nextDays) => {
    if (hasSavedSlots) return;
    setDays(nextDays);
    setSlots((current) => buildSlots(startDate, nextDays, current));
    setSaveError(null);
  };

  const selectRecipe = (recipe) => {
    setSlots((current) => current.map((slot) => (
      slot.plannedDate === pickerDate
        ? { ...slot, recipeId: recipe.id, recipeName: recipe.name }
        : slot
    )));
    setPickerDate(null);
    setSaveError(null);
  };

  const clearRecipe = (plannedDate) => {
    setSlots((current) => current.map((slot) => (
      slot.plannedDate === plannedDate && !slot.saved
        ? { ...slot, recipeId: null, recipeName: null }
        : slot
    )));
    setSaveError(null);
  };

  const buildAiGuidelines = () => {
    const filledSlots = slots.filter((slot) => slot.recipeId);
    const sections = [];
    if (aiGuidelines.trim()) {
      sections.push(`Wskazówki użytkownika: ${aiGuidelines.trim()}`);
    }
    if (filledSlots.length) {
      const fixedMeals = filledSlots
        .map((slot) => `${slot.plannedDate}: ${slot.recipeName} (${slot.recipeId})`)
        .join("; ");
      sections.push(
        `Zachowaj już wybrane posiłki i dobierz pozostałe dni: ${fixedMeals}`
      );
    }

    const guidelines = sections.join("\n");
    if (guidelines.length > 1000) {
      throw new Error(
        "Wskazówki razem z wybranymi posiłkami przekraczają limit 1000 znaków. Skróć uwagi."
      );
    }
    return guidelines || null;
  };

  const handleGenerate = async () => {
    if (!activeFridge) {
      setAiError("Najpierw wybierz aktywną lodówkę.");
      return;
    }
    if (!recipes.length) {
      setAiError("Najpierw dodaj przynajmniej jeden przepis.");
      return;
    }

    let guidelines;
    try {
      guidelines = buildAiGuidelines();
    } catch (err) {
      setAiError(err.message);
      return;
    }

    setGenerating(true);
    setAiError(null);
    try {
      const generatorPath = includeFridgeContents
        ? "generate-from-recipes-with-fridge"
        : "generate-from-recipes";
      const response = await fetch(
        `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/ai/meal-plans/${generatorPath}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ startDate, days, servings, guidelines }),
        }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        const fallback = response.status === 503
          ? "Planowanie AI jest chwilowo niedostępne."
          : `HTTP ${response.status}`;
        throw new Error(payload?.message || payload?.error || fallback);
      }
      if (!Array.isArray(payload?.meals)) {
        throw new Error("AI zwróciło niepełny plan. Spróbuj ponownie.");
      }

      const proposals = new Map(
        payload.meals.map((meal) => [String(meal?.plannedDate), meal])
      );
      let filledByAi = 0;
      const mergedSlots = slots.map((slot) => {
        if (slot.recipeId) return slot;
        const proposal = proposals.get(slot.plannedDate);
        if (!proposal?.recipeId) return slot;
        filledByAi += 1;
        return {
          ...slot,
          recipeId: proposal.recipeId,
          recipeName: proposal.recipeName || "Przepis wybrany przez AI",
        };
      });

      if (!filledByAi && filledCount < days) {
        throw new Error("AI nie uzupełniło pustych dni. Spróbuj ponownie.");
      }
      setSlots(mergedSlots);
      setAiVisible(false);
      setAiGuidelines("");
      setSaveError(null);
    } catch (err) {
      setAiError(err.message || "Nie udało się przygotować planu");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!activeFridge) {
      setSaveError("Najpierw wybierz aktywną lodówkę.");
      return;
    }
    const missingMeal = slots.find((slot) => !slot.recipeId);
    if (missingMeal) {
      setSaveError(`Wybierz przepis na dzień: ${formatMealDate(missingMeal.plannedDate)}.`);
      return;
    }

    const pendingSlots = slots.filter((slot) => !slot.saved);
    if (!pendingSlots.length) {
      router.back();
      return;
    }

    setSaving(true);
    setSaveError(null);
    const savedDates = [];
    try {
      for (const slot of pendingSlots) {
        const response = await fetch(
          `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/planned-meals`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              recipeId: slot.recipeId,
              plannedDate: slot.plannedDate,
              servings,
            }),
          }
        );
        const payload = await readPayload(response);
        if (!response.ok) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }
        savedDates.push(slot.plannedDate);
      }

      setSlots((current) => current.map((slot) => (
        savedDates.includes(slot.plannedDate) ? { ...slot, saved: true } : slot
      )));
      router.back();
    } catch (err) {
      setSlots((current) => current.map((slot) => (
        savedDates.includes(slot.plannedDate) ? { ...slot, saved: true } : slot
      )));
      setSaveError(
        savedDates.length
          ? `Zapisano ${savedDates.length} z ${pendingSlots.length} pozostałych dni. ${err.message || "Spróbuj zapisać resztę ponownie."}`
          : (err.message || "Nie udało się zapisać planu posiłków")
      );
    } finally {
      setSaving(false);
    }
  };

  const closeAi = () => {
    if (generating) return;
    setAiVisible(false);
    setAiError(null);
  };

  const canUseForm = activeFridge && !loadingRecipes && !recipesError;

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
              <Text style={styles.eyebrow}>NOWY PLAN</Text>
              <Text style={styles.title}>Zaplanuj posiłki</Text>
              <Text style={styles.headerSubtitle}>Wybierz przepisy ręcznie lub poproś AI</Text>
            </View>
          </View>

          {!activeFridge ? (
            <View style={styles.blockingState}>
              <Text style={styles.blockingTitle}>Brak aktywnej lodówki</Text>
              <Text style={styles.blockingText}>Wybierz lodówkę, dla której chcesz ułożyć plan.</Text>
              <Pressable
                onPress={() => router.push("/fridges")}
                style={({ pressed }) => [styles.primarySmallButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.primarySmallButtonText}>Wybierz lodówkę</Text>
              </Pressable>
            </View>
          ) : loadingRecipes ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loadingText}>Pobieram Twoje przepisy...</Text>
            </View>
          ) : recipesError ? (
            <View style={styles.blockingState}>
              <Text style={styles.blockingTitle}>Nie udało się pobrać przepisów</Text>
              <Text style={styles.blockingText}>{recipesError}</Text>
              <Pressable
                onPress={loadRecipes}
                style={({ pressed }) => [styles.primarySmallButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.primarySmallButtonText}>Spróbuj ponownie</Text>
              </Pressable>
            </View>
          ) : !recipes.length ? (
            <View style={styles.blockingState}>
              <Text style={styles.blockingTitle}>Najpierw dodaj przepis</Text>
              <Text style={styles.blockingText}>Plan może korzystać wyłącznie z zapisanych przepisów.</Text>
              <Pressable
                onPress={() => router.push("/add-recipe")}
                style={({ pressed }) => [styles.primarySmallButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.primarySmallButtonText}>Dodaj przepis</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <LinearGradient
                colors={["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
                style={styles.controlsCard}
              >
                <View style={styles.dateControl}>
                  <Text style={styles.controlLabel}>Początek planu</Text>
                  <View style={styles.dateStepper}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Poprzedni dzień"
                      disabled={hasSavedSlots || startDate <= todayIso()}
                      onPress={() => changeStartDate(-1)}
                      style={({ pressed }) => [
                        styles.dateArrow,
                        (hasSavedSlots || startDate <= todayIso()) && styles.controlDisabled,
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text style={styles.dateArrowText}>‹</Text>
                    </Pressable>
                    <Text style={styles.dateValue}>{formatMealDate(startDate)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Następny dzień"
                      disabled={hasSavedSlots}
                      onPress={() => changeStartDate(1)}
                      style={({ pressed }) => [
                        styles.dateArrow,
                        hasSavedSlots && styles.controlDisabled,
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text style={styles.dateArrowText}>›</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.controlDivider} />
                <Stepper
                  label="Liczba dni"
                  value={days}
                  min={1}
                  max={MAX_DAYS}
                  onChange={changeDays}
                  disabled={hasSavedSlots}
                />
                <View style={styles.controlDivider} />
                <Stepper
                  label="Liczba porcji"
                  value={servings}
                  min={1}
                  max={99}
                  onChange={(value) => {
                    setServings(value);
                    setSaveError(null);
                  }}
                  disabled={hasSavedSlots}
                />
              </LinearGradient>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Uzupełnij plan z pomocą AI"
                disabled={!canUseForm || hasSavedSlots}
                onPress={() => {
                  setAiError(null);
                  setAiVisible(true);
                }}
                style={({ pressed }) => [
                  styles.aiButton,
                  hasSavedSlots && styles.controlDisabled,
                  pressed && !hasSavedSlots && styles.buttonPressed,
                ]}
              >
                <View style={styles.aiIcon}>
                  <Text style={styles.aiSparkle}>✦</Text>
                </View>
                <View style={styles.aiCopy}>
                  <Text style={styles.aiEyebrow}>ASYSTENT AI</Text>
                  <Text style={styles.aiTitle}>Uzupełnij puste dni</Text>
                  <Text style={styles.aiSubtitle}>Ręczne wybory pozostaną bez zmian</Text>
                </View>
                <Text style={styles.aiChevron}>›</Text>
              </Pressable>

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>PLAN</Text>
                  <Text style={styles.sectionTitle}>Posiłki na kolejne dni</Text>
                </View>
                <Text style={styles.sectionCount}>{filledCount}/{days}</Text>
              </View>

              <View style={styles.slotsList}>
                {slots.map((slot, index) => (
                  <LinearGradient
                    key={slot.plannedDate}
                    colors={slot.saved
                      ? ["rgba(235,247,241,0.96)", "rgba(221,239,232,0.88)"]
                      : ["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
                    style={[styles.slotCard, slot.saved && styles.slotCardSaved]}
                  >
                    <View style={styles.slotNumber}>
                      <Text style={styles.slotNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.slotCopy}>
                      <Text style={styles.slotDate}>{formatMealDate(slot.plannedDate)}</Text>
                      <Text
                        style={[styles.slotRecipe, !slot.recipeId && styles.slotPlaceholder]}
                        numberOfLines={2}
                      >
                        {slot.recipeName || "Wybierz przepis"}
                      </Text>
                      {slot.saved ? <Text style={styles.savedLabel}>ZAPISANO</Text> : null}
                    </View>
                    {slot.recipeId && !slot.saved ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Usuń wybór na ${formatMealDate(slot.plannedDate)}`}
                        onPress={() => clearRecipe(slot.plannedDate)}
                        style={styles.clearButton}
                      >
                        <Text style={styles.clearButtonText}>×</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Wybierz przepis na ${formatMealDate(slot.plannedDate)}`}
                      disabled={slot.saved}
                      onPress={() => setPickerDate(slot.plannedDate)}
                      style={({ pressed }) => [
                        styles.chooseButton,
                        slot.saved && styles.controlDisabled,
                        pressed && styles.controlPressed,
                      ]}
                    >
                      <Text style={styles.chooseButtonText}>{slot.recipeId ? "Zmień" : "Wybierz"}</Text>
                    </Pressable>
                  </LinearGradient>
                ))}
              </View>

              {saveError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorIconText}>!</Text>
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zapisz plan posiłków"
                disabled={saving}
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.submitButton,
                  saving && styles.submitDisabled,
                  pressed && !saving && styles.submitPressed,
                ]}
              >
                {saving ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.submitText}>Zapisuję plan...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.submitText}>
                      {hasSavedSlots ? "Zapisz pozostałe dni" : "Zapisz plan"}
                    </Text>
                    <Text style={styles.submitArrow}>›</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={Boolean(pickerDate)}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerDate(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerDate(null)} />
          <View style={styles.recipeSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>PRZEPISY</Text>
                <Text style={styles.modalTitle}>Wybierz posiłek</Text>
                <Text style={styles.modalSubtitle}>{formatMealDate(pickerDate)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zamknij listę przepisów"
                onPress={() => setPickerDate(null)}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.recipePickerList} showsVerticalScrollIndicator={false}>
              {recipes.map((recipe) => {
                const selected = slots.some((slot) => (
                  slot.plannedDate === pickerDate && slot.recipeId === recipe.id
                ));
                return (
                  <Pressable
                    key={recipe.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => selectRecipe(recipe)}
                    style={({ pressed }) => [
                      styles.recipeOption,
                      selected && styles.recipeOptionSelected,
                      pressed && styles.controlPressed,
                    ]}
                  >
                    <View style={styles.recipeOptionCopy}>
                      <Text style={styles.recipeOptionName}>{recipe.name || "Przepis bez nazwy"}</Text>
                      <Text style={styles.recipeOptionDescription} numberOfLines={2}>
                        {recipe.description || `${recipe.servings || 0} porcji`}
                      </Text>
                    </View>
                    <Text style={styles.recipeOptionCheck}>{selected ? "✓" : "›"}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={aiVisible} transparent animationType="fade" onRequestClose={closeAi}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeAi} />
          <View style={styles.aiSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>ASYSTENT AI</Text>
                <Text style={styles.modalTitle}>Wskazówki do planu</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zamknij"
                disabled={generating}
                onPress={closeAi}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.aiDescription}>
              Uzupełnione dni zostaną przekazane AI i pozostaną bez zmian. Uwagi są opcjonalne.
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Uwzględnij to, co mam w lodówce"
              accessibilityState={{ checked: includeFridgeContents, disabled: generating }}
              disabled={generating}
              onPress={() => setIncludeFridgeContents((current) => !current)}
              style={({ pressed }) => [
                styles.fridgeCheckboxRow,
                includeFridgeContents && styles.fridgeCheckboxRowSelected,
                pressed && !generating && styles.controlPressed,
              ]}
            >
              <View
                style={[
                  styles.fridgeCheckbox,
                  includeFridgeContents && styles.fridgeCheckboxSelected,
                ]}
              >
                {includeFridgeContents ? (
                  <Text style={styles.fridgeCheckboxMark}>✓</Text>
                ) : null}
              </View>
              <View style={styles.fridgeCheckboxCopy}>
                <Text style={styles.fridgeCheckboxTitle}>
                  Uwzględnij to, co mam w lodówce
                </Text>
                <Text style={styles.fridgeCheckboxDescription}>
                  AI dobierze przepisy również do dostępnych produktów i ich terminów ważności.
                </Text>
              </View>
            </Pressable>
            {filledCount ? (
              <View style={styles.contextNotice}>
                <Text style={styles.contextNoticeIcon}>✓</Text>
                <Text style={styles.contextNoticeText}>
                  Przekażę AI {filledCount} {filledCount === 1 ? "wybrany dzień" : "wybrane dni"}.
                </Text>
              </View>
            ) : null}
            <TextInput
              value={aiGuidelines}
              onChangeText={setAiGuidelines}
              placeholder="np. lekkie dania, bez mięsa, wykorzystaj zupy..."
              placeholderTextColor="#98A3A2"
              style={styles.aiInput}
              multiline
              textAlignVertical="top"
              maxLength={1000}
              editable={!generating}
            />
            <Text style={styles.aiCounter}>{aiGuidelines.length}/1000</Text>
            {aiError ? (
              <View style={styles.aiErrorBanner}>
                <Text style={styles.errorIconText}>!</Text>
                <Text style={styles.errorText}>{aiError}</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Generuj plan posiłków"
              disabled={generating}
              onPress={handleGenerate}
              style={({ pressed }) => [
                styles.generateButton,
                generating && styles.submitDisabled,
                pressed && !generating && styles.submitPressed,
              ]}
            >
              {generating ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.generateText}>AI układa plan...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.generateSparkle}>✦</Text>
                  <Text style={styles.generateText}>Uzupełnij plan</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 38 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -80, right: -80, backgroundColor: "rgba(215,225,217,0.62)" },
  glowMiddle: { width: 280, height: 280, top: 490, left: -150, backgroundColor: "rgba(249,224,174,0.28)" },
  glowBottom: { width: 300, height: 300, bottom: -110, right: -130, backgroundColor: "rgba(189,214,211,0.42)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 15, paddingBottom: 22 },
  backButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1, paddingTop: 1 },
  eyebrow: { color: "#7D9098", fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#151917", fontSize: 34, lineHeight: 39, fontWeight: "700", marginTop: 2, fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }) },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 4 },
  blockingState: { minHeight: 320, alignItems: "center", justifyContent: "center", borderRadius: 27, padding: 26, backgroundColor: "rgba(255,255,251,0.84)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  blockingTitle: { color: "#1C2A2D", fontSize: 21, lineHeight: 27, fontWeight: "800", textAlign: "center" },
  blockingText: { color: "#697A7D", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7 },
  primarySmallButton: { minHeight: 50, borderRadius: 17, alignItems: "center", justifyContent: "center", paddingHorizontal: 22, marginTop: 18, backgroundColor: "#304B54" },
  primarySmallButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  loadingState: { minHeight: 320, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#687A7F", fontSize: 14, marginTop: 12 },
  controlsCard: { borderRadius: 26, padding: 18, gap: 15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
  dateControl: { gap: 10 },
  controlLabel: { color: "#33484D", fontSize: 14, lineHeight: 20, fontWeight: "800" },
  dateStepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dateArrow: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(226,237,233,0.78)" },
  dateArrowText: { color: "#36545C", fontSize: 29, lineHeight: 31, fontWeight: "300" },
  dateValue: { flex: 1, color: "#263A3F", fontSize: 15, lineHeight: 20, fontWeight: "800", textAlign: "center" },
  controlDivider: { height: 1, backgroundColor: "rgba(70,95,99,0.10)" },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(226,237,233,0.78)" },
  stepperButtonText: { color: "#36545C", fontSize: 23, lineHeight: 25, fontWeight: "500" },
  stepperValue: { minWidth: 34, color: "#22373D", fontSize: 18, lineHeight: 24, fontWeight: "900", textAlign: "center" },
  controlDisabled: { opacity: 0.42 },
  controlPressed: { transform: [{ scale: 0.96 }], opacity: 0.84 },
  aiButton: { minHeight: 88, borderRadius: 23, padding: 14, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(237,244,241,0.78)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.94)", shadowColor: "#173746", shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  aiIcon: { width: 47, height: 47, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,251,0.80)" },
  aiSparkle: { color: "#365964", fontSize: 27, lineHeight: 29 },
  aiCopy: { flex: 1 },
  aiEyebrow: { color: "#7D9098", fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 1.1 },
  aiTitle: { color: "#24444D", fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 2 },
  aiSubtitle: { color: "#74868A", fontSize: 11, lineHeight: 16, marginTop: 2 },
  aiChevron: { color: "#8CA0A5", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 27, marginBottom: 13, paddingHorizontal: 3 },
  sectionEyebrow: { color: "#7D9098", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  sectionTitle: { color: "#182326", fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: 2 },
  sectionCount: { minWidth: 46, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,251,0.76)", color: "#35545E", textAlign: "center", lineHeight: 34, fontWeight: "900", overflow: "hidden" },
  slotsList: { gap: 12 },
  slotCard: { minHeight: 100, borderRadius: 23, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", padding: 15, flexDirection: "row", alignItems: "center", gap: 11, shadowColor: "#173746", shadowOpacity: 0.08, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  slotCardSaved: { borderColor: "rgba(111,151,137,0.22)" },
  slotNumber: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#DCEAE7" },
  slotNumberText: { color: "#31535C", fontSize: 12, fontWeight: "900" },
  slotCopy: { flex: 1 },
  slotDate: { color: "#7A8C90", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  slotRecipe: { color: "#192426", fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 3 },
  slotPlaceholder: { color: "#93A0A1", fontWeight: "600" },
  savedLabel: { color: "#4E786B", fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  clearButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(164,73,62,0.08)" },
  clearButtonText: { color: "#9A5147", fontSize: 20, lineHeight: 22 },
  chooseButton: { minHeight: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: "rgba(225,236,233,0.84)" },
  chooseButtonText: { color: "#365760", fontSize: 12, fontWeight: "800" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,247,244,0.92)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 16, padding: 13, marginTop: 16 },
  errorIconText: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#A4493E", color: "#FFFFFF", textAlign: "center", lineHeight: 24, fontWeight: "900", overflow: "hidden" },
  errorText: { flex: 1, color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  submitButton: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#304B54", borderRadius: 18, paddingHorizontal: 22, paddingVertical: 16, marginTop: 16, shadowColor: "#19343D", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  submitText: { color: "#FFFFFF", fontWeight: "800", fontSize: 17 },
  submitArrow: { position: "absolute", right: 22, color: "#FFFFFF", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  submitDisabled: { opacity: 0.65 },
  submitPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(23,37,42,0.38)" },
  recipeSheet: { maxHeight: "78%", borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 34 : 24, backgroundColor: "#F7F7F1", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", shadowColor: "#102B35", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  aiSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 34 : 24, backgroundColor: "#F7F7F1", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", shadowColor: "#102B35", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#C8D0CE", marginBottom: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  modalHeaderCopy: { flex: 1 },
  modalEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.2 },
  modalTitle: { color: "#182326", fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 },
  modalSubtitle: { color: "#748489", fontSize: 12, lineHeight: 17, marginTop: 2 },
  modalClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(225,234,231,0.80)" },
  modalCloseText: { color: "#425F66", fontSize: 25, lineHeight: 27, fontWeight: "300" },
  recipePickerList: { marginTop: 14 },
  recipeOption: { minHeight: 70, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: "rgba(73,102,108,0.10)" },
  recipeOptionSelected: { backgroundColor: "rgba(219,236,229,0.84)", borderColor: "rgba(79,116,105,0.20)" },
  recipeOptionCopy: { flex: 1 },
  recipeOptionName: { color: "#203034", fontSize: 15, lineHeight: 20, fontWeight: "800" },
  recipeOptionDescription: { color: "#748489", fontSize: 12, lineHeight: 17, marginTop: 3 },
  recipeOptionCheck: { color: "#4F7469", fontSize: 20, fontWeight: "800" },
  aiDescription: { color: "#65777C", fontSize: 13, lineHeight: 19, marginTop: 11 },
  fridgeCheckboxRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 17, borderWidth: 1, borderColor: "rgba(73,102,108,0.12)", backgroundColor: "rgba(255,255,255,0.62)", paddingHorizontal: 13, paddingVertical: 11, marginTop: 13 },
  fridgeCheckboxRowSelected: { borderColor: "rgba(76,116,105,0.24)", backgroundColor: "rgba(221,237,231,0.76)" },
  fridgeCheckbox: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.7, borderColor: "#9CACA9", backgroundColor: "rgba(255,255,255,0.74)" },
  fridgeCheckboxSelected: { borderColor: "#4F7469", backgroundColor: "#4F7469" },
  fridgeCheckboxMark: { color: "#FFFFFF", fontSize: 16, lineHeight: 19, fontWeight: "900" },
  fridgeCheckboxCopy: { flex: 1 },
  fridgeCheckboxTitle: { color: "#263D3C", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  fridgeCheckboxDescription: { color: "#697D79", fontSize: 11, lineHeight: 16, marginTop: 2 },
  contextNotice: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, marginTop: 13, backgroundColor: "rgba(217,233,226,0.70)" },
  contextNoticeIcon: { width: 22, height: 22, borderRadius: 11, color: "#FFFFFF", backgroundColor: "#52756D", textAlign: "center", lineHeight: 22, fontSize: 12, fontWeight: "900", overflow: "hidden" },
  contextNoticeText: { flex: 1, color: "#526E68", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  aiInput: { minHeight: 118, maxHeight: 180, borderRadius: 17, borderWidth: 1, borderColor: "rgba(73,102,108,0.14)", backgroundColor: "rgba(255,255,255,0.76)", paddingHorizontal: 15, paddingVertical: 13, marginTop: 13, color: "#182326", fontSize: 15, lineHeight: 21 },
  aiCounter: { alignSelf: "flex-end", color: "#98A3A2", fontSize: 10, marginTop: 5 },
  aiErrorBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,247,244,0.92)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 15, padding: 12, marginTop: 10 },
  generateButton: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15, marginTop: 13, backgroundColor: "#4F6B72", shadowColor: "#19343D", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  generateSparkle: { color: "#F3DCAC", fontSize: 21 },
  generateText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
