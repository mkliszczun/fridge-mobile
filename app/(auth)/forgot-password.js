import { useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { emailError } from "../../utils/accountValidation";
import { AccountPage, AccountCard, AccountField, AccountButton, AccountMessage } from "../../components/AccountUI";

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    const invalid = emailError(email, 254);
    if (invalid) { setError(invalid); return; }
    submitting.current = true; setBusy(true); setError(null);
    try { await forgotPassword(email.trim()); setSent(true); }
    catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <AccountPage title="Odzyskaj dostęp" subtitle="Wyślemy Ci link do ustawienia nowego hasła." back="/login">
    <AccountCard>
      {sent ? <AccountMessage>Jeśli konto z tym adresem istnieje, otrzymasz wiadomość z linkiem ważnym przez 30 minut. Sprawdź też folder spam. Ustaw hasło w przeglądarce, a następnie wróć do aplikacji i zaloguj się.</AccountMessage> : <>
        <AccountField label="E-mail" placeholder="twoj@email.pl" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254} value={email} onChangeText={setEmail} editable={!busy} onSubmitEditing={submit} returnKeyType="send" />
        <AccountMessage error>{error}</AccountMessage>
        <AccountButton title="Wyślij link" busy={busy} onPress={submit} />
      </>}
    </AccountCard>
  </AccountPage>;
}
