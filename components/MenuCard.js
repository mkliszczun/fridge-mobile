import { Pressable, Text, StyleSheet } from "react-native";

export default function MenuCard({ title, subtitle, onPress, primary }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.card, primary && styles.primary, pressed && { transform: [{ scale: 0.98 }] }
    ]}>
      <Text style={[styles.title, primary && styles.titlePrimary]}>{title}</Text>
      <Text style={[styles.subtitle, primary && styles.subtitlePrimary]}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width:"48%", backgroundColor:"#fff", borderRadius:16, padding:14, minHeight:110,
          justifyContent:"space-between", shadowColor:"#000", shadowOpacity:0.06,
          shadowRadius:8, shadowOffset:{width:0,height:4}, elevation:3 },
  primary: { backgroundColor:"#1F6FEB" },
  title: { fontSize:16, fontWeight:"700", color:"#111" },
  subtitle: { fontSize:12, color:"#666", marginTop:6 },
  titlePrimary: { color:"#fff" },
  subtitlePrimary: { color:"rgba(255,255,255,0.85)" },
});
