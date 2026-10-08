import type { LegalContent } from "../types";

// Drafts written while building Tunewick, describing what the app really does. Not reviewed by a
// lawyer yet — every page says so. Keep them in sync with the code when features change.
export const pl: LegalContent = {
  draftNotice:
    "Wersja robocza {version}. Dokument opisuje, jak Tunewick działa naprawdę, ale nie został jeszcze sprawdzony przez prawnika. Obowiązuje w zamkniętej becie i może się zmienić przed publicznym startem.",
  contents: "Spis treści",
  missing: "do uzupełnienia",
  fields: {
    operator: "imię i nazwisko lub nazwa operatora",
    address: "adres",
    email: "e-mail kontaktowy",
  },
  documents: {
    terms: {
      title: "Regulamin",
      lead: "Zasady korzystania z Tunewick — serwisu do słuchania i odkrywania muzyki niezależnych artystów z całej Polski.",
      sections: [
        {
          id: "postanowienia-ogolne",
          title: "1. Kto prowadzi Tunewick",
          blocks: [
            "Tunewick (dalej: „serwis”) prowadzi {operator}, {address} (dalej: „operator”). Kontakt we wszystkich sprawach: {email}.",
            "Regulamin jest regulaminem świadczenia usług drogą elektroniczną. Udostępniamy go bezpłatnie przed założeniem konta, w formie, którą można zapisać i wydrukować.",
            "Serwis działa w fazie zamkniętej bety: konto można założyć tylko z kodem zaproszenia, a funkcje mogą się zmieniać lub chwilowo nie działać.",
          ],
        },
        {
          id: "definicje",
          title: "2. Pojęcia",
          blocks: [
            {
              list: [
                "Konto — Twoje konto w serwisie, chronione adresem e-mail i hasłem.",
                "Słuchacz — każda osoba z kontem lub odwiedzająca serwis.",
                "Artysta — profil artysty (osoba, zespół, projekt) prowadzony przez jedno lub kilka kont; zasady dla artystów opisuje osobny Regulamin dla artystów.",
                "Treści — nagrania, okładki, opisy, playlisty, profile, informacje o koncertach i miejscach.",
                "Premium — dostęp do muzyki w jakości bezstratnej i Hi-Res.",
              ],
            },
          ],
        },
        {
          id: "wymagania",
          title: "3. Wymagania techniczne",
          blocks: [
            "Do korzystania z serwisu potrzebujesz aktualnej przeglądarki (Chrome, Edge, Firefox lub Safari) z włączonym JavaScriptem, dostępu do internetu i adresu e-mail. Odtwarzanie w jakości bezstratnej wymaga szybszego łącza.",
            "Nie wolno przesyłać treści o charakterze bezprawnym ani próbować obchodzić zabezpieczeń serwisu.",
          ],
        },
        {
          id: "konto",
          title: "4. Konto",
          blocks: [
            "Konto może założyć osoba, która ma co najmniej 16 lat — potwierdzasz to przy rejestracji.",
            "Zakładając konto, zawierasz z operatorem bezpłatną umowę o świadczenie usług na czas nieokreślony na zasadach tego regulaminu.",
            "Konto jest osobiste: nie udostępniaj go innym i chroń swoje hasło. Jeśli podejrzewasz, że ktoś zna Twoje hasło, zmień je i napisz do nas.",
            "Konto możesz w każdej chwili usunąć w Ustawieniach (sekcja „Twoje dane”). Usunięcie jest natychmiastowe i nieodwracalne; jeśli jesteś jedynym właścicielem profilu artysty, najpierw dodaj innego właściciela albo napisz na {email}, żeby usunąć profil.",
          ],
        },
        {
          id: "usluga",
          title: "5. Co oferuje serwis",
          blocks: [
            {
              list: [
                "słuchanie muzyki w przeglądarce (strumieniowo — bez możliwości pobierania plików);",
                "odkrywanie artystów, wydawnictw, koncertów i miejsc, także z Twojej okolicy;",
                "bibliotekę: polubienia, obserwowanie artystów i osób, playlisty, historię słuchania;",
                "oznaczanie koncertów, na których byłeś lub byłaś („Byłem przy tym”);",
                "dla artystów: profil, wydawnictwa, koncerty i statystyki słuchaczy.",
              ],
            },
            "Konto podstawowe jest bezpłatne. W becie nie przyjmujemy żadnych płatności. Premium można otrzymać kodem promocyjnym lub od operatora.",
            "Rekomendacje w serwisie zawsze pokazują swój powód (np. „ten sam realizator”). Nie ma w nich płatnych promocji.",
          ],
        },
        {
          id: "kody",
          title: "6. Kody promocyjne",
          blocks: [
            "Kod promocyjny daje Premium na czas podany przy kodzie. Kod jest jednorazowy, nie można go wymienić na pieniądze, a liczba prób wpisania jest ograniczona.",
            "Premium „bez limitu czasu” oznacza dostęp tak długo, jak serwis działa w obecnej formie. Jeśli serwis zakończy działalność, uprzedzimy o tym co najmniej 30 dni wcześniej.",
          ],
        },
        {
          id: "zasady",
          title: "7. Zasady korzystania",
          blocks: [
            "Korzystając z serwisu, nie możesz:",
            {
              list: [
                "publikować treści niezgodnych z prawem, nawołujących do nienawiści, nękających lub naruszających cudze prawa (w tym autorskie);",
                "podszywać się pod inne osoby, artystów lub zespoły;",
                "wysyłać spamu ani sztucznie zawyżać odtworzeń, obserwujących czy statystyk;",
                "masowo pobierać danych z serwisu (scraping), nagrywać strumieni ani obchodzić zabezpieczeń i limitów;",
                "dodawać fikcyjnych koncertów i miejsc.",
              ],
            },
            "Za naruszenie tych zasad możemy ukryć treść, ograniczyć funkcje konta lub — przy poważnych albo powtarzających się naruszeniach — zablokować konto. Każdą taką decyzję uzasadniamy i można się od niej odwołać (zob. Zasady treści i zgłoszeń).",
          ],
        },
        {
          id: "tresci-uzytkownikow",
          title: "8. Twoje treści",
          blocks: [
            "Treści, które dodajesz (profil, opis, nazwy playlist), pozostają Twoje. Udzielasz operatorowi bezpłatnej, niewyłącznej licencji na ich przechowywanie i wyświetlanie w serwisie — tylko w zakresie, w jakim sam lub sama je udostępniasz (np. playlista prywatna jest widoczna tylko dla Ciebie). Licencja wygasa, gdy usuniesz treść lub konto.",
            "Kto widzi Twoją aktywność (oznaczone koncerty, publiczne playlisty), decydujesz w Ustawieniach: wszyscy, obserwujący albo tylko Ty. Domyślnie: obserwujący.",
          ],
        },
        {
          id: "odpowiedzialnosc",
          title: "9. Dostępność i odpowiedzialność",
          blocks: [
            "Staramy się, żeby serwis działał bez przerw, ale w becie mogą zdarzać się awarie, przerwy techniczne i zmiany funkcji. Nie odpowiadamy za skutki przerw, jeśli nie wynikają z naszej winy.",
            "Muzykę i inne treści publikują artyści i słuchacze. Nie sprawdzamy ich z góry pod każdym względem, ale reagujemy na zgłoszenia i moderujemy wydawnictwa przed publikacją.",
            "Te zapisy nie ograniczają praw, które przysługują Ci jako konsumentowi z mocy prawa.",
          ],
        },
        {
          id: "reklamacje",
          title: "10. Reklamacje",
          blocks: [
            "Jeśli coś nie działa tak, jak opisuje regulamin, napisz na {email}: opisz problem i podaj adres e-mail konta. Odpowiemy w ciągu 14 dni.",
          ],
        },
        {
          id: "rozwiazanie",
          title: "11. Zakończenie umowy",
          blocks: [
            "Możesz zakończyć umowę w każdej chwili, usuwając konto.",
            "Operator może zakończyć umowę z ważnych powodów (poważne lub powtarzające się naruszenia regulaminu, zakończenie działalności serwisu) z 14-dniowym wyprzedzeniem, a przy rażących naruszeniach — ze skutkiem natychmiastowym. Zawsze podamy powód.",
          ],
        },
        {
          id: "zmiany",
          title: "12. Zmiany regulaminu",
          blocks: [
            "Regulamin możemy zmienić z ważnych powodów (zmiana prawa, nowe funkcje, bezpieczeństwo). O zmianach poinformujemy w serwisie lub e-mailem co najmniej 14 dni wcześniej. Jeśli się nie zgadzasz, możesz usunąć konto przed wejściem zmian w życie.",
          ],
        },
        {
          id: "koncowe",
          title: "13. Postanowienia końcowe",
          blocks: [
            "Obowiązuje prawo polskie. Jeśli jesteś konsumentem, nie tracisz ochrony, którą dają Ci przepisy kraju, w którym mieszkasz.",
            "Spory konsumenckie możesz też rozwiązać polubownie, np. z pomocą miejskiego lub powiatowego rzecznika konsumentów.",
            "Jak przetwarzamy dane, opisuje Polityka prywatności. Zasady dla artystów — Regulamin dla artystów. Zgłaszanie treści — Zasady treści i zgłoszeń.",
          ],
        },
      ],
    },

    artistTerms: {
      title: "Regulamin dla artystów",
      lead: "Na jakich zasadach publikujesz muzykę w Tunewick. Uzupełnia Regulamin serwisu.",
      sections: [
        {
          id: "kto",
          title: "1. Kto może prowadzić profil artysty",
          blocks: [
            "Profil artysty może założyć każda osoba z kontem. Profil może mieć kilku członków zespołu w rolach: właściciel, menedżer, członek. Właściciel i menedżer mogą publikować, zarządzać zespołem profilu i odwoływać się od decyzji moderacji.",
            "Akceptując ten regulamin w imieniu zespołu lub projektu, oświadczasz, że możesz działać w imieniu wszystkich osób, których prawa dotyczą publikowanej muzyki.",
            "Weryfikacja profilu (znaczek „zweryfikowany”) jest dobrowolna i zależy od decyzji moderatora.",
          ],
        },
        {
          id: "prawa",
          title: "2. Twoje prawa zostają przy Tobie",
          blocks: [
            "Publikując wydawnictwo, nie przenosisz na operatora praw autorskich ani pokrewnych. Udzielasz operatorowi bezpłatnej, niewyłącznej licencji, bez prawa udzielania dalszych licencji, na cały świat, na czas publikacji wydawnictwa w serwisie, na polach eksploatacji:",
            {
              list: [
                "przechowywanie plików (w tym niezmienionego oryginału — mastera);",
                "zwielokrotnianie technicznie potrzebne do udostępniania, w tym przekodowanie do formatów strumieniowych (np. FLAC, AAC) — bez zmiany brzmienia poza konwersją formatu;",
                "publiczne udostępnianie utworów w taki sposób, aby każdy mógł mieć do nich dostęp w miejscu i czasie przez siebie wybranym — wyłącznie strumieniowo, bez pobierania;",
                "udostępnianie fragmentu do 30 sekund („Soundcheck”) w celu odkrywania muzyki w serwisie;",
                "wyświetlanie okładek, zdjęć, nazw, opisów i metadanych (autorzy, realizatorzy, wytwórnia) w serwisie.",
              ],
            },
            "Licencja nie obejmuje sprzedaży plików, udostępniania ich do pobrania ani przekazywania muzyki innym serwisom.",
          ],
        },
        {
          id: "oswiadczenia",
          title: "3. Oświadczenia przy publikacji",
          blocks: [
            "Przed wysłaniem wydawnictwa do moderacji składasz oświadczenie, które zapisujemy na stałe (z datą i wersją tego regulaminu). Oświadczasz w nim m.in., że:",
            {
              list: [
                "masz prawa do nagrań (masterów) albo zgodę ich właścicieli;",
                "masz prawa do utworów (muzyki i tekstów) albo zgodę autorów — i podajesz, czy któryś z autorów należy do organizacji zbiorowego zarządzania (np. ZAiKS);",
                "sample i interpolacje są oczyszczone z praw (z opisem) albo ich nie ma;",
                "zgodnie z prawdą oznaczasz udział AI: utwór ludzki, wspomagany AI lub wygenerowany przez AI;",
                "okładki i zdjęcia możesz wykorzystać.",
              ],
            },
            "Za nieprawdziwe oświadczenia odpowiadasz wobec osób, których prawa naruszysz, i wobec operatora — w granicach przewidzianych prawem.",
          ],
        },
        {
          id: "moderacja",
          title: "4. Moderacja i publikacja",
          blocks: [
            "Każde wydawnictwo przed publikacją sprawdza moderator. Może je zatwierdzić albo zwrócić z wyjaśnieniem, co poprawić. Zgłoszenie do moderacji możesz wycofać, dopóki nie zostanie rozpatrzone.",
            "Pliki przyjmujemy wyłącznie w formatach bezstratnych (WAV, AIFF, FLAC, ALAC). Jakość pokazujemy słuchaczom zgodnie z tym, co naprawdę zostało wgrane — nie oznaczamy jako Hi-Res nagrań, które nim nie są.",
            "Koncerty dodawane przez artystów też przechodzą moderację. Dodawaj tylko prawdziwe wydarzenia.",
          ],
        },
        {
          id: "wycofanie",
          title: "5. Wycofanie muzyki",
          blocks: [
            "Możesz w każdej chwili poprosić o wycofanie opublikowanego wydawnictwa, pisząc na {email} z konta właściciela lub menedżera profilu. Wycofamy je w ciągu 7 dni; wtedy też wygasa licencja. Utwory znikną z playlist słuchaczy.",
            "Na tej samej zasadzie możesz poprosić o usunięcie całego profilu artysty — wycofujemy wtedy wszystkie jego wydawnictwa.",
          ],
        },
        {
          id: "zgloszenia",
          title: "6. Zgłoszenia i spory o prawa",
          blocks: [
            "Jeśli ktoś zgłosi naruszenie praw w Twoim wydawnictwie, moderator może je zdjąć. Dostaniesz uzasadnienie decyzji i możesz się odwołać w ciągu 6 miesięcy — odwołanie rozpatruje inny moderator. Szczegóły: Zasady treści i zgłoszeń.",
            "Przy powtarzających się, potwierdzonych naruszeniach praw autorskich możemy zawiesić profil artysty.",
          ],
        },
        {
          id: "pieniadze",
          title: "7. Wynagrodzenie",
          blocks: [
            "W becie serwis jest bezpłatny i nie ma przychodów, dlatego nie wypłacamy artystom wynagrodzenia. Udzielona licencja jest bezpłatna.",
            "Już teraz zapisujemy, ilu słuchaczy i ile odtworzeń (od 30 sekund, bez Soundchecków) ma każdy artysta w danym miesiącu — widzisz to na stronie zarządzania profilem. Docelowo, gdy pojawią się płatne plany, chcemy rozliczać się w modelu „user-centric” (opłata słuchacza trafia do artystów, których słucha). Zasady wypłat opiszemy w osobnym dokumencie, zanim zaczniemy pobierać opłaty — i poprosimy o Twoją zgodę.",
          ],
        },
        {
          id: "promocja",
          title: "8. Promocja",
          blocks: [
            "Możemy pokazywać Twoją muzykę, okładki i Soundcheck w serwisie (np. „Nowe z całej Polski”). Poza serwisem (np. w mediach społecznościowych Tunewick) użyjemy ich tylko za Twoją zgodą.",
          ],
        },
        {
          id: "zmiany",
          title: "9. Zmiany",
          blocks: [
            "O zmianach tego regulaminu poinformujemy co najmniej 14 dni wcześniej. Jeśli się nie zgadzasz, możesz wycofać swoją muzykę. Wersja, którą zaakceptowałeś lub zaakceptowałaś przy publikacji, jest zapisana przy oświadczeniu.",
          ],
        },
      ],
    },

    privacy: {
      title: "Polityka prywatności",
      lead: "Jakie dane zbiera Tunewick, po co, jak długo je trzymamy i jakie masz prawa. Bez reklam, bez sprzedawania danych, bez śledzenia poza serwisem.",
      sections: [
        {
          id: "administrator",
          title: "1. Administrator danych",
          blocks: [
            "Administratorem Twoich danych osobowych jest {operator}, {address}. W sprawach danych pisz na {email}.",
          ],
        },
        {
          id: "jakie-dane",
          title: "2. Jakie dane przetwarzamy",
          blocks: [
            {
              list: [
                "Konto: adres e-mail, hasło (przechowywane wyłącznie jako zabezpieczony skrót), data założenia i ostatniego logowania, potwierdzenie wieku 16+.",
                "Profil: nazwa profilu, nazwa wyświetlana, opis, język, ustawienie widoczności aktywności.",
                "Słuchanie: co, kiedy i jak długo odtwarzasz oraz w jakiej jakości. Historia jest prywatna — widzisz ją tylko Ty i możesz ją w każdej chwili wyczyścić.",
                "Miesięczne zestawienie słuchania: ilu odtworzeń każdego artysty posłuchałeś lub posłuchałaś w danym miesiącu (podstawa przyszłych rozliczeń z artystami).",
                "Biblioteka i społeczność: polubienia, obserwowani artyści i osoby, playlisty, blokady, koncerty oznaczone „Byłem przy tym”.",
                "Zgłoszenia i moderacja: zgłoszenia, które wysyłasz (przy naruszeniu praw autorskich także imię i nazwisko oraz e-mail zgłaszającego), decyzje dotyczące Twoich treści i odwołania.",
                "Premium: przyznane plany i użyte kody promocyjne, próby wpisania kodów.",
                "Artyści: dane profilu artysty (nazwa, miasto, województwo, członkowie, zdjęcia), wgrane pliki audio i grafiki, oświadczenia o prawach.",
                "Bezpieczeństwo: dla personelu — dane logowania dwuskładnikowego i dziennik działań (kto, co i kiedy zmienił).",
                "Odkrywanie: Twoje preferencje (kraj, opcjonalnie miasto, języki, gatunki, tryb Odkrywaj, strefa czasowa, udział niespodzianek), utwory zapisane z Odkrywaj, punkty odkryć, osiągnięcia oraz zdarzenia z feedu (wyświetlenie utworu, pominięcie, odsłuch fragmentu, udostępnienie) — powiązane z kontem, bez adresu IP i informacji o urządzeniu.",
              ],
            },
            "Diagnostyka odtwarzacza (czas do pierwszego dźwięku, błędy) jest zapisywana bez identyfikatora konta: tylko dzień, jakość, metoda odtwarzania i rodzina przeglądarki.",
            "Ze zdjęć i grafik usuwamy metadane (np. lokalizację GPS) — zapisujemy przekonwertowaną kopię.",
          ],
        },
        {
          id: "cele",
          title: "3. Po co i na jakiej podstawie",
          blocks: [
            {
              list: [
                "Świadczenie usługi — konto, odtwarzanie, biblioteka, rekomendacje oparte na Twoim słuchaniu, funkcje społecznościowe, Premium (art. 6 ust. 1 lit. b RODO — umowa).",
                "Bezpieczeństwo, zapobieganie nadużyciom (limity, blokady prób), diagnostyka działania serwisu i dziennik działań personelu (art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes).",
                "Obsługa zgłoszeń treści, uzasadnień decyzji i odwołań zgodnie z aktem o usługach cyfrowych (DSA) (art. 6 ust. 1 lit. c RODO — obowiązek prawny).",
                "Zestawienia słuchania dla artystów i przyszłe rozliczenia (art. 6 ust. 1 lit. b i f RODO).",
                "Rekomendacje w Odkrywaj, punkty, cele, serie, rekordy, osiągnięcia i rankingi odkryć — z Twojego słuchania i reakcji w serwisie (art. 6 ust. 1 lit. b RODO — umowa); zdarzenia z feedu także do ulepszania rekomendacji (art. 6 ust. 1 lit. f RODO).",
              ],
            },
            "Nie używamy Twoich danych do reklam, nie sprzedajemy ich i nie profilujemy Cię w celach marketingowych. Rekomendacje nie podejmują wobec Ciebie decyzji o skutkach prawnych.",
          ],
        },
        {
          id: "kto-widzi",
          title: "4. Kto widzi Twoje dane",
          blocks: [
            {
              list: [
                "Wszyscy: Twój profil publiczny (nazwa, opis, data dołączenia, liczba obserwujących) i publiczne playlisty.",
                "Wybrane osoby: oznaczone koncerty i publiczne playlisty na Twoim profilu — według ustawienia widoczności (domyślnie obserwujący). Osoby zablokowane nie widzą Twojej aktywności.",
                "Artyści: tylko łączne liczby słuchaczy i odtworzeń w miesiącu — nigdy, kto konkretnie słuchał.",
                "Personel (moderatorzy, administratorzy): tylko w zakresie potrzebnym do moderacji, pomocy i bezpieczeństwa, z obowiązkowym logowaniem dwuskładnikowym; ich działania trafiają do dziennika.",
                "Rankingi odkryć: nazwa profilu, nazwa wyświetlana, liczba punktów i odkryć w danym okresie — tylko jeśli masz nazwę profilu i nie wyłączysz udziału w rankingach w preferencjach odkrywania.",
                "Porównanie odkryć („Ty vs znajomy”): Twoje łączne liczby (utwory, artyści, kraje, czas słuchania, punkty) — tylko osobom, które widzą Twoją aktywność według ustawienia widoczności.",
              ],
            },
            "Dane przetwarzają w naszym imieniu dostawcy infrastruktury, z którymi mamy umowy powierzenia: Supabase (baza danych i logowanie, serwery we Frankfurcie), Vercel (hosting aplikacji), Cloudflare (przechowywanie plików muzycznych i grafik, jurysdykcja UE), Fly.io (przetwarzanie plików audio, region UE) oraz dostawca wysyłki e-maili. Część z nich to firmy z USA; jeśli dane trafiają poza Europejski Obszar Gospodarczy, podstawą są standardowe klauzule umowne Komisji Europejskiej lub program EU-US Data Privacy Framework.",
          ],
        },
        {
          id: "cookies",
          title: "5. Pliki cookie i pamięć przeglądarki",
          blocks: [
            "Używamy wyłącznie niezbędnych plików cookie: sesji logowania (sb-…-auth-token) i zapamiętanego języka (NEXT_LOCALE). W pamięci przeglądarki zapisujemy głośność odtwarzacza. Nie używamy cookie analitycznych ani reklamowych, dlatego nie pokazujemy banera zgód. Jeśli to się zmieni, najpierw zapytamy o zgodę.",
            "Jeśli bez konta wybierzesz, co chcesz odkrywać, zapisujemy ten wybór (kraj, gatunki, języki, tryb) w pliku cookie tw_discovery na Twoim urządzeniu na rok — tylko po to, by feed go pamiętał; nie trafia on do naszej bazy.",
          ],
        },
        {
          id: "jak-dlugo",
          title: "6. Jak długo przechowujemy dane",
          blocks: [
            {
              list: [
                "Konto, profil, biblioteka, playlisty — do usunięcia konta (albo wcześniejszego usunięcia przez Ciebie).",
                "Historia słuchania — 25 miesięcy (starsze miesiące usuwamy automatycznie), chyba że wyczyścisz ją wcześniej.",
                "Miesięczne zestawienia słuchania — dłużej, jako podstawa rozliczeń z artystami; po usunięciu konta zostają bez powiązania z Tobą.",
                "Próby wpisania kodów promocyjnych — 90 dni; diagnostyka odtwarzacza — 13 miesięcy; dziennik działań personelu — 2 lata.",
                "Zgłoszenia i decyzje moderacji — tak długo, jak to potrzebne do obsługi odwołań i obowiązków z DSA.",
                "Oświadczenia artystów o prawach — przez cały okres publikacji i po jej zakończeniu, jako dowód w ewentualnych sporach; po usunięciu konta bez powiązania z osobą.",
                "Zdarzenia z feedu Odkrywaj — 180 dni; punkty odkryć, osiągnięcia, zapisane utwory i preferencje — do usunięcia konta.",
              ],
            },
          ],
        },
        {
          id: "prawa",
          title: "7. Twoje prawa",
          blocks: [
            "Masz prawo do dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia oraz sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie. Większość z nich zrealizujesz sam lub sama:",
            {
              list: [
                "Ustawienia → „Twoje dane” → „Pobierz moje dane” — wszystkie dane konta w jednym pliku JSON (dostęp i przenoszenie);",
                "Ustawienia — zmiana profilu i widoczności aktywności (sprostowanie);",
                "Biblioteka — wyczyszczenie historii słuchania;",
                "Ustawienia → „Usuń konto” — natychmiastowe usunięcie konta (prawo do bycia zapomnianym).",
              ],
            },
            "W pozostałych sprawach napisz na {email} — odpowiemy w ciągu miesiąca. Masz też prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa, uodo.gov.pl).",
          ],
        },
        {
          id: "wiek",
          title: "8. Wiek",
          blocks: [
            "Serwis jest dla osób od 16 lat. Jeśli dowiemy się, że konto założyła osoba młodsza, usuniemy je.",
          ],
        },
        {
          id: "zmiany",
          title: "9. Zmiany polityki",
          blocks: [
            "O istotnych zmianach poinformujemy w serwisie lub e-mailem przed ich wejściem w życie.",
          ],
        },
      ],
    },

    contentPolicy: {
      title: "Zasady treści i zgłoszeń",
      lead: "Czego nie wolno publikować w Tunewick, jak zgłosić naruszenie i jak podejmujemy decyzje — zgodnie z aktem o usługach cyfrowych (DSA).",
      sections: [
        {
          id: "zakazane",
          title: "1. Czego nie publikujemy",
          blocks: [
            {
              list: [
                "muzyki, okładek i zdjęć, do których nie masz praw;",
                "treści niezgodnych z prawem, w tym nawołujących do przemocy lub nienawiści;",
                "nękania, gróźb, ujawniania cudzych danych;",
                "podszywania się pod artystów, zespoły lub inne osoby;",
                "spamu, oszustw, fikcyjnych koncertów i miejsc;",
                "sztucznego zawyżania odtworzeń i statystyk.",
              ],
            },
          ],
        },
        {
          id: "jak-zglosic",
          title: "2. Jak zgłosić naruszenie",
          blocks: [
            "Na stronie każdego artysty, wydawnictwa, playlisty, koncertu, miejsca i profilu jest link „Zgłoś naruszenie”. Zgłoszenie wymaga zalogowania; jeśli nie masz konta, napisz na {email}.",
            "W zgłoszeniu podaj powód i opis (co i dlaczego narusza prawo lub zasady). Przy naruszeniu praw autorskich podaj też imię i nazwisko lub nazwę uprawnionego, e-mail kontaktowy i oświadczenie, że zgłaszasz w dobrej wierze.",
            "Osoba, której treść zgłoszono, nie dowie się, kto ją zgłosił. Zobaczy decyzję i jej uzasadnienie.",
          ],
        },
        {
          id: "decyzje",
          title: "3. Jak decydujemy",
          blocks: [
            "Zgłoszenia rozpatruje moderator — człowiek, nie automat. Możliwe decyzje są proporcjonalne do naruszenia:",
            {
              list: [
                "oddalenie zgłoszenia;",
                "zdjęcie wydawnictwa;",
                "ukrycie playlisty (staje się prywatna);",
                "usunięcie koncertu ze Sceny;",
                "usunięcie adresu i strony internetowej miejsca;",
                "wyczyszczenie nazwy i opisu profilu;",
                "zawieszenie profilu artysty.",
              ],
            },
            "Każda decyzja, która ogranicza czyjeś treści, ma pisemne uzasadnienie (co postanowiliśmy i dlaczego) widoczne dla właściciela treści — na stronie zarządzania profilem artysty, przy playliście albo w Ustawieniach.",
          ],
        },
        {
          id: "odwolania",
          title: "4. Odwołania",
          blocks: [
            "Od decyzji możesz się odwołać raz, w ciągu 6 miesięcy, przyciskiem przy decyzji. Odwołanie rozpatruje inny moderator niż ten, który podjął decyzję. Jeśli odwołanie jest zasadne, przywracamy treść.",
            "Niezależnie od tego możesz dochodzić swoich praw przed sądem.",
          ],
        },
        {
          id: "recydywa",
          title: "5. Powtarzające się naruszenia",
          blocks: [
            "Przy powtarzających się, potwierdzonych naruszeniach praw autorskich możemy zawiesić profil artysty. Pod uwagę bierzemy tylko decyzje, które nie zostały uchylone po odwołaniu.",
          ],
        },
        {
          id: "kontakt",
          title: "6. Punkt kontaktowy",
          blocks: [
            "Punkt kontaktowy dla użytkowników oraz organów państw członkowskich UE i Komisji Europejskiej (art. 11–12 DSA): {email}. Piszemy po polsku i angielsku.",
          ],
        },
      ],
    },
  },
};
