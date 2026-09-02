import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";
import { showContextMenu } from "../../utils/contextMenu";
import { formatMealDate, parseIsoDate, todayIso } from "../../utils/mealDates";

const DELETE_ACTION_WIDTH = 92;
const FULL_SWIPE_RATIO = 0.64;

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const formatMealCount = (count) => {
  if (count === 1) return "1 zaplanowany posiłek";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} zaplanowane posiłki`;
  }
  return `${count} zaplanowanych posiłków`;
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

function MealGlyph() {
  return (
    <View style={glyphStyles.wrap}>
      <View style={glyphStyles.steamRow}>
        <View style={[glyphStyles.steam, glyphStyles.steamLeft]} />
        <View style={[glyphStyles.steam, glyphStyles.steamRight]} />
      </View>
      <View style={glyphStyles.rim} />
      <View style={glyphStyles.bowl} />
      <View style={glyphStyles.foot} />
    </View>
  );
}

function SwipeableMealCard({
  item,
  onLongPress,
  onDelete,
  onDeleteError,
  onSwipeStart,
  onSwipeEnd,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const settledX = useRef(0);
  const rowWidth = useRef(320);
  const deleting = useRef(false);
  const [deletingVisible, setDeletingVisible] = useState(false);

  const animateTo = useCallback((value, completion) => {
    settledX.current = value;
    Animated.spring(translateX, {
      toValue: value,
      useNativeDriver: true,
      speed: 23,
      bounciness: 1,
    }).start(({ finished }) => {
      if (finished) completion?.();
    });
  }, [translateX]);

  const deleteFromSwipe = useCallback(() => {
    if (deleting.current) return;
    deleting.current = true;
    setDeletingVisible(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    animateTo(-rowWidth.current, async () => {
      try {
        await onDelete(item);
      } catch (error) {
        deleting.current = false;
        setDeletingVisible(false);
        animateTo(0);
        onDeleteError(error);
      }
    });
  }, [animateTo, item, onDelete, onDeleteError]);

  const panResponder = useMemo(() => {
    const shouldStartHorizontalSwipe = (_, gesture) => (
      Math.abs(gesture.dx) > 8
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15
      && (gesture.dx < 0 || settledX.current < 0)
    );

    return PanResponder.create({
      onMoveShouldSetPanResponder: shouldStartHorizontalSwipe,
      onMoveShouldSetPanResponderCapture: shouldStartHorizontalSwipe,
      onPanResponderGrant: () => {
        onSwipeStart();
        translateX.stopAnimation((value) => {
          settledX.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const nextPosition = Math.max(
          -rowWidth.current,
          Math.min(0, settledX.current + gesture.dx)
        );
        translateX.setValue(nextPosition);
      },
      onPanResponderRelease: (_, gesture) => {
        onSwipeEnd();
        const position = settledX.current + gesture.dx;
        if (position <= -rowWidth.current * FULL_SWIPE_RATIO) {
          deleteFromSwipe();
        } else if (position <= -DELETE_ACTION_WIDTH * 0.42) {
          animateTo(-DELETE_ACTION_WIDTH);
        } else {
          animateTo(0);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        onSwipeEnd();
        animateTo(0);
      },
      onShouldBlockNativeResponder: () => true,
    });
  }, [animateTo, deleteFromSwipe, onSwipeEnd, onSwipeStart, translateX]);

  const handleLongPress = () => {
    animateTo(0);
    onLongPress(item);
  };

  return (
    <View style={styles.swipeShell}>
      <View
        style={styles.swipeContainer}
        onLayout={(event) => {
          rowWidth.current = event.nativeEvent.layout.width;
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Usuń posiłek ${item?.recipe?.name || "bez nazwy"}`}
          disabled={deletingVisible}
          onPress={deleteFromSwipe}
          style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}
        >
          {deletingVisible ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.deleteActionIcon}>×</Text>
              <Text style={styles.deleteActionText}>Usuń</Text>
            </>
          )}
        </Pressable>

        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.swipeForeground, { transform: [{ translateX }] }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Opcje posiłku ${item?.recipe?.name || "bez nazwy"}`}
            accessibilityHint="Przytrzymaj, aby otworzyć menu, albo przesuń w lewo, aby usunąć"
            delayLongPress={450}
            onLongPress={handleLongPress}
          >
            <LinearGradient
              colors={["rgba(255,255,251,0.93)", "rgba(246,247,240,0.82)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={styles.iconBadge}>
                <MealGlyph />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardEyebrow}>
                  {formatServings(Number(item?.servings) || 0)}
                </Text>
                <Text style={styles.mealName} numberOfLines={2}>
                  {item?.recipe?.name || "Posiłek bez nazwy"}
                </Text>
                <Text style={styles.mealDescription} numberOfLines={2}>
                  {item?.recipe?.description
                    || item?.recipe?.instructions
                    || "Szczegóły zapisane w planie posiłku"}
                </Text>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

export default function MealsScreen() {
  const router = useRouter();
  const { token, activeFridge } = useAuth();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [horizontalSwipeActive, setHorizontalSwipeActive] = useState(false);

  const startHorizontalSwipe = useCallback(() => setHorizontalSwipeActive(true), []);
  const endHorizontalSwipe = useCallback(() => setHorizontalSwipeActive(false), []);

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
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/planned-meals`,
        { method: "GET", headers }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      setMeals(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || "Nie udało się pobrać planu posiłków");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFridge, headers]);

  const deleteMeal = useCallback(async (meal) => {
    if (!activeFridge || !meal?.id) {
      throw new Error("Brakuje danych zaplanowanego posiłku.");
    }

    const response = await fetch(
      `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/planned-meals/${encodeURIComponent(meal.id)}`,
      { method: "DELETE", headers }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }

    setMeals((current) => current.filter((item) => String(item?.id) !== String(meal.id)));
  }, [activeFridge, headers]);

  const showDeleteError = useCallback((error) => {
    Alert.alert(
      "Nie udało się usunąć posiłku",
      error?.message || "Spróbuj ponownie za chwilę."
    );
  }, []);

  const confirmDeleteMeal = useCallback((meal) => {
    Alert.alert(
      "Usunąć zaplanowany posiłek?",
      `„${meal?.recipe?.name || "Posiłek bez nazwy"}” zniknie z planu.`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMeal(meal);
            } catch (error) {
              showDeleteError(error);
            }
          },
        },
      ]
    );
  }, [deleteMeal, showDeleteError]);

  const openMealMenu = useCallback((meal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    showContextMenu({
      title: meal?.recipe?.name || "Posiłek bez nazwy",
      message: formatMealDate(meal?.plannedDate),
      actions: [
        {
          id: "delete",
          label: "Usuń",
          role: "destructive",
          onPress: () => confirmDeleteMeal(meal),
        },
      ],
    });
  }, [confirmDeleteMeal]);

  useFocusEffect(
    useCallback(() => {
      loadMeals();
    }, [loadMeals])
  );

  const sections = useMemo(() => {
    const today = todayIso();
    const grouped = new Map();

    meals
      .filter((meal) => parseIsoDate(meal?.plannedDate) && meal.plannedDate >= today)
      .sort((left, right) => {
        const dateComparison = left.plannedDate.localeCompare(right.plannedDate);
        if (dateComparison) return dateComparison;
        return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""));
      })
      .forEach((meal) => {
        const date = meal.plannedDate;
        if (!grouped.has(date)) grouped.set(date, []);
        grouped.get(date).push(meal);
      });

    return [...grouped.entries()].map(([date, data]) => ({ date, data }));
  }, [meals]);

  const upcomingCount = useMemo(
    () => sections.reduce((sum, section) => sum + section.data.length, 0),
    [sections]
  );

  const headerSubtitle = !activeFridge
    ? "Wybierz aktywną lodówkę"
    : loading
      ? "Sprawdzam najbliższe dni..."
      : formatMealCount(upcomingCount);

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
              <Text style={styles.eyebrow}>PLANOWANIE</Text>
              <Text style={styles.title}>Moje posiłki</Text>
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zaplanuj kolejne posiłki"
              accessibilityState={{ disabled: !activeFridge }}
              disabled={!activeFridge}
              onPress={() => router.push("/plan-meals")}
              style={({ pressed }) => [
                styles.roundButton,
                !activeFridge && styles.buttonDisabled,
                pressed && activeFridge && styles.buttonPressed,
              ]}
            >
              <Text style={styles.addLabel}>＋</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Text style={styles.errorIconText}>!</Text>
              </View>
              <View style={styles.errorCopy}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => loadMeals()}>
                  <Text style={styles.retryText}>Spróbuj ponownie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#304B54" />
              <Text style={styles.loaderText}>Otwieram plan posiłków...</Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item, index) => String(item?.id ?? index)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!horizontalSwipeActive}
              refreshing={refreshing}
              onRefresh={() => loadMeals(true)}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <View style={styles.dateHeader}>
                  <View style={styles.dateDot} />
                  <Text style={styles.dateLabel}>{formatMealDate(section.date)}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <SwipeableMealCard
                  item={item}
                  onLongPress={openMealMenu}
                  onDelete={deleteMeal}
                  onDeleteError={showDeleteError}
                  onSwipeStart={startHorizontalSwipe}
                  onSwipeEnd={endHorizontalSwipe}
                />
              )}
              ListEmptyComponent={() => (
                <LinearGradient
                  colors={["rgba(255,255,251,0.93)", "rgba(246,247,240,0.82)"]}
                  style={styles.emptyBox}
                >
                  <View style={styles.emptyIconBadge}>
                    <MealGlyph />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {activeFridge ? "Brak zaplanowanych posiłków" : "Wybierz aktywną lodówkę"}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {activeFridge
                      ? "Ułóż plan ręcznie albo pozwól AI wybrać przepisy na kolejne dni."
                      : "Plan posiłków jest przypisany do konkretnej lodówki."}
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
              )}
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
  roundButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,250,0.76)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#173746", shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  buttonDisabled: { opacity: 0.42 },
  backLabel: { color: "#173746", fontSize: 40, lineHeight: 41, fontWeight: "300", marginTop: -2 },
  addLabel: { color: "#173746", fontSize: 30, lineHeight: 32, fontWeight: "300", marginTop: -1 },
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
  listContent: { paddingBottom: 34, flexGrow: 1 },
  dateHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 9, marginBottom: 9, paddingHorizontal: 3 },
  dateDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#76918E" },
  dateLabel: { color: "#425A60", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  swipeShell: { borderRadius: 25, marginBottom: 4, shadowColor: "#173746", shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  swipeContainer: { borderRadius: 25, overflow: "hidden", backgroundColor: "#B4473E" },
  swipeForeground: { backgroundColor: "#F7F7F1" },
  deleteAction: { position: "absolute", top: 0, right: 0, bottom: 0, width: DELETE_ACTION_WIDTH, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: "#B4473E" },
  deleteActionPressed: { backgroundColor: "#9F382F" },
  deleteActionIcon: { color: "#FFFFFF", fontSize: 25, lineHeight: 26, fontWeight: "400" },
  deleteActionText: { color: "#FFFFFF", fontSize: 14, lineHeight: 18, fontWeight: "800" },
  card: { minHeight: 118, borderRadius: 25, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", padding: 17, flexDirection: "row", alignItems: "center", gap: 14 },
  iconBadge: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.84)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  cardCopy: { flex: 1 },
  cardEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  mealName: { color: "#151917", fontSize: 21, lineHeight: 26, fontWeight: "800", marginTop: 3 },
  mealDescription: { color: "#60727A", fontSize: 13, lineHeight: 19, marginTop: 4 },
  emptyBox: { flex: 1, minHeight: 350, borderRadius: 28, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", padding: 28, marginTop: 8, shadowColor: "#173746", shadowOpacity: 0.10, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  emptyIconBadge: { width: 84, height: 84, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(229,243,244,0.82)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.96)" },
  emptyTitle: { color: "#182326", fontSize: 21, fontWeight: "800", marginTop: 18, textAlign: "center" },
  emptySubtitle: { color: "#697A7D", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 7, maxWidth: 290 },
  emptyAction: { minHeight: 50, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#304B54", paddingHorizontal: 22, marginTop: 19 },
  emptyActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});

const glyphStyles = StyleSheet.create({
  wrap: { width: 42, height: 38, alignItems: "center", justifyContent: "flex-end" },
  steamRow: { position: "absolute", top: 0, flexDirection: "row", gap: 8 },
  steam: { width: 3, height: 9, borderRadius: 2, backgroundColor: "#173746" },
  steamLeft: { transform: [{ rotate: "24deg" }] },
  steamRight: { transform: [{ rotate: "24deg" }] },
  rim: { width: 40, height: 3, borderRadius: 2, backgroundColor: "#173746" },
  bowl: { width: 34, height: 16, borderBottomLeftRadius: 17, borderBottomRightRadius: 17, borderWidth: 2.2, borderTopWidth: 0, borderColor: "#173746" },
  foot: { width: 16, height: 2.5, borderRadius: 2, backgroundColor: "#173746", marginTop: 2 },
});
