import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
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
import { showContextMenu } from "../../utils/contextMenu";

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const formatCount = (count, singular, paucal, plural) => {
  if (count === 1) return `1 ${singular}`;
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} ${paucal}`;
  }
  return `${count} ${plural}`;
};

function RecipeGlyph({ small = false }) {
  return (
    <View style={[glyphStyles.book, small && glyphStyles.bookSmall]}>
      <View style={glyphStyles.bookSpine} />
      <View style={[glyphStyles.bookLine, glyphStyles.bookLineTop]} />
      <View style={[glyphStyles.bookLine, glyphStyles.bookLineBottom]} />
    </View>
  );
}

export default function RecipesScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadRecipes = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setError(null);
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
      setError(err.message || "Nie udało się pobrać przepisów");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headers]);

  const deleteRecipe = useCallback(async (recipe) => {
    const response = await fetch(
      `${API_BASE_URL}/api/recipes/${encodeURIComponent(recipe.id)}`,
      { method: "DELETE", headers }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    setRecipes((current) => current.filter((item) => item?.id !== recipe.id));
  }, [headers]);

  const confirmDeleteRecipe = (recipe) => {
    Alert.alert(
      "Usunąć przepis?",
      `„${recipe?.name || "Przepis bez nazwy"}” zostanie trwale usunięty.`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRecipe(recipe);
            } catch (err) {
              Alert.alert(
                "Nie udało się usunąć przepisu",
                err.message || "Spróbuj ponownie za chwilę."
              );
            }
          },
        },
      ]
    );
  };

  const openRecipeMenu = (recipe, anchor) => {
    showContextMenu({
      title: recipe?.name || "Przepis bez nazwy",
      anchor,
      actions: [
        {
          id: "edit",
          label: "Edytuj",
          onPress: () => router.push({
            pathname: "/add-recipe",
            params: { recipeId: String(recipe.id) },
          }),
        },
        {
          id: "delete",
          label: "Usuń",
          role: "destructive",
          onPress: () => confirmDeleteRecipe(recipe),
        },
      ],
    });
  };

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

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
              <Text style={styles.eyebrow}>PRZEPISY</Text>
              <Text style={styles.title}>Moje przepisy</Text>
              <Text style={styles.headerSubtitle}>
                {loading
                  ? "Sprawdzam zapisane przepisy..."
                  : formatCount(recipes.length, "przepis", "przepisy", "przepisów")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dodaj nowy przepis"
              onPress={() => router.push("/add-recipe")}
              style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.addButtonText}>＋</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => loadRecipes()}>
                  <Text style={styles.retryText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Otwieram Twoje przepisy...</Text>
            </View>
          ) : error && !recipes.length ? (
            <View style={styles.errorSpacer} />
          ) : (
            <FlatList
              data={recipes}
              keyExtractor={(item, index) => String(item?.id ?? index)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => loadRecipes(true)}
              ListHeaderComponent={recipes.length ? (
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
                    <RecipeGlyph />
                  </View>
                  <Text style={styles.emptyTitle}>Jeszcze nie masz przepisów</Text>
                  <Text style={styles.emptySubtitle}>
                    Dodaj własny przepis albo poproś AI o przygotowanie propozycji.
                  </Text>
                </LinearGradient>
              )}
              renderItem={({ item }) => {
                const ingredientCount = Array.isArray(item?.ingredients) ? item.ingredients.length : 0;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Otwórz przepis ${item?.name || "bez nazwy"}`}
                    disabled={!item?.id}
                    onPress={() => router.push({
                      pathname: "/recipe/[recipeId]",
                      params: { recipeId: String(item.id) },
                    })}
                    style={({ pressed }) => [styles.cardShell, pressed && styles.cardPressed]}
                  >
                    <LinearGradient
                      colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.card}
                    >
                      <View style={styles.recipeIconBadge}>
                        <RecipeGlyph small />
                      </View>
                      <View style={styles.cardCopy}>
                        <Text style={styles.cardEyebrow}>
                          {formatCount(Number(item?.servings) || 0, "porcja", "porcje", "porcji")} · {formatCount(ingredientCount, "składnik", "składniki", "składników")}
                        </Text>
                        <Text style={styles.recipeName} numberOfLines={2}>
                          {item?.name || "Przepis bez nazwy"}
                        </Text>
                        <Text style={styles.recipeDescription} numberOfLines={2}>
                          {item?.description || item?.instructions || "Brak dodatkowego opisu"}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Opcje przepisu ${item?.name || "bez nazwy"}`}
                        hitSlop={6}
                        onPress={(event) => {
                          event.stopPropagation?.();
                          openRecipeMenu(item, event.nativeEvent?.target);
                        }}
                        style={({ pressed }) => [
                          styles.menuButton,
                          pressed && styles.menuButtonPressed,
                        ]}
                      >
                        <Text style={styles.menuButtonText}>•••</Text>
                      </Pressable>
                    </LinearGradient>
                  </Pressable>
                );
              }}
            />
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
  backButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  headerCopy: { flex: 1, paddingTop: 1 },
  eyebrow: { color: "#7D9098", fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#151917", fontSize: 35, lineHeight: 40, fontWeight: "700", marginTop: 2, fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }) },
  headerSubtitle: { color: "#667579", fontSize: 15, lineHeight: 21, marginTop: 4 },
  addButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  addButtonText: { color: "#173746", fontSize: 30, lineHeight: 32, fontWeight: "300", marginTop: -1 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,247,244,0.90)", borderWidth: 1, borderColor: "rgba(164,73,62,0.12)", borderRadius: 18, padding: 14, marginBottom: 16 },
  errorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A4493E" },
  errorIconText: { color: "#FFFFFF", fontWeight: "800" },
  errorCopy: { flex: 1 },
  errorText: { color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  retryText: { color: "#294B57", fontWeight: "800", marginTop: 4 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  loaderText: { color: "#687A7F", fontSize: 14, marginTop: 12 },
  errorSpacer: { flex: 1 },
  listContent: { paddingBottom: 30, gap: 13, flexGrow: 1 },
  listHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 1 },
  listHintDot: { color: "#91A2A6", fontSize: 20, lineHeight: 18 },
  listHintText: { color: "#839296", fontSize: 11, lineHeight: 16 },
  cardShell: { borderRadius: 25 },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  card: { minHeight: 126, borderRadius: 25, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", padding: 17, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#173746", shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  recipeIconBadge: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.84)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  cardCopy: { flex: 1 },
  cardEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  recipeName: { color: "#151917", fontSize: 21, lineHeight: 26, fontWeight: "800", marginTop: 3 },
  recipeDescription: { color: "#60727A", fontSize: 13, lineHeight: 19, marginTop: 4 },
  menuButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,238,236,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.88)" },
  menuButtonPressed: { transform: [{ scale: 0.94 }], opacity: 0.82 },
  menuButtonText: { color: "#506A71", fontSize: 17, lineHeight: 19, fontWeight: "800", letterSpacing: 1, marginTop: -5 },
  emptyBox: { flex: 1, minHeight: 300, borderRadius: 28, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", padding: 28, shadowColor: "#173746", shadowOpacity: 0.10, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  emptyIconBadge: { width: 84, height: 84, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.82)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  emptyTitle: { color: "#182326", fontSize: 21, fontWeight: "800", marginTop: 18 },
  emptySubtitle: { color: "#697A7D", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7, maxWidth: 280 },
});

const glyphStyles = StyleSheet.create({
  book: { width: 42, height: 37, borderWidth: 2.3, borderColor: "#173746", borderRadius: 5, backgroundColor: "transparent" },
  bookSmall: { transform: [{ scale: 0.82 }] },
  bookSpine: { position: "absolute", top: 0, bottom: 0, left: 18, width: 2, backgroundColor: "#173746" },
  bookLine: { position: "absolute", height: 2, width: 10, borderRadius: 1, backgroundColor: "#173746" },
  bookLineTop: { left: 4, top: 11 },
  bookLineBottom: { right: 4, top: 21 },
});
