import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../../constants/api";
import { useAuth } from "../../../context/AuthContext";

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const readParam = (value) => Array.isArray(value) ? value[0] : value;

const formatCount = (count, singular, paucal, plural) => {
  if (count === 1) return `1 ${singular}`;
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} ${paucal}`;
  }
  return `${count} ${plural}`;
};

const formatAmount = (ingredient) => {
  const amount = ingredient?.amount;
  const unit = ingredient?.unit;
  if (amount === null || amount === undefined || !unit) {
    return ingredient?.optional ? "opcjonalnie" : "według uznania";
  }
  const numericAmount = Number(amount);
  const displayAmount = Number.isFinite(numericAmount)
    ? new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 }).format(numericAmount)
    : String(amount);
  return `${displayAmount} ${unit}`;
};

export default function RecipeDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuth();
  const recipeId = readParam(params?.recipeId);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadRecipe = useCallback(async () => {
    if (!recipeId) {
      setError("Brak identyfikatora przepisu.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/recipes/${encodeURIComponent(recipeId)}`, {
        method: "GET",
        headers,
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
      }
      setRecipe(payload);
    } catch (err) {
      setError(err.message || "Nie udało się pobrać przepisu");
    } finally {
      setLoading(false);
    }
  }, [headers, recipeId]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const instructionParagraphs = String(recipe?.instructions || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

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
            <Text style={styles.eyebrow}>PRZEPIS</Text>
            <Text style={styles.headerTitle}>Szczegóły</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color="#304B54" />
            <Text style={styles.loaderText}>Otwieram przepis...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorState}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>!</Text>
            </View>
            <Text style={styles.errorTitle}>Nie udało się otworzyć przepisu</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadRecipe} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["rgba(255,255,251,0.95)", "rgba(246,247,240,0.84)"]}
              style={styles.heroCard}
            >
              <Text style={styles.recipeTitle}>{recipe?.name || "Przepis bez nazwy"}</Text>
              {recipe?.description ? (
                <Text style={styles.description}>{recipe.description}</Text>
              ) : null}
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>
                    {formatCount(Number(recipe?.servings) || 0, "porcja", "porcje", "porcji")}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>
                    {formatCount(ingredients.length, "składnik", "składniki", "składników")}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionEyebrow}>SKŁADNIKI</Text>
              <Text style={styles.sectionTitle}>Czego potrzebujesz</Text>
            </View>
            <LinearGradient
              colors={["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
              style={styles.contentCard}
            >
              {ingredients.map((ingredient, index) => (
                <View key={ingredient?.id || `${ingredient?.name || "ingredient"}-${index}`}>
                  <View style={styles.ingredientRow}>
                    <View style={styles.ingredientNumber}>
                      <Text style={styles.ingredientNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.ingredientCopy}>
                      <View style={styles.ingredientNameRow}>
                        <Text style={styles.ingredientName}>{ingredient?.name || "Składnik"}</Text>
                        {ingredient?.optional ? (
                          <View style={styles.optionalBadge}>
                            <Text style={styles.optionalBadgeText}>opcjonalny</Text>
                          </View>
                        ) : null}
                      </View>
                      {ingredient?.note ? (
                        <Text style={styles.ingredientNote}>{ingredient.note}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.ingredientAmount}>{formatAmount(ingredient)}</Text>
                  </View>
                  {index < ingredients.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </LinearGradient>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionEyebrow}>PRZYGOTOWANIE</Text>
              <Text style={styles.sectionTitle}>Jak przygotować</Text>
            </View>
            <LinearGradient
              colors={["rgba(255,255,251,0.94)", "rgba(246,247,240,0.82)"]}
              style={styles.instructionsCard}
            >
              {instructionParagraphs.map((paragraph, index) => (
                <Text key={`${paragraph.slice(0, 24)}-${index}`} style={styles.instructionsText}>
                  {paragraph}
                </Text>
              ))}
            </LinearGradient>
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -80, right: -80, backgroundColor: "rgba(215,225,217,0.62)" },
  glowMiddle: { width: 300, height: 300, top: 390, left: -165, backgroundColor: "rgba(249,224,174,0.28)" },
  glowBottom: { width: 300, height: 300, bottom: -110, right: -130, backgroundColor: "rgba(189,214,211,0.42)" },
  header: { flexDirection: "row", alignItems: "center", gap: 15, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },
  backButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.3 },
  headerTitle: { color: "#182326", fontSize: 24, lineHeight: 29, fontWeight: "800", marginTop: 1 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  loaderText: { color: "#687A7F", fontSize: 14, marginTop: 12 },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, paddingBottom: 70 },
  errorIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#A4493E" },
  errorIconText: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  errorTitle: { color: "#273B40", fontSize: 19, fontWeight: "800", marginTop: 14 },
  errorText: { color: "#7C6865", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },
  retryButton: { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, marginTop: 16, backgroundColor: "#304B54" },
  retryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 38 },
  heroCard: { borderRadius: 27, padding: 21, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.11, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  recipeTitle: { color: "#151917", fontSize: 29, lineHeight: 35, fontWeight: "800", fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }) },
  description: { color: "#60727A", fontSize: 14, lineHeight: 21, marginTop: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 },
  metaPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(226,239,236,0.78)" },
  metaPillText: { color: "#4B686C", fontSize: 11, fontWeight: "800" },
  sectionHeading: { marginTop: 24, marginBottom: 10, paddingHorizontal: 3 },
  sectionEyebrow: { color: "#7D9098", fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 1.2 },
  sectionTitle: { color: "#182326", fontSize: 20, lineHeight: 25, fontWeight: "800", marginTop: 1 },
  contentCard: { borderRadius: 24, paddingHorizontal: 17, paddingVertical: 5, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  ingredientRow: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  ingredientNumber: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#DCEAE7" },
  ingredientNumberText: { color: "#31535C", fontSize: 11, fontWeight: "900" },
  ingredientCopy: { flex: 1 },
  ingredientNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  ingredientName: { color: "#2D4146", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  optionalBadge: { borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: "rgba(236,226,204,0.72)" },
  optionalBadgeText: { color: "#826938", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  ingredientNote: { color: "#819095", fontSize: 11, lineHeight: 16, marginTop: 2 },
  ingredientAmount: { color: "#556B70", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "right", maxWidth: 105 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(73,102,108,0.15)", marginLeft: 37 },
  instructionsCard: { borderRadius: 24, padding: 18, gap: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  instructionsText: { color: "#40555A", fontSize: 15, lineHeight: 23 },
});
