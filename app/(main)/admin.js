import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

function CatalogIcon() {
  return (
    <View style={iconStyles.catalog}>
      <View style={iconStyles.catalogShelf} />
      <View style={[iconStyles.catalogShelf, iconStyles.catalogShelfBottom]} />
      <View style={[iconStyles.catalogItem, { left: 5, top: 5 }]} />
      <View style={[iconStyles.catalogItem, { right: 5, top: 5 }]} />
      <View style={[iconStyles.catalogItem, { left: 5, bottom: 5 }]} />
      <View style={[iconStyles.catalogItem, { right: 5, bottom: 5 }]} />
    </View>
  );
}

function AddIcon() {
  return (
    <View style={iconStyles.addCircle}>
      <View style={iconStyles.addHorizontal} />
      <View style={iconStyles.addVertical} />
    </View>
  );
}

function CalendarIcon() {
  return (
    <View style={iconStyles.calendar}>
      <View style={iconStyles.calendarTop} />
      <View style={iconStyles.calendarRingLeft} />
      <View style={iconStyles.calendarRingRight} />
      <View style={iconStyles.calendarDots}>
        <View style={iconStyles.calendarDot} />
        <View style={iconStyles.calendarDot} />
        <View style={iconStyles.calendarDot} />
      </View>
    </View>
  );
}

function AdminCard({ eyebrow, title, subtitle, icon, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.cardShell, pressed && styles.cardPressed]}
    >
      <LinearGradient
        colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.iconBadge}>
          {icon === "catalog" ? <CatalogIcon /> : null}
          {icon === "add" ? <AddIcon /> : null}
          {icon === "calendar" ? <CalendarIcon /> : null}
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardEyebrow}>{eyebrow}</Text>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.cardChevron}>›</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function AdminScreen() {
  const router = useRouter();

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
              <Text style={styles.title}>Panel administratora</Text>
              <Text style={styles.headerSubtitle}>Katalog i reguły dla całej aplikacji</Text>
            </View>
          </View>

          <View style={styles.notice}>
            <View style={styles.noticeBadge}>
              <Text style={styles.noticeBadgeText}>A</Text>
            </View>
            <Text style={styles.noticeText}>
              Zmiany w tym panelu wpływają na wspólny katalog produktów.
            </Text>
          </View>

          <View style={styles.cards}>
            <AdminCard
              eyebrow="KATALOG"
              title="Lista produktów"
              subtitle="Przeglądaj produkty bazowe"
              icon="catalog"
              onPress={() => router.push("/products")}
            />
            <AdminCard
              eyebrow="KATALOG"
              title="Dodaj produkt"
              subtitle="Utwórz nowy produkt bazowy"
              icon="add"
              onPress={() => router.push("/add-product")}
            />
            <AdminCard
              eyebrow="REGUŁY"
              title="Domyślne terminy"
              subtitle="Edytuj czas ważności i czas po otwarciu"
              icon="calendar"
              onPress={() => router.push("/admin-expiration")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 34 },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: { width: 260, height: 260, top: -80, right: -80, backgroundColor: "rgba(215,225,217,0.62)" },
  glowMiddle: { width: 280, height: 280, top: 330, left: -150, backgroundColor: "rgba(249,224,174,0.28)" },
  glowBottom: { width: 300, height: 300, bottom: -110, right: -130, backgroundColor: "rgba(189,214,211,0.42)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 15, paddingBottom: 24 },
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
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    backgroundColor: "rgba(237,244,241,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.88)",
  },
  noticeBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#304B54" },
  noticeBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  noticeText: { flex: 1, color: "#617278", fontSize: 12, lineHeight: 17 },
  cards: { gap: 16 },
  cardShell: {
    width: "100%",
    borderRadius: 27,
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  card: {
    minHeight: 126,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  iconBadge: {
    width: 66,
    height: 66,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,243,244,0.84)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  cardCopy: { flex: 1 },
  cardEyebrow: { color: "#7D9098", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.1 },
  cardTitle: { color: "#151917", fontSize: 21, lineHeight: 26, fontWeight: "700", marginTop: 3 },
  cardSubtitle: { color: "#60727A", fontSize: 14, lineHeight: 20, marginTop: 4 },
  cardChevron: { alignSelf: "flex-start", color: "#A4B5BA", fontSize: 35, lineHeight: 35, fontWeight: "300", marginTop: 5 },
});

const INK = "#173746";

const iconStyles = StyleSheet.create({
  catalog: { width: 34, height: 38, borderWidth: 2.2, borderColor: INK, borderRadius: 5 },
  catalogShelf: { position: "absolute", left: 0, right: 0, top: 12, height: 2, backgroundColor: INK },
  catalogShelfBottom: { top: 25 },
  catalogItem: { position: "absolute", width: 7, height: 7, borderWidth: 1.6, borderColor: INK, borderRadius: 2 },
  addCircle: { width: 37, height: 37, borderRadius: 19, borderWidth: 2.2, borderColor: INK, alignItems: "center", justifyContent: "center" },
  addHorizontal: { width: 18, height: 2.5, borderRadius: 2, backgroundColor: INK },
  addVertical: { position: "absolute", width: 2.5, height: 18, borderRadius: 2, backgroundColor: INK },
  calendar: { width: 37, height: 35, borderWidth: 2.2, borderColor: INK, borderRadius: 6, marginTop: 3 },
  calendarTop: { position: "absolute", left: 0, right: 0, top: 8, height: 2, backgroundColor: INK },
  calendarRingLeft: { position: "absolute", left: 7, top: -5, width: 3, height: 9, borderRadius: 2, backgroundColor: INK },
  calendarRingRight: { position: "absolute", right: 7, top: -5, width: 3, height: 9, borderRadius: 2, backgroundColor: INK },
  calendarDots: { position: "absolute", left: 7, right: 7, bottom: 7, flexDirection: "row", justifyContent: "space-between" },
  calendarDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: INK },
});
