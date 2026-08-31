import { useEffect, useMemo, useRef, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const emptyIngredient = (key) => ({
  key,
  name: "",
  amount: "",
  unit: "",
  optional: false,
  note: "",
});

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const hasIngredientData = (ingredient) => Boolean(
  ingredient.name.trim()
  || ingredient.amount.trim()
  || ingredient.unit.trim()
  || ingredient.note.trim()
  || ingredient.optional
);

const normalizeIngredientName = (value) => String(value || "")
  .trim()
  .toLocaleLowerCase("pl-PL")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const generatedIngredient = (ingredient, key) => ({
  key,
  name: String(ingredient?.name || ""),
  amount: ingredient?.amount === null || ingredient?.amount === undefined
    ? ""
    : String(ingredient.amount),
  unit: String(ingredient?.unit || ""),
  optional: Boolean(ingredient?.optional),
  note: String(ingredient?.note || ""),
});

const mergeIngredients = (current, generated, nextIngredientKey) => {
  const remaining = Array.isArray(generated) ? [...generated] : [];
  const merged = current.map((ingredient) => {
    const hasExistingData = hasIngredientData(ingredient);
    const normalizedName = normalizeIngredientName(ingredient.name);
    const matchIndex = normalizedName
      ? remaining.findIndex((candidate) => normalizeIngredientName(candidate?.name) === normalizedName)
      : (!hasExistingData && remaining.length ? 0 : -1);

    if (matchIndex < 0) return ingredient;
    const candidate = remaining.splice(matchIndex, 1)[0];
    if (!hasExistingData) return generatedIngredient(candidate, ingredient.key);

    return {
      ...ingredient,
      name: ingredient.name.trim() ? ingredient.name : String(candidate?.name || ""),
      amount: ingredient.amount.trim()
        ? ingredient.amount
        : (candidate?.amount === null || candidate?.amount === undefined ? "" : String(candidate.amount)),
      unit: ingredient.unit.trim() ? ingredient.unit : String(candidate?.unit || ""),
      note: ingredient.note.trim() ? ingredient.note : String(candidate?.note || ""),
    };
  });

  const appended = remaining.map((ingredient) => {
    const key = nextIngredientKey.current;
    nextIngredientKey.current += 1;
    return generatedIngredient(ingredient, key);
  });
  return [...merged, ...appended];
};

export default function AddRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const recipeIdParam = Array.isArray(params?.recipeId)
    ? params.recipeId[0]
    : params?.recipeId;
  const recipeId = recipeIdParam ? String(recipeIdParam) : null;
  const isEditing = Boolean(recipeId);
  const { token } = useAuth();
  const nextIngredientKey = useRef(2);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState("2");
  const [ingredients, setIngredients] = useState([emptyIngredient(1)]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiGuidelines, setAiGuidelines] = useState("");
  const [aiError, setAiError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(isEditing);
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  useEffect(() => {
    if (!isEditing) {
      setLoadingRecipe(false);
      setLoadError(null);
      return undefined;
    }

    let cancelled = false;

    const loadRecipe = async () => {
      setLoadingRecipe(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/recipes/${encodeURIComponent(recipeId)}`,
          { method: "GET", headers }
        );
        const payload = await readPayload(response);
        if (!response.ok) {
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }
        if (cancelled) return;

        const loadedIngredients = Array.isArray(payload?.ingredients) && payload.ingredients.length
          ? payload.ingredients.map((ingredient, index) => generatedIngredient(ingredient, index + 1))
          : [emptyIngredient(1)];

        setName(String(payload?.name || ""));
        setDescription(String(payload?.description || ""));
        setInstructions(String(payload?.instructions || ""));
        setServings(payload?.servings === null || payload?.servings === undefined
          ? "2"
          : String(payload.servings));
        setIngredients(loadedIngredients);
        nextIngredientKey.current = loadedIngredients.length + 1;
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || "Nie udało się pobrać przepisu");
        }
      } finally {
        if (!cancelled) setLoadingRecipe(false);
      }
    };

    loadRecipe();
    return () => {
      cancelled = true;
    };
  }, [headers, isEditing, loadAttempt, recipeId]);

  const updateIngredient = (key, field, value) => {
    setIngredients((current) => current.map((ingredient) => (
      ingredient.key === key ? { ...ingredient, [field]: value } : ingredient
    )));
  };

  const addIngredient = () => {
    const key = nextIngredientKey.current;
    nextIngredientKey.current += 1;
    setIngredients((current) => [...current, emptyIngredient(key)]);
  };

  const removeIngredient = (key) => {
    setIngredients((current) => current.filter((ingredient) => ingredient.key !== key));
  };

  const hasFormContext = Boolean(
    name.trim()
    || description.trim()
    || instructions.trim()
    || ingredients.some(hasIngredientData)
  );

  const buildAiGuidelines = () => {
    const existingFields = [];
    if (name.trim()) existingFields.push(`Nazwa: ${name.trim()}`);
    if (description.trim()) existingFields.push(`Opis: ${description.trim()}`);
    if (instructions.trim()) existingFields.push(`Instrukcja: ${instructions.trim()}`);

    const existingIngredients = ingredients
      .filter(hasIngredientData)
      .map((ingredient, index) => {
        const parts = [ingredient.name.trim() || `składnik ${index + 1}`];
        if (ingredient.amount.trim()) parts.push(`ilość ${ingredient.amount.trim()}`);
        if (ingredient.unit.trim()) parts.push(`jednostka ${ingredient.unit.trim()}`);
        if (ingredient.optional) parts.push("opcjonalny");
        if (ingredient.note.trim()) parts.push(`notatka: ${ingredient.note.trim()}`);
        return parts.join(", ");
      });
    if (existingIngredients.length) {
      existingFields.push(`Składniki: ${existingIngredients.join("; ")}`);
    }

    const sections = [];
    if (aiGuidelines.trim()) sections.push(`Wskazówki użytkownika: ${aiGuidelines.trim()}`);
    if (existingFields.length) {
      sections.push(`Zachowaj poniższe dane i uzupełnij tylko brakujące pola. ${existingFields.join(" | ")}`);
    }

    const combined = sections.join("\n");
    if (combined.length > 1000) {
      throw new Error("Wskazówki i zawartość formularza przekraczają limit 1000 znaków. Skróć je przed generowaniem.");
    }
    return combined || null;
  };

  const closeAi = () => {
    if (generating) return;
    setAiVisible(false);
    setAiError(null);
  };

  const handleGenerate = async () => {
    setAiError(null);
    const servingsNumber = Number(servings);
    if (!Number.isInteger(servingsNumber) || servingsNumber <= 0) {
      setAiError("Liczba porcji w formularzu musi być pełną liczbą większą od zera.");
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/recipes/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ servings: servingsNumber, guidelines }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        const fallback = response.status === 503
          ? "Generator AI jest chwilowo niedostępny."
          : `HTTP ${response.status}`;
        throw new Error(payload?.message || payload?.error || fallback);
      }
      if (!payload?.name || !payload?.instructions || !Array.isArray(payload?.ingredients)) {
        throw new Error("Generator zwrócił niepełny przepis. Spróbuj ponownie.");
      }

      setName((current) => current.trim() ? current : String(payload.name || ""));
      setDescription((current) => current.trim() ? current : String(payload.description || ""));
      setInstructions((current) => current.trim() ? current : String(payload.instructions || ""));
      setIngredients((current) => mergeIngredients(current, payload.ingredients, nextIngredientKey));
      setAiVisible(false);
      setAiGuidelines("");
    } catch (err) {
      setAiError(err.message || "Nie udało się wygenerować przepisu");
    } finally {
      setGenerating(false);
    }
  };

  const buildRequest = () => {
    if (!name.trim()) throw new Error("Podaj nazwę przepisu.");
    if (!instructions.trim()) throw new Error("Dodaj instrukcję przygotowania.");

    const servingsNumber = Number(servings);
    if (!Number.isInteger(servingsNumber) || servingsNumber <= 0) {
      throw new Error("Liczba porcji musi być pełną liczbą większą od zera.");
    }

    const normalizedIngredients = ingredients.map((ingredient, index) => {
      const ingredientName = ingredient.name.trim();
      if (!ingredientName) throw new Error(`Podaj nazwę składnika ${index + 1}.`);

      const amountText = ingredient.amount.trim().replace(",", ".");
      const unit = ingredient.unit.trim();
      if ((amountText && !unit) || (!amountText && unit)) {
        throw new Error(`Uzupełnij razem ilość i jednostkę dla składnika ${index + 1}.`);
      }

      let amount = null;
      if (amountText) {
        amount = Number(amountText);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(`Ilość składnika ${index + 1} musi być większa od zera.`);
        }
      }

      return {
        name: ingredientName,
        amount,
        unit: unit || null,
        optional: ingredient.optional,
        note: ingredient.note.trim() || null,
      };
    });

    return {
      name: name.trim(),
      description: description.trim() || null,
      instructions: instructions.trim(),
      servings: servingsNumber,
      ingredients: normalizedIngredients,
    };
  };

  const handleSubmit = async () => {
    setError(null);
    let request;
    try {
      request = buildRequest();
    } catch (err) {
      setError(err.message);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        isEditing
          ? `${API_BASE_URL}/api/recipes/${encodeURIComponent(recipeId)}`
          : `${API_BASE_URL}/api/recipes`,
        {
          method: isEditing ? "PUT" : "POST",
          headers,
          body: JSON.stringify(request),
        }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      router.back();
    } catch (err) {
      setError(
        err.message
          || (isEditing
            ? "Nie udało się zaktualizować przepisu"
            : "Nie udało się zapisać przepisu")
      );
    } finally {
      setSubmitting(false);
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
                <Text style={styles.eyebrow}>
                  {isEditing ? "EDYCJA PRZEPISU" : "NOWY PRZEPIS"}
                </Text>
                <Text style={styles.title}>
                  {isEditing ? "Edytuj przepis" : "Dodaj przepis"}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {isEditing
                    ? "Zmień dane i zapisz gotowy przepis"
                    : "Zapisz własny pomysł krok po kroku"}
                </Text>
              </View>
            </View>

            {loadingRecipe ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#304B54" />
                <Text style={styles.loadingStateText}>Otwieram przepis do edycji...</Text>
              </View>
            ) : loadError ? (
              <View style={styles.loadErrorState}>
                <Text style={styles.loadErrorTitle}>Nie udało się otworzyć przepisu</Text>
                <Text style={styles.loadErrorText}>{loadError}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Spróbuj ponownie pobrać przepis"
                  onPress={() => setLoadAttempt((current) => current + 1)}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.retryButtonText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            ) : (
              <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wypełnij formularz z pomocą AI"
              onPress={() => {
                setAiError(null);
                setAiVisible(true);
              }}
              style={({ pressed }) => [styles.aiAssistButton, pressed && styles.buttonPressed]}
            >
              <View style={styles.aiAssistIcon}>
                <Text style={styles.aiAssistSparkle}>✦</Text>
              </View>
              <View style={styles.aiAssistCopy}>
                <Text style={styles.aiAssistEyebrow}>ASYSTENT AI</Text>
                <Text style={styles.aiAssistTitle}>Wypełnij brakujące pola</Text>
                <Text style={styles.aiAssistSubtitle}>Twoje wpisane dane pozostaną bez zmian</Text>
              </View>
              <Text style={styles.aiAssistChevron}>›</Text>
            </Pressable>

            <LinearGradient
              colors={["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nazwa przepisu</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="np. Makaron z pesto"
                  placeholderTextColor="#98A3A2"
                  style={styles.input}
                  maxLength={255}
                />
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Krótki opis</Text>
                  <Text style={styles.optionalLabel}>OPCJONALNIE</Text>
                </View>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Co wyróżnia ten przepis?"
                  placeholderTextColor="#98A3A2"
                  style={[styles.input, styles.multilineInput]}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.servingsRow}>
                <View style={styles.servingsCopy}>
                  <Text style={styles.label}>Liczba porcji</Text>
                  <Text style={styles.helperText}>Dla ilu osób jest przepis?</Text>
                </View>
                <TextInput
                  value={servings}
                  onChangeText={setServings}
                  keyboardType="number-pad"
                  style={styles.servingsInput}
                  maxLength={3}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Instrukcja przygotowania</Text>
                <TextInput
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder="Opisz kolejne kroki przygotowania..."
                  placeholderTextColor="#98A3A2"
                  style={[styles.input, styles.instructionsInput]}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </LinearGradient>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>SKŁADNIKI</Text>
                <Text style={styles.sectionTitle}>Lista składników</Text>
              </View>
              <Text style={styles.sectionCount}>{ingredients.length}</Text>
            </View>

            <View style={styles.ingredientsList}>
              {ingredients.map((ingredient, index) => (
                <LinearGradient
                  key={ingredient.key}
                  colors={["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
                  style={styles.ingredientCard}
                >
                  <View style={styles.ingredientHeader}>
                    <View style={styles.ingredientNumber}>
                      <Text style={styles.ingredientNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.ingredientTitle}>Składnik</Text>
                    {ingredients.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Usuń składnik ${index + 1}`}
                        onPress={() => removeIngredient(ingredient.key)}
                        style={styles.removeButton}
                      >
                        <Text style={styles.removeButtonText}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <TextInput
                    value={ingredient.name}
                    onChangeText={(value) => updateIngredient(ingredient.key, "name", value)}
                    placeholder="Nazwa składnika"
                    placeholderTextColor="#98A3A2"
                    style={styles.input}
                    maxLength={255}
                  />

                  <View style={styles.amountRow}>
                    <TextInput
                      value={ingredient.amount}
                      onChangeText={(value) => updateIngredient(ingredient.key, "amount", value)}
                      placeholder="Ilość"
                      placeholderTextColor="#98A3A2"
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.amountInput]}
                    />
                    <TextInput
                      value={ingredient.unit}
                      onChangeText={(value) => updateIngredient(ingredient.key, "unit", value)}
                      placeholder="Jednostka"
                      placeholderTextColor="#98A3A2"
                      style={[styles.input, styles.unitInput]}
                      maxLength={64}
                    />
                  </View>

                  <TextInput
                    value={ingredient.note}
                    onChangeText={(value) => updateIngredient(ingredient.key, "note", value)}
                    placeholder="Notatka, np. do smaku (opcjonalnie)"
                    placeholderTextColor="#98A3A2"
                    style={styles.input}
                  />

                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: ingredient.optional }}
                    onPress={() => updateIngredient(ingredient.key, "optional", !ingredient.optional)}
                    style={styles.optionalToggle}
                  >
                    <View style={[styles.checkbox, ingredient.optional && styles.checkboxSelected]}>
                      {ingredient.optional ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.optionalToggleText}>Ten składnik jest opcjonalny</Text>
                  </Pressable>
                </LinearGradient>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dodaj kolejny składnik"
              onPress={addIngredient}
              style={({ pressed }) => [styles.addIngredientButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.addIngredientIcon}>＋</Text>
              <Text style={styles.addIngredientText}>Dodaj kolejny składnik</Text>
            </Pressable>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorIconText}>!</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isEditing ? "Zapisz zmiany w przepisie" : "Zapisz przepis"}
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitButton,
                submitting && styles.submitDisabled,
                pressed && !submitting && styles.submitPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>
                    {isEditing ? "Zapisz zmiany" : "Zapisz przepis"}
                  </Text>
                  <Text style={styles.submitArrow}>›</Text>
                </>
              )}
            </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={aiVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAi}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeAi} />
          <View style={styles.aiSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetHeaderCopy}>
                <Text style={styles.aiSheetEyebrow}>ASYSTENT AI</Text>
                <Text style={styles.aiSheetTitle}>Wskazówki do przepisu</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zamknij"
                onPress={closeAi}
                disabled={generating}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.aiSheetDescription}>
              Możesz dopisać swoje wymagania. Uzupełnione pola formularza zostaną automatycznie przekazane AI i nie będą nadpisane.
            </Text>

            {hasFormContext ? (
              <View style={styles.contextNotice}>
                <Text style={styles.contextNoticeIcon}>✓</Text>
                <Text style={styles.contextNoticeText}>Uwzględnię dane wpisane już w formularzu.</Text>
              </View>
            ) : null}

            <TextInput
              value={aiGuidelines}
              onChangeText={setAiGuidelines}
              placeholder="np. bez mięsa, szybkie, dużo białka..."
              placeholderTextColor="#98A3A2"
              style={styles.aiGuidelinesInput}
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
              accessibilityLabel="Generuj i uzupełnij formularz"
              onPress={handleGenerate}
              disabled={generating}
              style={({ pressed }) => [
                styles.generateButton,
                generating && styles.submitDisabled,
                pressed && !generating && styles.submitPressed,
              ]}
            >
              {generating ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>AI uzupełnia formularz...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.generateSparkle}>✦</Text>
                  <Text style={styles.generateButtonText}>Generuj</Text>
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
  keyboardView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 38 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -80, right: -80, backgroundColor: "rgba(215,225,217,0.62)" },
  glowMiddle: { width: 280, height: 280, top: 480, left: -150, backgroundColor: "rgba(249,224,174,0.28)" },
  glowBottom: { width: 300, height: 300, bottom: -110, right: -130, backgroundColor: "rgba(189,214,211,0.42)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 15, paddingBottom: 22 },
  backButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1, paddingTop: 1 },
  eyebrow: { color: "#7D9098", fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#151917", fontSize: 34, lineHeight: 39, fontWeight: "700", marginTop: 2, fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }) },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 4 },
  loadingState: { minHeight: 300, alignItems: "center", justifyContent: "center" },
  loadingStateText: { color: "#687A7F", fontSize: 14, marginTop: 12 },
  loadErrorState: { minHeight: 260, alignItems: "center", justifyContent: "center", borderRadius: 25, padding: 24, backgroundColor: "rgba(255,247,244,0.86)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)" },
  loadErrorTitle: { color: "#7F3932", fontSize: 18, lineHeight: 23, fontWeight: "800", textAlign: "center" },
  loadErrorText: { color: "#92524A", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7 },
  retryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, paddingHorizontal: 20, marginTop: 18, backgroundColor: "#304B54" },
  retryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  aiAssistButton: { minHeight: 88, borderRadius: 23, padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(237,244,241,0.78)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.94)", shadowColor: "#173746", shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  aiAssistIcon: { width: 47, height: 47, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,251,0.80)" },
  aiAssistSparkle: { color: "#365964", fontSize: 27, lineHeight: 29 },
  aiAssistCopy: { flex: 1 },
  aiAssistEyebrow: { color: "#7D9098", fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 1.1 },
  aiAssistTitle: { color: "#24444D", fontSize: 16, lineHeight: 21, fontWeight: "800", marginTop: 2 },
  aiAssistSubtitle: { color: "#74868A", fontSize: 11, lineHeight: 16, marginTop: 2 },
  aiAssistChevron: { color: "#8CA0A5", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  card: { borderRadius: 28, padding: 22, gap: 20, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.11, shadowRadius: 20, shadowOffset: { width: 0, height: 11 }, elevation: 4 },
  fieldGroup: { gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: "#33484D", fontSize: 14, lineHeight: 20, fontWeight: "800" },
  optionalLabel: { color: "#91A0A2", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  helperText: { color: "#819095", fontSize: 12, lineHeight: 17, marginTop: 2 },
  input: { minHeight: 54, backgroundColor: "rgba(255,255,255,0.68)", borderRadius: 17, borderWidth: 1, borderColor: "rgba(73,102,108,0.14)", paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#182326" },
  multilineInput: { minHeight: 90 },
  instructionsInput: { minHeight: 140 },
  servingsRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  servingsCopy: { flex: 1 },
  servingsInput: { width: 76, minHeight: 54, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.68)", borderWidth: 1, borderColor: "rgba(73,102,108,0.14)", textAlign: "center", color: "#182326", fontSize: 19, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 13, paddingHorizontal: 3 },
  sectionEyebrow: { color: "#7D9098", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  sectionTitle: { color: "#182326", fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: 2 },
  sectionCount: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,251,0.76)", color: "#35545E", textAlign: "center", lineHeight: 34, fontWeight: "900", overflow: "hidden" },
  ingredientsList: { gap: 13 },
  ingredientCard: { borderRadius: 24, padding: 17, gap: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  ingredientHeader: { flexDirection: "row", alignItems: "center" },
  ingredientNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#DCEAE7" },
  ingredientNumberText: { color: "#31535C", fontSize: 12, fontWeight: "900" },
  ingredientTitle: { flex: 1, color: "#33484D", fontSize: 14, fontWeight: "800", marginLeft: 9 },
  removeButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(164,73,62,0.08)" },
  removeButtonText: { color: "#9A5147", fontSize: 21, lineHeight: 22 },
  amountRow: { flexDirection: "row", gap: 10 },
  amountInput: { flex: 1 },
  unitInput: { flex: 1 },
  optionalToggle: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start" },
  checkbox: { width: 23, height: 23, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#9AABAE", backgroundColor: "rgba(255,255,255,0.68)" },
  checkboxSelected: { backgroundColor: "#4F7472", borderColor: "#4F7472" },
  checkboxMark: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  optionalToggleText: { color: "#617378", fontSize: 13, fontWeight: "600" },
  addIngredientButton: { minHeight: 54, borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(48,75,84,0.18)", backgroundColor: "rgba(255,255,251,0.62)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 13 },
  addIngredientIcon: { color: "#31535C", fontSize: 24, lineHeight: 26 },
  addIngredientText: { color: "#31535C", fontSize: 15, fontWeight: "800" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,247,244,0.92)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 16, padding: 13, marginTop: 16 },
  errorIconText: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#A4493E", color: "#FFFFFF", textAlign: "center", lineHeight: 24, fontWeight: "900", overflow: "hidden" },
  errorText: { flex: 1, color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  submitButton: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#304B54", borderRadius: 18, paddingHorizontal: 22, paddingVertical: 16, marginTop: 16, shadowColor: "#19343D", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  submitButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 17 },
  submitArrow: { position: "absolute", right: 22, color: "#FFFFFF", fontSize: 31, lineHeight: 32, fontWeight: "300" },
  submitDisabled: { opacity: 0.65 },
  submitPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(23,37,42,0.38)" },
  aiSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 34 : 24, backgroundColor: "#F7F7F1", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", shadowColor: "#102B35", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#C8D0CE", marginBottom: 14 },
  aiSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  aiSheetHeaderCopy: { flex: 1 },
  aiSheetEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.2 },
  aiSheetTitle: { color: "#182326", fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 },
  modalClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(225,234,231,0.80)" },
  modalCloseText: { color: "#425F66", fontSize: 25, lineHeight: 27, fontWeight: "300" },
  aiSheetDescription: { color: "#65777C", fontSize: 13, lineHeight: 19, marginTop: 11 },
  contextNotice: { flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, marginTop: 13, backgroundColor: "rgba(217,233,226,0.70)" },
  contextNoticeIcon: { width: 22, height: 22, borderRadius: 11, color: "#FFFFFF", backgroundColor: "#52756D", textAlign: "center", lineHeight: 22, fontSize: 12, fontWeight: "900", overflow: "hidden" },
  contextNoticeText: { flex: 1, color: "#526E68", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  aiGuidelinesInput: { minHeight: 118, maxHeight: 180, borderRadius: 17, borderWidth: 1, borderColor: "rgba(73,102,108,0.14)", backgroundColor: "rgba(255,255,255,0.76)", paddingHorizontal: 15, paddingVertical: 13, marginTop: 13, color: "#182326", fontSize: 15, lineHeight: 21 },
  aiCounter: { alignSelf: "flex-end", color: "#98A3A2", fontSize: 10, marginTop: 5 },
  aiErrorBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,247,244,0.92)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 15, padding: 12, marginTop: 10 },
  generateButton: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15, marginTop: 13, backgroundColor: "#4F6B72", shadowColor: "#19343D", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  generateSparkle: { color: "#F3DCAC", fontSize: 21 },
  generateButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
