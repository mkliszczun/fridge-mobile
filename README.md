# Fridge Mobile

Aplikacja Expo / React Native do zarządzania lodówką, przepisami, planem posiłków i zakupami.

## Uruchomienie

Wymagany Node.js 24 i npm. Zainstaluj zależności przez `npm ci`, opcjonalnie utwórz `.env.local` na podstawie `.env.example`, następnie uruchom `npm start`.

`EXPO_PUBLIC_API_BASE_URL` to publiczny adres API wbudowywany w aplikację. Nie umieszczaj w nim ani w innych zmiennych `EXPO_PUBLIC_*` kluczy OpenAI, haseł ani sekretów. Domyślny adres pozostaje `https://fridge-app-api.fly.dev`.

Ta wersja wymaga kontraktu kont i sesji z [Fridge PR #2](https://github.com/mkliszczun/Fridge/pull/2). Samo ustawienie adresu nie wdraża backendu. Najpierw sprawdź nowe API na środowisku testowym, potem zbuduj klienta dla właściwego środowiska.

## Konto i sesja

- Rejestracja: e-mail do 64 znaków, hasło co najmniej 8 znaków i maksymalnie 72 bajty UTF-8; automatyczne logowanie po utworzeniu konta.
- Hasło: ekran wysyła prośbę o wiadomość; ustawienie nowego hasła odbywa się przez stronę API pod linkiem z e-maila. Backend potrzebuje działającej konfiguracji poczty i publicznego adresu strony resetowania.
- Usuwanie konta: Ustawienia → Twoje konto → Usuń konto; potwierdzenie aktualnym hasłem. Błędne hasło nie ponawia DELETE i nie wylogowuje użytkownika.
- Tokeny natywne przechowuje `expo-secure-store`. Dawne tokeny z AsyncStorage są usuwane; istniejący użytkownik musi zalogować się ponownie po migracji. W podglądzie WWW sesja żyje wyłącznie w pamięci, więc odświeżenie strony wymaga ponownego logowania.
- Wszystkie wywołania aplikacji przechodzą przez `apiFetch` z AuthContext. Nie dodawaj własnych nagłówków Authorization ani bezpośredniego `fetch` do ekranów.
- Jedna równoległa operacja odświeżania obraca parę tokenów; zmiana access tokena nie resetuje formularzy. Niepewny wynik rotacji wymaga ponownego logowania, aby nie odtworzyć zużytego refresh tokena.
- Wylogowanie próbuje odwołać sesje na wszystkich urządzeniach; przy braku sieci usuwa sesję lokalną. Inne urządzenia mogą pozostać zalogowane do czasu skutecznego odwołania po stronie API.
- Rola z JWT służy wyłącznie widoczności interfejsu. Uprawnienia katalogu egzekwuje API.

## Premium i AI

Ekran konta odczytuje rzeczywisty plan i datę końca Premium z `/api/me`. Nie ma jeszcze zakupu subskrypcji, przywracania zakupów ani SDK reklam. `isPremium` i `adsEnabled` są przygotowane do tej integracji; status nie jest lokalnym przełącznikiem użytkownika.

Limit AI jest odczytywany z `/api/me/ai-usage`. Backend rozlicza koszt oraz narzuca dzienny budżet, domyślnie 1 USD na konto, także Premium. Interfejs pokazuje pozostały procent i lokalną godzinę resetu. Nie ponawia automatycznie generowania po błędzie sieci ani 429. Ostateczna decyzja o dopuszczeniu żądania należy do API.

## Weryfikacja

- `npm test` — testy sesji, rotacji, błędów, izolacji kont i walidacji.
- `npm run check:export` — eksport kodu i zasobów iOS, Android i WWW; nie tworzy podpisanego IPA/AAB.
- `npx playwright install chromium --only-shell`, następnie `npx playwright test` — testy ekranów po eksporcie, z atrapą API, bez operacji na prawdziwych kontach.
- GitHub Actions wykonuje powyższe kontrole i zapisuje zrzuty w artefakcie `mobile-ui-checks`.

Dodanie SecureStore wymaga nowego builda natywnego. `runtimeVersion.policy = fingerprint` oddziela aktualizacje OTA dla różnych zestawów zależności natywnych. Nie wysyłaj tej zmiany wyłącznie jako OTA do dotychczasowej aplikacji.

Ocena gotowości, pozostałe ryzyka i plan premiery: [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md).
