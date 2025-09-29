import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../constants/api";

const AUTH_TOKEN_KEY = "auth_token";
const AUTH_LOGIN_KEY = "auth_login";
const AUTH_ACTIVE_FRIDGE_KEY = "active_fridge";

const AuthContext = createContext({
  token: null,
  loading: true,
  user: null,
  activeFridge: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  setActiveFridge: async () => {},
});

const buildActiveFridgeKey = (login) => `${AUTH_ACTIVE_FRIDGE_KEY}:${login}`;

async function parseResponse(res) {
  let payload = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text ? { message: text } : null;
  }
  return payload;
}

function extractToken(payload) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  return payload.token || payload.accessToken || payload.jwt || null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [activeFridge, setActiveFridgeState] = useState(null);

  useEffect(() => {
    const initializeAuthState = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        const storedLogin = await AsyncStorage.getItem(AUTH_LOGIN_KEY);
        if (storedToken) setToken(storedToken);
        if (storedLogin) {
          setUser(storedLogin);

          // migrate legacy active fridge key if needed
          const legacyActive = await AsyncStorage.getItem(AUTH_ACTIVE_FRIDGE_KEY);
          if (legacyActive) {
            await AsyncStorage.setItem(buildActiveFridgeKey(storedLogin), legacyActive);
            await AsyncStorage.removeItem(AUTH_ACTIVE_FRIDGE_KEY);
            setActiveFridgeState(legacyActive);
          } else {
            const storedActive = await AsyncStorage.getItem(buildActiveFridgeKey(storedLogin));
            if (storedActive) setActiveFridgeState(storedActive);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    initializeAuthState();
  }, []);

  const authenticate = useCallback(async (path, body, loginValue) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = await parseResponse(res);
    if (!res.ok) {
      const message = payload?.message || `HTTP ${res.status}`;
      throw new Error(message);
    }

    const receivedToken = extractToken(payload);
    if (!receivedToken) throw new Error("Brak tokenu w odpowiedzi serwera");

    await AsyncStorage.setItem(AUTH_TOKEN_KEY, receivedToken);
    if (loginValue) {
      await AsyncStorage.setItem(AUTH_LOGIN_KEY, loginValue);
      setUser(loginValue);
      const storedActive = await AsyncStorage.getItem(buildActiveFridgeKey(loginValue));
      setActiveFridgeState(storedActive);
    }
    setToken(receivedToken);
    return receivedToken;
  }, []);

  const login = useCallback((loginValue, password) => {
    return authenticate("/auth/login", { login: loginValue, password }, loginValue);
  }, [authenticate]);

  const register = useCallback((loginValue, password) => {
    return authenticate("/auth/register", { login: loginValue, password }, loginValue);
  }, [authenticate]);

  const setActiveFridge = useCallback(async (fridgeId) => {
    const fridgeValue = fridgeId ? String(fridgeId) : null;
    setActiveFridgeState(fridgeValue);

    const currentUser = user || (await AsyncStorage.getItem(AUTH_LOGIN_KEY));
    if (!currentUser) {
      if (!fridgeValue) {
        await AsyncStorage.removeItem(AUTH_ACTIVE_FRIDGE_KEY);
      } else {
        await AsyncStorage.setItem(AUTH_ACTIVE_FRIDGE_KEY, fridgeValue);
      }
      return;
    }

    const key = buildActiveFridgeKey(currentUser);
    if (!fridgeValue) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, fridgeValue);
    }
  }, [user]);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(AUTH_LOGIN_KEY);
    setToken(null);
    setUser(null);
    setActiveFridgeState(null);
  }, []);

  const value = useMemo(
    () => ({ token, loading, user, activeFridge, login, register, logout, setActiveFridge }),
    [token, loading, user, activeFridge, login, register, logout, setActiveFridge]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
