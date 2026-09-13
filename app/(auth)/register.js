import { useRef, useState } from "react";
import { Link } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { emailError, passwordError } from "../../utils/accountValidation";
import { AccountPage, AccountCard, AccountField, AccountButton, AccountMessage, accountStyles } from "../../components/AccountUI";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    const invalid = emailError(email) || passwordError(password, confirm);
    if (invalid) { setError(invalid); return; }
    submitting.current = true; setBusy(true); setError(null);
    try { await register(email.trim(), password); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <AccountPage title="Załóż konto" subtitle="Twoje produkty, przepisy i plany w jednym miejscu.">
    <AccountCard>
      <AccountField label="E-mail" placeholder="twoj@email.pl" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={64} value={email} onChangeText={setEmail} editable={!busy} />
      <AccountField label="Hasło" placeholder="Co najmniej 8 znaków" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} editable={!busy} />
      <AccountField label="Powtórz hasło" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={confirm} onChangeText={setConfirm} onSubmitEditing={submit} returnKeyType="done" editable={!busy} />
      <AccountMessage error>{error}</AccountMessage>
      <AccountButton title="Załóż konto" busy={busy} onPress={submit} />
      <Link href="/login" style={accountStyles.linkText}>Masz już konto? Zaloguj się</Link>
    </AccountCard>
  </AccountPage>;
}
