import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { emailError } from "../../utils/accountValidation";
import { AccountPage, AccountCard, AccountField, AccountButton, AccountMessage, accountStyles } from "../../components/AccountUI";

const remaining = (until, now) => Math.max(0, Math.ceil((until - now) / 1000));
const duration = seconds => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

export default function VerifyEmailScreen() {
  const { verification, sendVerificationEmail, verifyEmail, cancelVerification } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(verification?.email || "");
  const [code, setCode] = useState("");
  const [time, setTime] = useState(Date.now());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const update = () => setTime(Date.now());
    const timer = setInterval(update, 1000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") update(); });
    return () => { mounted.current = false; clearInterval(timer); listener.remove(); };
  }, []);
  useEffect(() => { setEmail(verification?.email || ""); }, [verification?.email]);

  if (!verification) return null; // Root navigator returns to login if the app was restarted.
  const registration = verification.mode === "register";
  const expired = verification.invalid || verification.expiresAt <= time;
  const changedEmail = email.trim().toLowerCase() !== verification.email;
  const hasCode = verification.codeExpiresAt !== null;
  const codeExpired = hasCode && verification.codeExpiresAt <= time;
  const resendWait = remaining(Math.max(verification.resendAvailableAt, verification.sendBlockedUntil), time);
  const verifyWait = remaining(verification.verifyBlockedUntil, time);

  const perform = async (action) => {
    if (pending.current || expired) return;
    if (action === "send") {
      if (resendWait) return;
      const invalid = emailError(email, registration ? 64 : 254);
      if (invalid) { setError(invalid); return; }
    } else {
      if (changedEmail || codeExpired || verifyWait || !hasCode) return;
      if (!/^[0-9]{6}$/.test(code)) { setError("Wpisz sześciocyfrowy kod z wiadomości."); return; }
    }
    pending.current = true; setBusy(action); setError(null);
    try {
      if (action === "send") {
        await sendVerificationEmail(email);
        if (mounted.current) setCode("");
      } else await verifyEmail(code);
    } catch (err) {
      if (mounted.current) setError(err.message || "Nie udało się potwierdzić adresu.");
    } finally {
      pending.current = false;
      if (mounted.current) { setBusy(null); setTime(Date.now()); }
    }
  };

  const leave = () => {
    // Invalidate in-flight responses immediately, including a late successful verification.
    const clearing = cancelVerification();
    router.replace(registration ? "/register" : "/login");
    clearing.catch(() => {}); // This temporary process itself was never persisted.
  };

  return <AccountPage title="Potwierdź e-mail" subtitle={registration
    ? "Jeszcze jeden krok do Twojej kuchni." : "Potwierdź adres, aby wrócić do swojej kuchni."}>
    <AccountCard>
      {expired ? <AccountMessage error>Potwierdzenie utraciło ważność. Rozpocznij ponownie.</AccountMessage> : <>
        <AccountField label="E-mail" placeholder="twoj@email.pl" keyboardType="email-address" autoComplete="email"
          textContentType="emailAddress" maxLength={registration ? 64 : 254} value={email}
          onChangeText={value => { setEmail(value); setError(null); }} editable={!registration && !busy}
          onSubmitEditing={() => perform("send")} returnKeyType="send" />
        {!hasCode && <AccountMessage>{registration ? "Wyślemy na ten adres sześciocyfrowy kod."
          : "Sprawdź lub popraw adres, na który wyślemy kod. Twój dotychczasowy login pozostanie ważny."}</AccountMessage>}
        {hasCode && changedEmail && <AccountMessage>Wyślij kod na nowy adres, aby potwierdzić zmianę.</AccountMessage>}
        {hasCode && !changedEmail && <>
          <AccountMessage>{"Kod został wysłany na " + verification.email + ". Sprawdź też folder spam."}</AccountMessage>
          <AccountField label="Kod z wiadomości" placeholder="000000" keyboardType="number-pad"
            autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} value={code}
            onChangeText={value => { setCode(value.replace(/[^0-9]/g, "").slice(0, 6)); setError(null); }}
            editable={!busy && !codeExpired} onSubmitEditing={() => perform("verify")} returnKeyType="done" />
          {codeExpired ? <AccountMessage error>Kod wygasł. Wyślij nowy kod.</AccountMessage>
            : <Text style={{ color: "#52666D" }}>{"Kod ważny jeszcze " + duration(remaining(verification.codeExpiresAt, time)) + "."}</Text>}
          {verifyWait > 0 && <Text style={{ color: "#52666D" }}>{"Kolejna próba za " + duration(verifyWait) + "."}</Text>}
          <AccountButton title="Potwierdź i zaloguj" busy={busy === "verify"}
            disabled={!!busy || codeExpired || verifyWait > 0} onPress={() => perform("verify")} />
        </>}
        <AccountMessage error>{error}</AccountMessage>
        {resendWait > 0 && <Text style={{ color: "#52666D" }}>{"Ponowna wysyłka za " + duration(resendWait) + "."}</Text>}
        <AccountButton title={changedEmail && hasCode ? "Wyślij kod na nowy adres" : hasCode ? "Wyślij kod ponownie" : "Wyślij kod"}
          busy={busy === "send"} disabled={!!busy || resendWait > 0} onPress={() => perform("send")} />
      </>}
      <Pressable accessibilityRole="button" onPress={leave} style={{ paddingVertical: 10 }}>
        <Text style={accountStyles.linkText}>{registration ? "Wróć do rejestracji / zmień adres" : "Wróć do logowania"}</Text>
      </Pressable>
    </AccountCard>
  </AccountPage>;
}
