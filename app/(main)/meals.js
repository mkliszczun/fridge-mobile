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

const numericAmount = (value) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeUnit = (value) => {
  const unit = String(value || "").trim().toLowerCase().replaceAll(".", "");
  if (["g", "gram", "grams", "gramy", "gramów", "gramow"].includes(unit)) {
    return { unit: "GRAM", multiplier: 1 };
  }
  if (["kg", "kilogram", "kilogramy", "kilogramów", "kilogramow"].includes(unit)) {
    return { unit: "GRAM", multiplier: 1000 };
  }
  if ([
    "ml",
    "mililitr",
    "mililitry",
    "mililitrów",
    "mililitrow",
    "milliliter",
    "milliliters",
    "millilitre",
    "millilitres",
  ].includes(unit)) {
    return { unit: "MILLILITER", multiplier: 1 };
  }
  if (["l", "litr", "litry", "litrów", "litrow"].includes(unit)) {
    return { unit: "MILLILITER", multiplier: 1000 };
  }
  if (["szt", "sztuka", "sztuki", "sztuk", "piece"].includes(unit)) {
    return { unit: "PIECE", multiplier: 1 };
  }
  return null;
};

const normalizedRequiredQuantity = (meal, ingredient) => {
  if (ingredient?.amount == null || !ingredient?.unit) return null;

  const amount = numericAmount(ingredient.amount);
  const servings = numericAmount(meal?.servings);
  const recipeServings = numericAmount(meal?.recipe?.servings);
  const normalized = normalizeUnit(ingredient.unit);
  if (!normalized || amount <= 0 || servings <= 0 || recipeServings <= 0) return null;

  const scaledAmount = amount * servings / recipeServings * normalized.multiplier;
  return {
    amount: normalized.unit === "PIECE" ? Math.ceil(scaledAmount) : scaledAmount,
    unit: normalized.unit,
  };
};

const previewCompletionWarnings = (meal, fridgeItems) => {
  const itemsById = new Map(
    (Array.isArray(fridgeItems) ? fridgeItems : [])
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item])
  );
  const remainingAmounts = new Map(
    [...itemsById.entries()].map(([id, item]) => [id, Math.max(0, numericAmount(item.amount))])
  );
  const warnings = [];

  (Array.isArray(meal?.recipe?.ingredients) ? meal.recipe.ingredients : []).forEach((ingredient) => {
    const reservations = [...(Array.isArray(ingredient?.reservations)
      ? ingredient.reservations
      : [])].sort((left, right) => String(left?.id || "").localeCompare(String(right?.id || "")));
    const consumedByUnit = new Map();
    let consumedTotal = 0;

    reservations.forEach((reservation) => {
      const itemId = String(reservation?.fridgeItemId || "");
      const item = itemsById.get(itemId);
      const remaining = remainingAmounts.get(itemId) || 0;
      const reserved = Math.max(0, numericAmount(reservation?.amount));
      const consumed = Math.min(remaining, reserved);
      if (!item || consumed <= 0) return;

      remainingAmounts.set(itemId, remaining - consumed);
      consumedTotal += consumed;
      const normalizedItemUnit = normalizeUnit(item.unit);
      if (normalizedItemUnit) {
        consumedByUnit.set(
          normalizedItemUnit.unit,
          (consumedByUnit.get(normalizedItemUnit.unit) || 0) + consumed
        );
      }
    });

    if (ingredient?.optional) return;

    const required = normalizedRequiredQuantity(meal, ingredient);
    if (required) {
      const consumed = consumedByUnit.get(required.unit) || 0;
      const missing = Math.max(0, required.amount - consumed);
      if (missing > 0.000001) {
        warnings.push({
          code: "MISSING_AMOUNT",
          ingredientName: ingredient?.name || "Składnik",
          missingAmount: missing,
          unit: required.unit,
        });
      }
      return;
    }

    const reservedTotal = reservations.reduce(
      (sum, reservation) => sum + Math.max(0, numericAmount(reservation?.amount)),
      0
    );
    if (reservedTotal <= 0.000001) {
      warnings.push({
        code: "UNRESERVED_INGREDIENT",
        ingredientName: ingredient?.name || "Składnik",
        missingAmount: null,
        unit: ingredient?.unit || null,
      });
    } else if (consumedTotal + 0.000001 < reservedTotal) {
      warnings.push({
        code: "RESERVED_ITEM_UNAVAILABLE",
        ingredientName: ingredient?.name || "Składnik",
        missingAmount: reservedTotal - consumedTotal,
        unit: ingredient?.unit || null,
      });
    }
  });

  return warnings;
};

const formatWarningAmount = (amount, unit) => {
  if (amount == null) return null;
  const rounded = Math.round(numericAmount(amount) * 100) / 100;
  const amountLabel = rounded.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
  const unitLabel = {
    GRAM: "g",
    MILLILITER: "ml",
    PIECE: "szt.",
  }[String(unit || "").toUpperCase()] || unit || "";
  return `${amountLabel}${unitLabel ? ` ${unitLabel}` : ""}`;
};

const formatWarnings = (warnings) => {
  const visibleWarnings = warnings.slice(0, 6).map((warning) => {
    const amount = formatWarningAmount(warning?.missingAmount, warning?.unit);
    if (warning?.code === "UNRESERVED_INGREDIENT") {
      return `• ${warning?.ingredientName || "Składnik"}: brak zarezerwowanego produktu`;
    }
    if (warning?.code === "RESERVED_ITEM_UNAVAILABLE" && !amount) {
      return `• ${warning?.ingredientName || "Składnik"}: produkt jest niedostępny`;
    }
    return `• ${warning?.ingredientName || "Składnik"}${amount ? `: brakuje ${amount}` : ": brak produktu"}`;
  });
  if (warnings.length > visibleWarnings.length) {
    visibleWarnings.push(`• oraz ${warnings.length - visibleWarnings.length} więcej`);
  }
  return visibleWarnings.join("\n");
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
  busy,
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
    if (busy || deleting.current) return;
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
  }, [animateTo, busy, item, onDelete, onDeleteError]);

  const panResponder = useMemo(() => {
    const shouldStartHorizontalSwipe = (_, gesture) => (
      !busy
      && Math.abs(gesture.dx) > 8
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
  }, [animateTo, busy, deleteFromSwipe, onSwipeEnd, onSwipeStart, translateX]);

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
          accessibilityState={{ disabled: deletingVisible || busy }}
          disabled={deletingVisible || busy}
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
          style={[
            styles.swipeForeground,
            busy && styles.cardBusy,
            { transform: [{ translateX }] },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Opcje posiłku ${item?.recipe?.name || "bez nazwy"}`}
            accessibilityHint={busy
              ? "Trwa aktualizowanie posiłku"
              : "Przytrzymaj, aby otworzyć menu, albo przesuń w lewo, aby usunąć"}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
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
                {busy ? <ActivityIndicator size="small" color="#304B54" /> : <MealGlyph />}
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
  const { apiFetch, sessionId, activeFridge } = useAuth();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [horizontalSwipeActive, setHorizontalSwipeActive] = useState(false);
  const [mealActionId, setMealActionId] = useState(null);

  const startHorizontalSwipe = useCallback(() => setHorizontalSwipeActive(true), []);
  const endHorizontalSwipe = useCallback(() => setHorizontalSwipeActive(false), []);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",

    }),
    [sessionId]
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
      const response = await apiFetch(
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

    const response = await apiFetch(
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

  const completeMeal = useCallback(async (meal) => {
    if (!activeFridge || !meal?.id) {
      Alert.alert("Nie udało się zrobić posiłku", "Brakuje danych zaplanowanego posiłku.");
      return;
    }

    const mealId = String(meal.id);
    setMealActionId(mealId);
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}/planned-meals/${encodeURIComponent(mealId)}/complete`,
        { method: "POST", headers }
      );
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      setMeals((current) => current.filter((item) => String(item?.id) !== mealId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
      Alert.alert(
        "Posiłek zrobiony",
        warnings.length
          ? `Zużyto dostępne produkty. Nadal brakowało:\n\n${formatWarnings(warnings)}`
          : "Zużyte produkty zostały odjęte od zapasów."
      );
    } catch (actionError) {
      Alert.alert(
        "Nie udało się zrobić posiłku",
        actionError?.message || "Spróbuj ponownie za chwilę."
      );
    } finally {
      setMealActionId(null);
    }
  }, [activeFridge, headers]);

  const requestMealCompletion = useCallback(async (meal) => {
    if (!activeFridge || !meal?.id || mealActionId) return;

    const mealId = String(meal.id);
    setMealActionId(mealId);
    try {
      const fridgePath = `${API_BASE_URL}/api/fridges/${encodeURIComponent(activeFridge)}`;
      const [mealResponse, itemsResponse] = await Promise.all([
        apiFetch(`${fridgePath}/planned-meals/${encodeURIComponent(mealId)}`, {
          method: "GET",
          headers,
        }),
        apiFetch(`${API_BASE_URL}/api/fridge-items/${encodeURIComponent(activeFridge)}`, {
          method: "GET",
          headers,
        }),
      ]);
      const [freshMeal, fridgeItems] = await Promise.all([
        readPayload(mealResponse),
        readPayload(itemsResponse),
      ]);
      if (!mealResponse.ok) {
        throw new Error(freshMeal?.message || `HTTP ${mealResponse.status}`);
      }
      if (!itemsResponse.ok || !Array.isArray(fridgeItems)) {
        throw new Error(fridgeItems?.message || `HTTP ${itemsResponse.status}`);
      }

      const warnings = previewCompletionWarnings(freshMeal, fridgeItems);
      setMealActionId(null);
      if (warnings.length) {
        Alert.alert(
          "Brakuje składników",
          `${formatWarnings(warnings)}\n\nMożesz mimo to zrobić posiłek. Zużyjemy tylko dostępne produkty.`,
          [
            { text: "Anuluj", style: "cancel" },
            {
              text: "Zrób mimo braków",
              style: "destructive",
              onPress: () => completeMeal(freshMeal),
            },
          ]
        );
        return;
      }

      await completeMeal(freshMeal);
    } catch (previewError) {
      setMealActionId(null);
      Alert.alert(
        "Nie udało się sprawdzić zapasów",
        `${previewError?.message || "Spróbuj ponownie za chwilę."}\n\nCzy mimo to zrobić posiłek?`,
        [
          { text: "Anuluj", style: "cancel" },
          {
            text: "Zrób mimo to",
            style: "destructive",
            onPress: () => completeMeal(meal),
          },
        ]
      );
    }
  }, [activeFridge, completeMeal, headers, mealActionId]);

  const openMealMenu = useCallback((meal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const actionInProgress = Boolean(mealActionId);
    showContextMenu({
      title: meal?.recipe?.name || "Posiłek bez nazwy",
      message: formatMealDate(meal?.plannedDate),
      actions: [
        {
          id: "complete",
          label: actionInProgress ? "Sprawdzam zapasy..." : "Zrób posiłek",
          disabled: actionInProgress,
          onPress: () => requestMealCompletion(meal),
        },
        {
          id: "delete",
          label: "Usuń",
          role: "destructive",
          disabled: actionInProgress,
          onPress: () => confirmDeleteMeal(meal),
        },
      ],
    });
  }, [confirmDeleteMeal, mealActionId, requestMealCompletion]);

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
                  busy={String(mealActionId || "") === String(item?.id || "")}
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
  cardBusy: { opacity: 0.62 },
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
