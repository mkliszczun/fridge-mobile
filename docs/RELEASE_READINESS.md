# Ocena gotowości Fridge Mobile — 10 września 2026

## Werdykt

**Dobra baza funkcjonalnego MVP, ale jeszcze nie gotowy produkt sklepowy. Nie ma potrzeby przepisywania aplikacji ani zmiany Expo / React Native.** Największa pozostała praca to monetyzacja, przygotowanie wydania i testy na urządzeniach. Refaktoryzację dużych ekranów można wykonywać stopniowo.

Przegląd dotyczy repo `mkliszczun/fridge-mobile`, wyjściowo commit `e0abacd` z 3 września 2026, oraz integracji z [Fridge PR #2](https://github.com/mkliszczun/Fridge/pull/2). Nie oznacza sprawdzenia działającej produkcji ani akceptacji przez sklepy.

## Co zostało zrobione w tej zmianie

| Obszar | Wynik |
| --- | --- |
| Rejestracja | Istniała; otrzymała walidację zgodną z nowym API, ochronę przed wielokrotnym wysłaniem i wygląd spójny z logowaniem. |
| Sesje | SecureStore na urządzeniach, rotacja refresh tokenów, wspólny klient API na wszystkich ekranach, zakończenie nieważnej sesji, odrzucanie odpowiedzi poprzedniego konta. |
| Hasło | Odzyskiwanie przed logowaniem oraz wysyłka linku zmiany z ekranu konta. Nowe hasło ustawia strona pod linkiem z e-maila. |
| Usuwanie konta | Potwierdzenie intencji i aktualnym hasłem; po sukcesie czyszczenie sesji oraz lokalnego wyboru lodówki. |
| Katalog | Każdy zalogowany użytkownik może przeglądać i dodawać; edycja/usuwanie oraz trasy administratora wymagają roli ADMIN. API pozostaje ostatecznym zabezpieczeniem. |
| AI | Wspólny licznik pozostałego limitu, reset w czasie lokalnym, blokada po wykorzystaniu budżetu i komunikat 429. Brak automatycznych powtórzeń kosztownych operacji po błędach sieci. |
| Premium | Plan, data wygaśnięcia i informacja o wyłączeniu reklam wynikają z API. Nie zaimplementowano płatności ani emisji reklam. |
| Wygląd | Zachowano układ i style Kuchni oraz logowania. Nowe widoki korzystają z istniejącej palety, gradientów, zaokrągleń i typografii. |
| Diagnostyka | Usunięto pomocniczy logger pełnych żądań/odpowiedzi, który mógł ujawniać hasła i tokeny po uruchomieniu starego wejścia `App.js`. Faktyczne wejście aplikacji to `expo-router/entry`. |
| Konfiguracja natywna | Dodano SecureStore, opis uprawnienia aparatu, wyłączono prośbę o mikrofon i zmieniono politykę zgodności OTA na fingerprint. |

## Przed publiczną premierą

1. **Wdrożyć i sprawdzić API.** Mobilka zależy od nowych endpointów; backendowy PR nie jest automatycznie produkcją. Potrzebne są migracje bazy, sekrety JWT, skonfigurowana poczta, publiczna strona resetowania hasła i konfiguracja cen/limitów AI. Przejść prawdziwy scenariusz rejestracja → e-mail → reset → ponowne logowanie → usunięcie konta, w tym konto ze wspólną lodówką. Stare konta z loginem niebędącym e-mailem potrzebują ustalonej ścieżki migracji/odzyskiwania.

2. **Dokończyć płatne Premium, jeżeli ma być dostępne na premierę.** Zdefiniować produkty, ceny i korzyści; dodać zakup i przywracanie subskrypcji oraz zarządzanie subskrypcją. API musi weryfikować zakup i obsługiwać odnowienia, wygaśnięcie, zwroty oraz przypisanie zakupu do właściwego konta. Przetestować sandbox Apple i Google. Docelową integrację rozliczeń oprzeć na zasadach właściwych sklepów i rynków; [Apple opisuje reguły zakupów cyfrowych w sekcji 3.1](https://developer.apple.com/app-store/review/guidelines/). Sam status Premium nie oznacza gotowego systemu sprzedaży.

3. **Dodać reklamy dla Free, jeżeli są częścią premiery.** Zintegrować SDK, najpierw identyfikatory testowe, oraz wymagane przez wybrany wariant emisji zgody i deklaracje danych. Wyłączać reklamy na podstawie uprawnienia z API; nie inicjalizować emisji, gdy status konta jest nieznany. Sprawdzić zmianę planu i wygaśnięcie w trakcie używania aplikacji. Nie obiecywać braku reklam jako płatnej korzyści przed uruchomieniem obu stron tej funkcji.

4. **Przygotować prawdziwe buildy sklepowe.** W `app.json` brakuje `ios.bundleIdentifier` i `android.package`; nie ma jeszcze `eas.json` ani ustalonego procesu podpisywania, numerowania i wysyłki. Są identyfikator projektu EAS i URL aktualizacji, ale to nie potwierdza gotowości kont ani certyfikatów. Potrzebny nowy build z SecureStore, TestFlight i ścieżka testowa Play. Nie przypisano zgadywanych, docelowych identyfikatorów aplikacji.

5. **Uzupełnić informacje sklepowe i obsługę danych.** Nazwa w konfiguracji nadal brzmi `fridge-mobile`. Przygotować docelową ikonę/splash, zrzuty, opis, kontakt, politykę prywatności dostępną także w aplikacji, deklaracje danych i konto demonstracyjne do recenzji. Google wymaga dodatkowo zasobu WWW umożliwiającego zgłoszenie usunięcia konta — samo nowe menu w aplikacji nie zamyka tego zadania ([Google Play](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)). Po dołączeniu subskrypcji wyjaśnić przy usuwaniu konta dalsze rozliczenia i udostępnić zarządzanie subskrypcją ([Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/)). Zweryfikować zakres usuwania/anonimizacji wspólnych danych względem faktycznych zasad produktu.

6. **Dopracować i przetestować skaner.** `app/(main)/scanner.js` pozostaje bez sterowania kamerą na podstawie aktywności ekranu. Przejście `router.push` może pozostawiać skaner zamontowany pod formularzem. Efekt uprawnień ponownie wywołuje prośbę po odmowie, bez sprawdzenia `canAskAgain` i przekierowania do ustawień. Potrzebne są poprawki cyklu życia, obsługi odmowy oraz timerów/opóźnionych odpowiedzi po opuszczeniu ekranu. Sprawdzić wielokrotny odczyt EAN, nieznany produkt, brak sieci, powrót z formularza i tło aplikacji na obu platformach.

7. **Wykonać testy wydania na iPhonie i Androidzie.** Klawiatura i małe ekrany, przycisk Wstecz, VoiceOver/TalkBack, powiększony tekst, aparat, SecureStore po restarcie, wygaśnięcie 15-minutowej sesji, zerwana sieć, zmiana konta i aktualizacja starszej instalacji. `supportsTablet: true` wymaga również sprawdzenia iPada. Przejść cały obieg produktu, przepisu, posiłku i listy zakupów ze współdzieleniem lodówki, a nie tylko nowe ekrany konta.

8. **Sprawdzić ochronę i obsługę produkcji.** Limit 1 USD dziennie na konto nie ogranicza liczby zakładanych kont. Potrzebna decyzja o ochronie rejestracji/logowania/resetu przed nadużyciami, globalnym limicie kosztów AI i alarmach. Ustalić backup/odtworzenie bazy oraz raportowanie błędów bez tokenów, haseł i treści prywatnych żądań. Dodawanie do wspólnego katalogu przez wszystkich użytkowników wymaga planu usuwania spamu/duplikatów.

## Wersje i wymagania narzędzi

Repo używa Expo SDK 57, React 19.2.3 i React Native 0.86.3. Zależności natywne odpowiadają zakresom z lokalnego `expo/bundledNativeModules.json`; nie ma podstaw, żeby proponować migrację ze starego SDK na podstawie wcześniejszej pamięci projektu. Lokalny katalog wersji React Native wskazuje target/compile SDK 36, ale ostateczny manifest potwierdzi dopiero build AAB.

Przed wysyłką potwierdzić wymagania w konsolach: [Apple wymaga dla nowych uploadów od 28 kwietnia 2026 Xcode 26+ i SDK iOS 26+](https://developer.apple.com/news/upcoming-requirements/), a [Google publikuje aktualne wymagania target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB). Nie wykonano podpisanej kompilacji natywnej w tym przeglądzie.

## Co można robić stopniowo

- Rozbić duże ekrany (`fridge.js`, `plan-meals.js`, `shopping-list.js`, formularze) na mniejsze komponenty i hooki. Obecnie część plików ma około 800–1200 linii.
- Ograniczać powielanie parsowania odpowiedzi, walidacji, stylów i formatowania dat. Wspólny klient API oraz komponenty konta są pierwszym krokiem.
- Dodać typy kontraktów API i lint, następnie paginację/wyszukiwanie dużego katalogu. Aktualnie katalog pobierany jest w całości.
- Rozszerzać cache i obsługę offline po określeniu zasad synchronizacji. Nie traktować obecnego produktu jako aplikacji działającej bez sieci.
- Testować kolejne scenariusze biznesowe i usunąć nieużywane wejście `App.js`, gdy zostanie potwierdzone, że żaden dodatkowy proces na nim nie polega.

## Weryfikacja tej zmiany

- Lokalnie: 15/15 testów logiki konta i sesji; eksport iOS, Android i WWW zakończony powodzeniem.
- W CI: testy logiki, eksport oraz testy ekranów z atrapą API; bieżący wynik jest widoczny w PR.
- Testy przeglądarkowe obejmują rejestrację, odzyskiwanie hasła, menu/katalog USER i ADMIN, Premium, wykorzystany limit AI oraz nieudane i udane usunięcie konta. Zrzuty są artefaktem workflow.
- Nie wykonano testów kamery, Keychain/Android Keystore, prawdziwej poczty, produkcyjnego API, płatności ani podpisanych buildów. Eksport Metro i testy WWW nie zastępują tych kontroli.

## Kolejność dalszej pracy

Najpierw wdrożenie API na środowisku testowym i poprawki skanera, potem buildy testowe z nowym kontem/sesją. Następnie płatności oraz reklamy, materiały i formularze sklepowe, testy obu platform i zamknięta beta. Termin premiery uzależnić od wyników tych etapów i recenzji sklepów. Nie wymaga to generalnego remontu aplikacji, ale nie warto sprowadzać pozostałej pracy do samego dodania przycisku Premium.
