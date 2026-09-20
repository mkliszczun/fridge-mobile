# Potwierdzanie adresu e-mail

## Przebieg

1. Rejestracja lub logowanie niepotwierdzonego konta zwraca HTTP 202 z `verificationToken`, `expiresAt`, `email`, `emailRequired`. Nie jest to zalogowana sesja.
2. Ekran „Potwierdź e-mail” pokazuje adres. Przy rejestracji jest on stały; zmianę umożliwia powrót do formularza. Stary użytkownik może podać poprawny adres (do 254 znaków), zachowując dotychczasowy login.
3. „Wyślij kod” wywołuje `POST /auth/email/send` z `{verificationToken, email}`. Rejestracja/logowanie nie wysyłają wiadomości automatycznie.
4. Użytkownik wpisuje sześciocyfrowy kod (również zaczynający się od zera). `POST /auth/email/verify` z `{verificationToken, code}` zwraca właściwą parę tokenów i od razu otwiera Kuchnię.

Klient nadal przyjmuje parę tokenów z HTTP 200/201 starszego backendu. Nie wymusza lokalnego potwierdzenia, jeśli serwer już udzielił dostępu; to backend zabezpiecza konta.

## Ważność i błędy

- Token procesu: 30 minut; kod: 10 minut; ponowna wysyłka najwcześniej po 60 sekundach. Ekran korzysta z terminów zwracanych przez API, a po powrocie z tła aktualizuje odliczanie.
- Błędny kod pozwala spróbować ponownie. Zmiana adresu wymaga wysłania nowego kodu. Wygaśnięcie całego procesu wymaga powrotu do logowania/rejestracji.
- HTTP 429 respektuje `Retry-After`. Liczniki wysyłania i wpisywania kodów są oddzielne — limit wysyłki nie blokuje wykorzystania wcześniej dostarczonego kodu. Limity pozostają egzekwowane przez serwer.
- Konflikt adresu i awaria SMTP mają osobne komunikaty. Awaria nie usuwa tymczasowego tokenu; można ponowić wysyłkę ręcznie, bez ponownego podawania hasła.
- Token weryfikacji nie trafia do SecureStore, AsyncStorage, URL, logów ani nagłówka Authorization. Hasło nie jest kopiowane do stanu procesu. Anulowanie odrzuca spóźnione odpowiedzi. Restart usuwa proces z pamięci.

## Sprawdzenie przed wdrożeniem

Najpierw skonfigurować SMTP w backendzie testowym. Nie dodawać haseł SMTP do mobilki ani zmiennych `EXPO_PUBLIC_*`. Adres API środowiska testowego ustawia `EXPO_PUBLIC_API_BASE_URL`; po zmianie ponownie uruchomić Expo.

1. Nowy e-mail → rejestracja → wysyłka kodu → wiadomość w skrzynce → wpisanie kodu → Kuchnia.
2. Stare konto → dotychczasowy login i hasło → poprawiony adres → kod → te same dane lodówki.
3. Błędny kod, wygaśnięcie, ponowna wysyłka, brak sieci, powrót z aplikacji pocztowej i anulowanie.
4. Ponowne logowanie potwierdzonym kontem bez kodu; odzyskanie hasła nadal przez link.
5. Sprawdzić iOS i Android: klawiaturę kodu, autouzupełnianie, przycisk Wstecz i restart.

`npm test` sprawdza klienta sesji na atrapach odpowiedzi. Po `npm run check:export`, `npx playwright test` sprawdza ekrany z atrapą API (w tym 202, błędny kod, awarię SMTP, 429, zmianę adresu i wygaśnięcie). Nie wysyła prawdziwych e-maili i nie zastępuje testu SMTP ani urządzenia.
