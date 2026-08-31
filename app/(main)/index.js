import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MenuCard from "../../components/MenuCard";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

const EXPIRING_SOON_DAYS = 3;

const pluralizeProducts = (count) => {
  if (count === 1) return "1 produkt";
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} produkty`;
  }
  return `${count} produktów`;
};

const formatCurrentDate = () => {
  const formatted = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const getLocalDate = (value) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const isExpiringSoon = (item) => {
  const target = getLocalDate(item?.effectiveExpireAt || item?.bestBeforeDate);
  if (!target) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const differenceInDays = Math.round((target - today) / 86400000);
  return differenceInDays >= 0 && differenceInDays <= EXPIRING_SOON_DAYS;
};

function ScannerIcon() {
  return (
    <View style={scannerIconStyles.wrap}>
      <View style={[scannerIconStyles.corner, scannerIconStyles.topLeft]} />
      <View style={[scannerIconStyles.corner, scannerIconStyles.topRight]} />
      <View style={[scannerIconStyles.corner, scannerIconStyles.bottomLeft]} />
      <View style={[scannerIconStyles.corner, scannerIconStyles.bottomRight]} />
      <View style={scannerIconStyles.barRow}>
        <View style={scannerIconStyles.bar} />
        <View style={[scannerIconStyles.bar, scannerIconStyles.barWide]} />
        <View style={scannerIconStyles.bar} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, activeFridge, logout } = useAuth();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);

  const loadSummary = useCallback(async () => {
    if (!activeFridge) {
      setProductCount(0);
      setExpiringCount(0);
      setSummaryError(false);
      return;
    }

    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const response = await fetch(`${API_BASE_URL}/api/fridge-items/${activeFridge}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload)) throw new Error("Nie udało się pobrać podsumowania");

      setProductCount(payload.length);
      setExpiringCount(payload.filter(isExpiringSoon).length);
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, [activeFridge, token]);

  useFocusEffect(
    useCallback(() => {
      loadSummary();
    }, [loadSummary])
  );

  const productSubtitle = useMemo(() => {
    if (!activeFridge) return "Wybierz aktywną lodówkę";
    if (summaryLoading) return "Sprawdzam zawartość...";
    if (summaryError) return "Zawartość aktywnej lodówki";
    return `${pluralizeProducts(productCount)} — lodówka`;
  }, [activeFridge, productCount, summaryError, summaryLoading]);

  const expiryMessage = useMemo(() => {
    if (!expiringCount || summaryLoading || summaryError) return null;
    if (expiringCount === 1) return "1 produkt wkrótce straci ważność";
    return `${pluralizeProducts(expiringCount)} wkrótce stracą ważność`;
  }, [expiringCount, summaryError, summaryLoading]);

  const navigateFromSettings = (path) => {
    setSettingsVisible(false);
    router.push(path);
  };

  const handleLogout = async () => {
    setSettingsVisible(false);
    await logout();
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
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.heading}>Kuchnia</Text>
              <Text style={styles.date}>{formatCurrentDate()}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ustawienia"
              onPress={() => setSettingsVisible(true)}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.settingsIcon}>⚙︎</Text>
            </Pressable>
          </View>

          <View style={styles.cards}>
            <MenuCard
              eyebrow="Spiżarnia"
              title="Moje produkty"
              subtitle={productSubtitle}
              icon="pantry"
              footerMessage={expiryMessage}
              onPress={() => router.push("/fridge")}
            />
            <MenuCard
              eyebrow="Planowanie"
              title="Moje obiady"
              subtitle="Wkrótce"
              icon="meal"
              disabled
            />
            <MenuCard
              eyebrow="Przepisy"
              title="Moje przepisy"
              subtitle="Wkrótce"
              icon="recipe"
              disabled
            />
          </View>
        </ScrollView>

        <View style={[styles.scanArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skanuj produkt"
            onPress={() => router.push("/scanner")}
            style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
          >
            <ScannerIcon />
            <Text style={styles.scanButtonText}>Skanuj produkt</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSettingsVisible(false)} />
          <View style={[styles.settingsSheet, { marginTop: insets.top + 68 }]}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Ustawienia</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zamknij ustawienia"
                onPress={() => setSettingsVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Moje lodówki"
              style={styles.settingsRow}
              onPress={() => navigateFromSettings("/fridges")}
            >
              <Text style={styles.settingsRowIcon}>▤</Text>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Moje lodówki</Text>
                <Text style={styles.settingsRowSubtitle}>Lista i wybór aktywnej lodówki</Text>
              </View>
              <Text style={styles.settingsChevron}>›</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Panel administratora"
              style={styles.settingsRow}
              onPress={() => navigateFromSettings("/admin")}
            >
              <Text style={styles.settingsRowIcon}>⌘</Text>
              <View style={styles.settingsRowCopy}>
                <Text style={styles.settingsRowTitle}>Panel administratora</Text>
                <Text style={styles.settingsRowSubtitle}>Produkty i domyślne terminy</Text>
              </View>
              <Text style={styles.settingsChevron}>›</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Wyloguj się"
              style={[styles.settingsRow, styles.logoutRow]}
              onPress={handleLogout}
            >
              <Text style={[styles.settingsRowIcon, styles.logoutText]}>↪</Text>
              <Text style={[styles.settingsRowTitle, styles.logoutText]}>Wyloguj się</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 26 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: {
    width: 260,
    height: 260,
    top: -70,
    right: -70,
    backgroundColor: "rgba(215,225,217,0.62)",
  },
  glowMiddle: {
    width: 290,
    height: 290,
    top: 270,
    left: -130,
    backgroundColor: "rgba(249,224,174,0.28)",
  },
  glowBottom: {
    width: 300,
    height: 300,
    bottom: -90,
    right: -120,
    backgroundColor: "rgba(189,214,211,0.42)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 38,
    paddingHorizontal: 4,
  },
  heading: {
    color: "#151917",
    fontSize: 43,
    lineHeight: 49,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
  },
  date: { color: "#6D706A", fontSize: 18, lineHeight: 25, marginTop: 6 },
  settingsButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,250,0.76)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#173746",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  settingsIcon: { color: "#173746", fontSize: 29, lineHeight: 32 },
  buttonPressed: { transform: [{ scale: 0.96 }], opacity: 0.88 },
  cards: { gap: 18 },
  scanArea: { paddingHorizontal: 20, paddingTop: 10 },
  scanButton: {
    minHeight: 72,
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#304B54",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.30)",
    shadowColor: "#173746",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  scanButtonPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  scanButtonText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  modalRoot: { flex: 1 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,35,39,0.28)" },
  settingsSheet: {
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 26,
    backgroundColor: "rgba(250,250,246,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#173746",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  settingsTitle: { color: "#172222", fontSize: 23, fontWeight: "700" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,55,70,0.07)",
  },
  closeButtonText: { color: "#173746", fontSize: 27, lineHeight: 29 },
  settingsRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 17,
  },
  settingsRowDisabled: { opacity: 0.48 },
  settingsRowIcon: { width: 26, textAlign: "center", color: "#294B57", fontSize: 23 },
  settingsRowCopy: { flex: 1 },
  settingsRowTitle: { color: "#1B292C", fontSize: 16, fontWeight: "700" },
  settingsRowSubtitle: { color: "#708086", fontSize: 13, marginTop: 3 },
  settingsChevron: { color: "#9DADB1", fontSize: 30, fontWeight: "300" },
  logoutRow: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(39,68,75,0.14)",
    borderRadius: 0,
  },
  logoutText: { color: "#A4493E" },
});

const scannerIconStyles = StyleSheet.create({
  wrap: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute", width: 10, height: 10, borderColor: "#fff" },
  topLeft: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 4 },
  barRow: { height: 19, flexDirection: "row", alignItems: "stretch", gap: 3 },
  bar: { width: 2, borderRadius: 1, backgroundColor: "#fff" },
  barWide: { width: 4 },
});
