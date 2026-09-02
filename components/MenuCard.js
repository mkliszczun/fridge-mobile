import { Pressable, Text, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

function PantryIcon() {
  return (
    <View style={iconStyles.pantryBody}>
      <View style={iconStyles.pantryShelf} />
      <View style={[iconStyles.pantryShelf, iconStyles.pantryShelfBottom]} />
      <View style={[iconStyles.pantryJar, { left: 5, top: 5 }]} />
      <View style={[iconStyles.pantryJar, { right: 5, top: 5 }]} />
      <View style={[iconStyles.pantryJar, { left: 5, bottom: 5 }]} />
      <View style={[iconStyles.pantryJar, { right: 5, bottom: 5 }]} />
    </View>
  );
}

function MealIcon() {
  return (
    <View style={iconStyles.mealWrap}>
      <View style={iconStyles.steamRow}>
        <View style={[iconStyles.steam, { transform: [{ rotate: "24deg" }] }]} />
        <View style={[iconStyles.steam, { transform: [{ rotate: "24deg" }] }]} />
      </View>
      <View style={iconStyles.bowlRim} />
      <View style={iconStyles.bowl} />
      <View style={iconStyles.bowlFoot} />
    </View>
  );
}

function RecipeIcon() {
  return (
    <View style={iconStyles.bookWrap}>
      <View style={[iconStyles.page, iconStyles.pageLeft]}>
        <View style={iconStyles.bookLine} />
        <View style={iconStyles.bookLine} />
        <View style={iconStyles.bookLine} />
      </View>
      <View style={[iconStyles.page, iconStyles.pageRight]}>
        <View style={iconStyles.bookLine} />
        <View style={iconStyles.bookLine} />
        <View style={iconStyles.bookLine} />
      </View>
      <View style={iconStyles.bookSpine} />
    </View>
  );
}

function ShoppingIcon() {
  return (
    <View style={iconStyles.shoppingWrap}>
      <View style={iconStyles.shoppingHandle} />
      <View style={iconStyles.shoppingBag}>
        <View style={iconStyles.shoppingLine} />
        <View style={iconStyles.shoppingLine} />
        <View style={iconStyles.shoppingLine} />
      </View>
    </View>
  );
}

function FeatureIcon({ type }) {
  return (
    <View style={styles.iconBadge}>
      {type === "pantry" ? <PantryIcon /> : null}
      {type === "meal" ? <MealIcon /> : null}
      {type === "recipe" ? <RecipeIcon /> : null}
      {type === "shopping" ? <ShoppingIcon /> : null}
    </View>
  );
}

export default function MenuCard({
  eyebrow,
  title,
  subtitle,
  icon,
  onPress,
  disabled = false,
  footerMessage,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.cardWrapper,
        pressed && !disabled && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}
    >
      <LinearGradient
        colors={["rgba(255,255,251,0.90)", "rgba(246,247,240,0.78)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.cardContent}>
          <FeatureIcon type={icon} />
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        {footerMessage ? (
          <View style={styles.footer}>
            <Text style={styles.warningIcon}>△</Text>
            <Text style={styles.footerText}>{footerMessage}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const INK = "#173746";

const styles = StyleSheet.create({
  cardWrapper: {
    width: "100%",
    borderRadius: 28,
    shadowColor: "#173746",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
    overflow: "hidden",
  },
  cardContent: {
    minHeight: 138,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconBadge: {
    width: 76,
    height: 76,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(229,243,244,0.82)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  copy: { flex: 1 },
  eyebrow: {
    color: "#7D9098",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: "#121817",
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "700",
    marginTop: 4,
  },
  subtitle: {
    color: "#60727A",
    fontSize: 16,
    lineHeight: 23,
    marginTop: 5,
  },
  chevron: {
    alignSelf: "flex-start",
    color: "#A4B5BA",
    fontSize: 35,
    lineHeight: 35,
    fontWeight: "300",
    marginTop: 6,
  },
  footer: {
    minHeight: 72,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,240,196,0.76)",
    borderTopWidth: 1,
    borderTopColor: "rgba(222,170,61,0.10)",
  },
  warningIcon: { color: "#A46100", fontSize: 27, lineHeight: 28 },
  footerText: { flex: 1, color: "#A46100", fontSize: 16, lineHeight: 23, fontWeight: "600" },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  cardDisabled: { opacity: 0.72 },
});

const iconStyles = StyleSheet.create({
  pantryBody: {
    width: 36,
    height: 40,
    borderWidth: 2.4,
    borderColor: INK,
    borderRadius: 5,
  },
  pantryShelf: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 13,
    height: 2,
    backgroundColor: INK,
  },
  pantryShelfBottom: { top: 26 },
  pantryJar: {
    position: "absolute",
    width: 8,
    height: 8,
    borderWidth: 1.8,
    borderColor: INK,
    borderRadius: 2,
  },
  mealWrap: { width: 45, height: 42, alignItems: "center", justifyContent: "flex-end" },
  steamRow: { position: "absolute", top: 0, flexDirection: "row", gap: 8 },
  steam: { width: 3, height: 10, borderRadius: 2, backgroundColor: INK },
  bowlRim: { width: 43, height: 3, borderRadius: 2, backgroundColor: INK },
  bowl: {
    width: 35,
    height: 17,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: INK,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  bowlFoot: { width: 18, height: 3, marginTop: 3, borderRadius: 2, backgroundColor: INK },
  bookWrap: { width: 42, height: 36, flexDirection: "row" },
  page: {
    flex: 1,
    borderWidth: 2.2,
    borderColor: INK,
    paddingHorizontal: 4,
    paddingTop: 7,
    gap: 4,
  },
  pageLeft: { borderTopLeftRadius: 6, borderBottomLeftRadius: 4, borderRightWidth: 1 },
  pageRight: { borderTopRightRadius: 6, borderBottomRightRadius: 4, borderLeftWidth: 1 },
  bookLine: { width: "100%", height: 1.5, borderRadius: 1, backgroundColor: INK },
  bookSpine: { position: "absolute", top: 2, bottom: -2, left: 20, width: 2, backgroundColor: INK },
  shoppingWrap: { width: 39, height: 42, alignItems: "center", justifyContent: "flex-end" },
  shoppingHandle: {
    position: "absolute",
    top: 0,
    width: 19,
    height: 14,
    borderWidth: 2.3,
    borderBottomWidth: 0,
    borderColor: INK,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  shoppingBag: {
    width: 37,
    height: 33,
    borderWidth: 2.3,
    borderColor: INK,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 5,
  },
  shoppingLine: { width: "100%", height: 1.8, borderRadius: 1, backgroundColor: INK },
});
