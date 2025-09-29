import { Pressable, Text, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function MenuCard({ title, subtitle, onPress, primary }) {
  const colors = primary
    ? ["#1F6FEB", "#1B51C5"]
    : ["#FFF0D6", "#FFE3A3"];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardWrapper, pressed && styles.cardPressed]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, !primary && styles.cardFrame]}
      >
        <View>
          <Text style={[styles.title, primary ? styles.titlePrimary : styles.titleWarm]}>
            {title}
          </Text>
          <Text
            style={[styles.subtitle, primary ? styles.subtitlePrimary : styles.subtitleWarm]}
          >
            {subtitle}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    borderRadius: 18,
  },
  card: {
    borderRadius: 18,
    padding: 20,
    minHeight: 110,
    justifyContent: "center",
  },
  cardFrame: {
    borderWidth: 1,
    borderColor: "rgba(255, 190, 120, 0.4)",
  },
  cardPressed: { transform: [{ scale: 0.99 }] },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 6 },
  titlePrimary: { color: "#fff" },
  subtitlePrimary: { color: "rgba(255,255,255,0.85)" },
  titleWarm: { color: "#4A3B1B" },
  subtitleWarm: { color: "#6F5833" },
});
