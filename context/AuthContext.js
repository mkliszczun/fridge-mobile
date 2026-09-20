import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../constants/api";
import { credentialStorage } from "../utils/credentialStorage";
import { createSessionClient, ApiError } from "../utils/sessionClient";

const AuthContext = createContext(null);
const fridgeKey = (id) => `active_fridge:${id}`;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState(null);
  const [activeFridge, setActiveFridgeState] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [usageError, setUsageError] = useState(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = createSessionClient({
    baseUrl: API_BASE_URL, storage: credentialStorage, onChange: setSession,
    onVerificationChange: setVerification,
    onExpired: () => setSessionMessage("Sesja wygasła. Zaloguj się ponownie."),
  });
  const client = clientRef.current;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Legacy JWTs cannot refresh and must not stay in unencrypted storage.
        await AsyncStorage.multiRemove(["auth_token", "auth_login", "active_fridge"]);
        await client.restore();
      } catch {
        if (alive) setSessionMessage("Nie udało się odczytać zapisanej sesji. Zaloguj się ponownie.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [client]);

  const refreshProfile = useCallback(async () => {
    const current = client.getSession();
    if (!current) return;
    try {
      const response = await client.request("/api/me");
      const result = await response.json();
      if (!response.ok || result?.id !== current.userId || !["FREE", "PREMIUM"].includes(result.plan)) {
        throw new ApiError("Nie udało się odczytać danych konta.");
      }
      if (client.getSession()?.sessionId === current.sessionId) { setProfile(result); setProfileError(null); }
    } catch (error) {
      if (client.getSession()?.sessionId === current.sessionId) setProfileError(error.message);
    }
  }, [client]);

  const refreshUsage = useCallback(async () => {
    const current = client.getSession();
    if (!current) return;
    try {
      const response = await client.request("/api/me/ai-usage");
      const result = await response.json();
      if (!response.ok || !Number.isFinite(Number(result?.remainingUsd)) || !result?.resetsAt) {
        throw new ApiError("Nie udało się odczytać limitu AI.");
      }
      if (client.getSession()?.sessionId === current.sessionId) { setAiUsage(result); setUsageError(null); }
    } catch (error) {
      if (client.getSession()?.sessionId === current.sessionId) setUsageError(error.message);
    }
  }, [client]);

  const refreshAccount = useCallback(() => Promise.all([refreshProfile(), refreshUsage()]), [refreshProfile, refreshUsage]);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setProfileError(null);
    setAiUsage(null);
    setUsageError(null);
    setBlockedUntil(0);
    setActiveFridgeState(null);
    if (session?.userId) {
      AsyncStorage.getItem(fridgeKey(session.userId)).then(value => {
        if (alive) setActiveFridgeState(value);
      }).catch(() => {});
      refreshAccount();
    }
    return () => { alive = false; };
    // Session identity stays stable through token rotation, preserving unsaved forms.
  }, [session?.sessionId, refreshAccount]);

  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") { setClock(Date.now()); refreshAccount(); }
    });
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [refreshAccount]);

  const apiFetch = useCallback(async (url, options) => {
    const current = client.getSession();
    try { return await client.request(url, options); }
    catch (error) {
      if (error.status === 429 && client.getSession()?.sessionId === current?.sessionId) setBlockedUntil(error.resetsAt);
      throw error;
    } finally {
      if (url.includes("/ai/") && client.getSession()?.sessionId === current?.sessionId) refreshUsage();
    }
  }, [client, refreshUsage]);

  const login = useCallback(async (email, password) => {
    setSessionMessage(null);
    return client.login(email, password);
  }, [client]);
  const register = useCallback(async (email, password) => {
    setSessionMessage(null);
    return client.register(email, password);
  }, [client]);
  const forgotPassword = useCallback(email => client.forgotPassword(email), [client]);
  const sendVerificationEmail = useCallback(email => client.sendVerificationEmail(email), [client]);
  const verifyEmail = useCallback(code => client.verifyEmail(code), [client]);
  const cancelVerification = useCallback(() => client.cancelVerification(), [client]);
  const logout = useCallback(() => client.logout(), [client]);

  const setActiveFridge = useCallback(async (id) => {
    const current = client.getSession();
    if (!current) return;
    if (id) await AsyncStorage.setItem(fridgeKey(current.userId), String(id));
    else await AsyncStorage.removeItem(fridgeKey(current.userId));
    if (client.getSession()?.sessionId === current.sessionId) setActiveFridgeState(id ? String(id) : null);
  }, [client]);

  const deleteAccount = useCallback(async (password) => {
    const current = client.getSession();
    if (!current) throw new ApiError("Zaloguj się ponownie.", 401);
    const response = await client.request("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }) }, { passwordCheck: true });
    if (response.status !== 204) throw new ApiError("Nie udało się usunąć konta.");
    try { await AsyncStorage.multiRemove([fridgeKey(current.userId), fridgeKey(current.email)]); }
    finally { await client.clearLocal(); }
  }, [client]);

  const currentUsage = aiUsage && Date.parse(aiUsage.resetsAt) > clock ? aiUsage : null;
  const isPremium = profile?.plan === "PREMIUM" && Date.parse(profile.premiumUntil) > clock;
  const value = useMemo(() => ({
    sessionId: session?.sessionId || null, user: session?.email || null, userId: session?.userId || null,
    isAdmin: session?.roles?.some(role => role === "ADMIN" || role === "ROLE_ADMIN") || false,
    loading, sessionMessage, verification, activeFridge, profile, profileError, isPremium,
    adsEnabled: profile ? !isPremium || profile.adsEnabled !== false : false,
    aiUsage: currentUsage, usageError, canUseAi: blockedUntil <= clock && (!currentUsage || Number(currentUsage.remainingUsd) > 0),
    apiFetch, login, register, forgotPassword, logout, deleteAccount, setActiveFridge, refreshAccount, refreshUsage,
    sendVerificationEmail, verifyEmail, cancelVerification,
  }), [session, loading, sessionMessage, verification, activeFridge, profile, profileError, isPremium, currentUsage, usageError,
    blockedUntil, clock, apiFetch, login, register, forgotPassword, logout, deleteAccount, setActiveFridge, refreshAccount, refreshUsage,
    sendVerificationEmail, verifyEmail, cancelVerification]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}
