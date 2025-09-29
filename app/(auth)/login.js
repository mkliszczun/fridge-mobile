import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useAuth } from "../../context/AuthContext";

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
      colors={["#FFF8E6", "#FFE19A", "#FFF3C9"]}
      locations={[0, 0.55, 1]}
      style={styles.background}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Zaloguj się</Text>
          <TextInput
            placeholder="Login"
            autoCapitalize="none"
            style={styles.input}
            value={form.login}
            onChangeText={(value) => onChange("login", value)}
          />
          <TextInput
            placeholder="Hasło"
            secureTextEntry
            style={styles.input}
            value={form.password}
            onChangeText={(value) => onChange("password", value)}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Zaloguj</Text>
            )}
          </Pressable>
          <View style={styles.footer}>
            <Text style={styles.footerText}>Nie masz konta?</Text>
            <Link href="/register" style={styles.linkText}>Zarejestruj się</Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 20,
    padding: 24,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { fontSize: 24, fontWeight: "700", color: "#4A3B1B", marginBottom: 4 },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 190, 120, 0.4)",
  },
  error: { color: "#D64550", fontSize: 13 },
  primaryButton: {
    backgroundColor: "#1F6FEB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 6 },
  footerText: { color: "#6F5833", fontSize: 13 },
  linkText: { color: "#1F6FEB", fontWeight: "600", fontSize: 13 },
});
