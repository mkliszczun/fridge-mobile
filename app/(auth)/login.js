import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";

function KitchenMark() {
  return (
    <View style={markStyles.badge}>
      <View style={markStyles.cabinet}>
        <View style={markStyles.shelf} />
        <View style={[markStyles.shelf, markStyles.shelfBottom]} />
        <View style={[markStyles.jar, markStyles.jarTopLeft]} />
        <View style={[markStyles.jar, markStyles.jarTopRight]} />
        <View style={[markStyles.jar, markStyles.jarBottomLeft]} />
        <View style={[markStyles.jar, markStyles.jarBottomRight]} />
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [form, setForm] = useState({ login: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.login || !form.password) {
      setError("Podaj login i hasło");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(form.login.trim(), form.password);
    } catch (err) {
      setError(err.message || "Nie udało się zalogować");
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

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.intro}>
              <KitchenMark />
              <Text style={styles.eyebrow}>TWOJA KUCHNIA</Text>
              <Text style={styles.title}>Dobrze Cię widzieć</Text>
              <Text style={styles.subtitle}>
                Zaloguj się, aby wrócić do swojej lodówki.
              </Text>
            </View>

            <LinearGradient
              colors={["rgba(255,255,251,0.92)", "rgba(246,247,240,0.80)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Login</Text>
                <TextInput
                  accessibilityLabel="Login"
                  placeholder="Wpisz swój login"
                  placeholderTextColor="#98A2A3"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  style={styles.input}
                  value={form.login}
                  onChangeText={(value) => onChange("login", value)}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Hasło</Text>
                <TextInput
                  accessibilityLabel="Hasło"
                  placeholder="Wpisz swoje hasło"
                  placeholderTextColor="#98A2A3"
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  style={styles.input}
                  value={form.password}
                  onChangeText={(value) => onChange("password", value)}
                />
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorIcon}>!</Text>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zaloguj się"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && !submitting && styles.primaryButtonPressed,
                  submitting && styles.primaryButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Zaloguj się</Text>
                    <Text style={styles.primaryButtonArrow}>›</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Nie masz jeszcze konta?</Text>
                <Link href="/register" style={styles.linkText}>
                  Załóż konto
                </Link>
              </View>
            </LinearGradient>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  glow: { position: "absolute", borderRadius: 999 },
  glowTop: {
    width: 280,
    height: 280,
    top: -100,
    right: -90,
    backgroundColor: "rgba(199,218,211,0.62)",
  },
  glowMiddle: {
    width: 250,
    height: 250,
    top: 290,
    left: -145,
    backgroundColor: "rgba(249,224,174,0.30)",
  },
  glowBottom: {
    width: 310,
    height: 310,
    bottom: -140,
    right: -120,
    backgroundColor: "rgba(189,214,211,0.40)",
  },
  intro: { alignItems: "center", marginBottom: 28 },
  eyebrow: {
    color: "#7D9098",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginTop: 18,
  },
  title: {
    color: "#151917",
    fontSize: 37,
    lineHeight: 43,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 7,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: undefined }),
  },
  subtitle: {
    maxWidth: 300,
    color: "#667579",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 8,
  },
  card: {
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    padding: 22,
    gap: 17,
    shadowColor: "#173746",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  fieldGroup: { gap: 7 },
  label: {
    color: "#52666D",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginLeft: 4,
  },
  input: {
    minHeight: 56,
    backgroundColor: "rgba(238,244,242,0.78)",
    borderRadius: 18,
    paddingHorizontal: 17,
    paddingVertical: 14,
    color: "#162326",
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 15,
    backgroundColor: "rgba(164,73,62,0.09)",
  },
  errorIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 22,
    color: "#FFFFFF",
    backgroundColor: "#A4493E",
    fontWeight: "800",
  },
  error: { flex: 1, color: "#913D34", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  primaryButton: {
    minHeight: 60,
    borderRadius: 21,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#304B54",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.30)",
    shadowColor: "#173746",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  primaryButtonPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  primaryButtonDisabled: { opacity: 0.72 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  primaryButtonArrow: { position: "absolute", right: 20, color: "#D9E5E5", fontSize: 30, lineHeight: 30 },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
  },
  footerText: { color: "#6F7D80", fontSize: 13 },
  linkText: { color: "#294B57", fontWeight: "800", fontSize: 13 },
});

const markStyles = StyleSheet.create({
  badge: {
    width: 82,
    height: 82,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238,248,247,0.76)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#173746",
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cabinet: {
    width: 38,
    height: 42,
    borderWidth: 2.4,
    borderColor: "#173746",
    borderRadius: 6,
  },
  shelf: { position: "absolute", left: 0, right: 0, top: 14, height: 2, backgroundColor: "#173746" },
  shelfBottom: { top: 28 },
  jar: { position: "absolute", width: 8, height: 8, borderWidth: 1.7, borderColor: "#173746", borderRadius: 2 },
  jarTopLeft: { left: 5, top: 4 },
  jarTopRight: { right: 5, top: 4 },
  jarBottomLeft: { left: 5, bottom: 4 },
  jarBottomRight: { right: 5, bottom: 4 },
});
