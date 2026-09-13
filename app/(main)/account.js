import { useCallback, useRef, useState } from "react";
import { Pressable, Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { AccountPage, AccountCard, AccountField, AccountButton, AccountMessage, accountStyles } from "../../components/AccountUI";
import AiBudgetNotice from "../../components/AiBudgetNotice";

export default function AccountScreen() {
  const { user, profile, profileError, isPremium, refreshAccount, forgotPassword, deleteAccount, logout } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const submitting = useRef(false);
  useFocusEffect(useCallback(() => { refreshAccount(); }, [refreshAccount]));
  const run = async (action, operation) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(action); setError(null); setMessage(null);
    try { await operation(); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(null); }
  };
  return <AccountPage title="Twoje konto" subtitle={user} back="/" intro={false}>
    <AccountCard>
      <Text style={[accountStyles.label, { fontSize: 16 }]}>{profile ? isPremium ? "Premium" : "Konto bezpłatne" : "Sprawdzam plan konta..."}</Text>
      {profile && <AccountMessage>{isPremium
        ? `Premium aktywne do ${new Date(profile.premiumUntil).toLocaleDateString("pl-PL")}. Twój plan wyłącza reklamy.`
        : "Premium nie jest aktywne. Zakup subskrypcji w aplikacji będzie dostępny w kolejnej aktualizacji."}</AccountMessage>}
      <AccountMessage error>{profileError}</AccountMessage>
      <AccountButton title="Odśwież status konta" busy={busy === "refresh"} disabled={!!busy} onPress={() => run("refresh", refreshAccount)} />
      <AiBudgetNotice />
    </AccountCard>
    <AccountCard>
      <Text style={accountStyles.label}>Dostęp i bezpieczeństwo</Text>
      <AccountMessage>Link do zmiany hasła wyślemy na adres Twojego konta. Zmiana hasła wyloguje wszystkie urządzenia.</AccountMessage>
      <AccountButton title="Wyślij link do zmiany hasła" busy={busy === "password"} disabled={!!busy} onPress={() => run("password", async () => {
        await forgotPassword(user); setMessage("Jeśli konto z tym adresem istnieje, otrzymasz link ważny przez 30 minut. Sprawdź też folder spam.");
      })} />
      <AccountMessage>Wylogowanie przy połączeniu z serwerem kończy sesje na wszystkich urządzeniach.</AccountMessage>
      <AccountButton title="Wyloguj się" busy={busy === "logout"} disabled={!!busy} onPress={() => run("logout", logout)} />
      <AccountMessage>{message}</AccountMessage>
      {!confirmDelete && <AccountMessage error>{error}</AccountMessage>}
    </AccountCard>
    <AccountCard>
      <Text style={[accountStyles.label, { color: "#913D34" }]}>Usunięcie konta</Text>
      <AccountMessage>Trwale usuniesz konto i swoje prywatne dane. Wspólne lodówki pozostaną dostępne dla pozostałych domowników. Tej operacji nie można cofnąć.</AccountMessage>
      {confirmDelete ? <>
        <AccountField label="Potwierdź aktualnym hasłem" secureTextEntry autoComplete="password" textContentType="password" value={password} onChangeText={setPassword} editable={!busy} />
        <AccountButton title="Potwierdzam — usuń moje konto" danger busy={busy === "delete"} disabled={!!busy || !password} onPress={() => run("delete", () => deleteAccount(password))} />
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => { setConfirmDelete(false); setPassword(""); setError(null); }} style={{ paddingVertical: 14 }}><Text style={accountStyles.linkText}>Anuluj</Text></Pressable>
      </> : <AccountButton title="Usuń konto…" danger disabled={!!busy} onPress={() => { setConfirmDelete(true); setError(null); }} />}
      {confirmDelete && <AccountMessage error>{error}</AccountMessage>}
    </AccountCard>
  </AccountPage>;
}
