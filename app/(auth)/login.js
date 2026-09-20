import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";

import { KitchenMark, accountStyles as styles } from "../../components/AccountUI";

export default function LoginScreen() {
  const { login, sessionMessage } = useAuth();
  const pending = useRef(false);
  const [form, setForm] = useState({ login: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (pending.current) return;
    if (!form.login || !form.password) {
      setError("Podaj e-mail lub login oraz hasło");
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await login(form.login.trim(), form.password);
    } catch (err) {
      setError(err.message || "Nie udało się zalogować");
    } finally {
      pending.current = false;
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
                <Text style={styles.label}>E-mail lub login</Text>
                <TextInput
                  accessibilityLabel="E-mail lub login"
                  placeholder="E-mail lub dotychczasowy login"
                  keyboardType="email-address"
                  maxLength={254}
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

              {error || sessionMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorIcon}>!</Text>
                  <Text style={styles.error}>{error || sessionMessage}</Text>
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

              <Link href="/forgot-password" style={[styles.linkText, { paddingVertical: 8, textAlign: "center" }]}>Nie pamiętasz hasła?</Link>

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
