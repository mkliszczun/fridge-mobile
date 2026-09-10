export class ApiError extends Error {
  constructor(message, status = 0, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    Object.assign(this, extra);
  }
}

// Claims only control presentation. The API remains the authority for permissions.
export function readClaims(token) {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
    return JSON.parse(decodeURIComponent(Array.from(bytes, c => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
  } catch { return {}; }
}

export function retryTime(header, now = Date.now()) {
  if (header && /^\d+$/.test(header)) return now + Number(header) * 1000;
  const date = header ? Date.parse(header) : NaN;
  if (Number.isFinite(date)) return date;
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.getTime();
}

export async function responseError(response, action = "request") {
  const payload = await response.clone().json().catch(() => null);
  const messages = {
    400: "Sprawdź wprowadzone dane i spróbuj ponownie.",
    401: action === "delete" ? "Nieprawidłowe hasło lub wygasła sesja. Konto nie zostało usunięte."
      : action === "login" ? "Nieprawidłowy e-mail lub hasło." : "Sesja wygasła. Zaloguj się ponownie.",
    403: "Nie masz uprawnień do tej operacji.",
    409: action === "register" ? "Konto z tym adresem e-mail już istnieje. Zaloguj się lub odzyskaj hasło."
      : "Nie można wykonać tej operacji — dane są już używane lub zostały zmienione.",
    413: "Za dużo danych dla jednego zapytania AI. Zmniejsz zakres i spróbuj ponownie.",
    429: "Dzisiejszy limit AI został wykorzystany. Spróbuj ponownie po odnowieniu limitu.",
  };
  return new ApiError(messages[response.status] || (response.status >= 500
    ? "Serwer jest chwilowo niedostępny. Spróbuj ponownie za chwilę."
    : payload?.message || payload?.error || "Nie udało się wykonać operacji."), response.status,
  response.status === 429 ? { resetsAt: retryTime(response.headers.get("Retry-After")) } : {});
}

export function createSessionClient({ baseUrl, storage, fetchImpl = (...args) => fetch(...args),
  onChange = () => {}, onExpired = () => {}, now = () => Date.now() }) {
  const base = baseUrl.replace(/\/+$/, "");
  let session = null;
  let generation = 0;
  let refreshFlight = null;
  let writes = Promise.resolve();
  const expired = () => new ApiError("Sesja wygasła. Zaloguj się ponownie.", 401);
  const check = (epoch) => { if (epoch !== generation) throw expired(); };
  const persist = (value, epoch) => {
    const operation = writes.catch(() => {}).then(async () => {
      check(epoch);
      if (value) await storage.write(JSON.stringify(value));
      else await storage.clear();
    });
    writes = operation;
    return operation;
  };

  async function clearLocal(notify = false) {
    const epoch = ++generation;
    session = null;
    refreshFlight = null;
    onChange(null);
    if (notify) onExpired();
    await persist(null, epoch);
  }

  async function send(path, options = {}) {
    const { timeoutMs = 25000, signal, ...init } = options;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      return await fetchImpl(`${base}${path}`, { ...init, credentials: "omit", signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(controller.signal.aborted
        ? "Serwer nie odpowiedział na czas. Sprawdź połączenie i spróbuj ponownie."
        : "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }

  function makeSession(payload, email, sessionId) {
    const claims = readClaims(payload?.token || "");
    if (!payload?.refreshToken || typeof claims.uid !== "string" || !Number.isFinite(claims.exp)) {
      throw new ApiError("Nie udało się rozpocząć sesji. Spróbuj ponownie później.");
    }
    return { accessToken: payload.token, refreshToken: payload.refreshToken, expiresAt: claims.exp * 1000,
      userId: claims.uid, email: email || claims.sub, sessionId: sessionId || claims.jti || payload.token,
      roles: Array.isArray(claims.roles) ? claims.roles : [], refreshPending: false };
  }

  async function restore() {
    const epoch = generation;
    const raw = await storage.read();
    if (epoch !== generation || !raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved || saved.refreshPending) throw expired();
      session = makeSession({ token: saved.accessToken, refreshToken: saved.refreshToken }, saved.email, saved.sessionId);
      onChange(session);
    } catch { await clearLocal(); }
  }

  async function authenticate(path, email, password) {
    const epoch = ++generation;
    const response = await send(path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: email, password }) });
    check(epoch);
    if (!response.ok) throw await responseError(response, path.endsWith("register") ? "register" : "login");
    const next = makeSession(await response.json(), email);
    await persist(next, epoch);
    check(epoch);
    session = next;
    onChange(session);
    return session;
  }

  function refresh() {
    if (refreshFlight) return refreshFlight;
    if (!session) return Promise.reject(expired());
    const current = session;
    const epoch = generation;
    const flight = (async () => {
      try {
        // If the app dies during rotation, do not replay a potentially consumed token on next launch.
        await persist({ ...current, refreshPending: true }, epoch);
        check(epoch);
        const response = await send("/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: current.refreshToken }) });
        check(epoch);
        if (!response.ok) throw expired();
        const next = makeSession(await response.json(), current.email, current.sessionId);
        if (next.userId !== current.userId) throw expired();
        await persist(next, epoch);
        check(epoch);
        session = next;
        onChange(session);
        return next.accessToken;
      } catch {
        if (epoch === generation) await clearLocal(true);
        throw expired();
      } finally { if (refreshFlight === flight) refreshFlight = null; }
    })();
    refreshFlight = flight;
    return flight;
  }

  async function request(url, options = {}, { passwordCheck = false } = {}) {
    // Refuse absolute third-party URLs and never forward their Authorization headers.
    const path = url.startsWith(`${base}/`) ? url.slice(base.length) : url;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) throw new ApiError("Nieprawidłowy adres żądania.");
    if (!session) throw expired();
    const epoch = generation;
    const access = session.expiresAt <= now() + 30000 ? await refresh() : session.accessToken;
    check(epoch);
    const execute = (token) => {
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${token}`);
      return send(path, { timeoutMs: path.includes("/ai/") ? 120000 : 25000, ...options, headers });
    };
    let response = await execute(access);
    check(epoch);
    if (response.status === 401 && !passwordCheck) {
      const fresh = session.accessToken !== access ? session.accessToken : await refresh();
      check(epoch);
      response = await execute(fresh);
      check(epoch);
      if (response.status === 401) { await clearLocal(true); throw expired(); }
    }
    // Scanner needs a 404 response to try Open Food Facts. All other errors share Polish messages.
    if (!response.ok && response.status !== 404) throw await responseError(response, passwordCheck ? "delete" : "request");
    return response;
  }

  async function logout() {
    let access = session?.accessToken;
    try { if (session && session.expiresAt <= now() + 30000) access = await refresh(); } catch { access = null; }
    await clearLocal();
    if (!access) return false;
    try { return (await send("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${access}` } })).ok; }
    catch { return false; }
  }

  async function forgotPassword(email) {
    const response = await send("/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }) });
    if (!response.ok) throw await responseError(response);
  }

  return { restore, request, logout, forgotPassword, clearLocal, getSession: () => session,
    login: (email, password) => authenticate("/auth/login", email, password),
    register: (email, password) => authenticate("/auth/register", email, password) };
}
