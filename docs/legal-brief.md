# Brief dla prawnika — Tunewick

> Dokument po polsku, bo jest adresowany do polskiej kancelarii (wyjątek od zasady „docs po angielsku”).
> Kontekst techniczny i produktowy: [product.md](product.md), [licensing.md](licensing.md),
> [security.md](security.md), [promotions.md](promotions.md). Guidon: „Legal review”.
> Stan na 2026-10-05. To jest lista pytań, nie opinia prawna.

## 1. Czym jest Tunewick

- Serwis streamingowy i platforma odkrywania muzyki (tunewick.com), start: cała Polska — mali, niezależni artyści z dowolnego miasta (bez ograniczenia regionalnego).
- **Treści w MVP: wyłącznie muzyka wgrywana przez niezależnych artystów** (lub ich własne mikro-wytwórnie), którzy deklarują posiadanie praw. Brak katalogu dużych wytwórni.
- Przyjmujemy tylko pliki bezstratne (WAV/AIFF/FLAC/ALAC). Streaming bez możliwości pobierania, bez DRM.
- Funkcje społecznościowe: obserwowanie artystów i użytkowników, aktywność, oznaczanie obecności na koncertach („Byłem przy tym”), wydarzenia i miejsca.
- Model: konto darmowe (cały katalog w jakości stratnej) i Premium (bezstratna / Hi-Res). **W MVP brak płatności kartą** — Premium przyznawane kodami promocyjnymi i w ramach zamkniętej bety.
- Docelowo wypłaty dla artystów w modelu **user-centric** (abonament użytkownika trafia do artystów, których słucha).
- Start: **zamknięta beta** (ok. 30–50 zaproszonych artystów, 5–10 klubów), potem beta publiczna.
- Infrastruktura w UE (Supabase Frankfurt, Vercel, Cloudflare R2 — jurysdykcja UE, Fly.io, Sentry UE).

## 2. Pytania

### A. ZAiKS i organizacje zbiorowego zarządzania (najważniejsze)
1. Czy Tunewick potrzebuje licencji ZAiKS na publiczne udostępnianie utworów (pole eksploatacji: udostępnianie w sieci na żądanie), jeśli artysta sam wgrywa nagranie, a autor (kompozytor/autor tekstu) jest członkiem ZAiKS?
2. Jak wygląda sytuacja, gdy żaden z autorów nie jest członkiem żadnej OZZ — czy wystarczy licencja udzielona bezpośrednio przez artystę w regulaminie?
3. Czy powstają obowiązki wobec **STOART / SAWP** (artyści wykonawcy) i **ZPAV** (producenci fonogramów) przy streamingu na żądanie nagrań wgrywanych przez samych wykonawców/producentów?
4. Jaki jest typowy model kosztowy (procent przychodu, minimalne opłaty) dla małego serwisu na etapie bez przychodu (beta, brak płatności)?
5. Czy licencje OZZ są potrzebne już na **zamkniętą betę** (ograniczona liczba zaproszonych użytkowników), czy dopiero przy publicznym starcie?
6. Jak raportować wykorzystanie (formaty, częstotliwość) i jakie dane o utworach musimy zbierać od artystów (ISRC, ISWC, autorzy, członkostwo OZZ)?
7. Utwory autorów zagranicznych (członków np. GEMA, PRS) — czy ZAiKS obejmuje je umowami wzajemności?

### B. Prawa autorskie i pokrewne, model licencji od artystów
8. Jak skonstruować licencję od artysty (niewyłączna, terytorium, czas, pola eksploatacji: zwielokrotnianie, transkodowanie do różnych formatów, udostępnianie na żądanie, fragmenty 30 s „Soundcheck” w celach promocyjnych, wyświetlanie metadanych i okładek)?
9. Jak potraktować zespoły (wielu współtwórców / wykonawców) — kto może skutecznie udzielić licencji i zaakceptować regulamin?
10. Prawo do wycofania utworu przez artystę — termin skuteczności, skutki dla playlist użytkowników.
11. Sample, interpolacje, covery — jakie oświadczenia wymagać i czy covery w ogóle dopuszczać w MVP?
12. Muzyka generowana przez AI: czy i jak oznaczać (AI Act — obowiązki przejrzystości), jak traktować utwory bez ludzkiego autora w kontekście praw autorskich i OZZ?

### C. Odpowiedzialność za uploady artystów
13. Czy jako serwis hostingowy korzystamy z wyłączenia odpowiedzialności (DSA art. 6) przy treściach wgrywanych przez artystów, skoro moderujemy wydawnictwa przed publikacją?
14. Czy Tunewick może być uznany za „dostawcę usług udostępniania treści online” w rozumieniu art. 17 dyrektywy DSM (w Polsce: implementacja w ustawie o prawie autorskim) — i jakie wynikają z tego obowiązki (najlepsze starania o licencje, filtrowanie)?
15. Zakres oświadczeń i zapewnień artysty oraz klauzula zwolnienia z odpowiedzialności (indemnity) — co jest wykonalne wobec osób fizycznych (konsumentów?) w Polsce.
16. Polityka wobec recydywistów (repeat infringers).

### D. Regulaminy
17. Regulamin dla słuchaczy (świadczenie usług drogą elektroniczną, UŚUDE) — zakres, wymogi obowiązkowe.
18. Regulamin dla artystów (Artist Terms) — czy artysta jest konsumentem/przedsiębiorcą, wpływ na klauzule.
19. Zasady zamkniętej bety (testy, ograniczona odpowiedzialność, brak gwarancji dostępności).

### E. Zgłoszenia prawne i usuwanie treści (DSA)
20. Wymogi procedury notice-and-action: formularz, potwierdzenia, terminy, uzasadnienie decyzji (statement of reasons), odwołania.
21. Obowiązki sprawozdawcze i punkt kontaktowy — co dotyczy nas jako małego dostawcy (mikro/małe przedsiębiorstwo)?
22. Jak długo przechowywać dane zgłaszających i dokumentację sporów?

### F. RODO i dane
23. Podstawy prawne: historia słuchania, rekomendacje (personalizacja), oznaczanie obecności na wydarzeniach, analityka — umowa vs zgoda vs uzasadniony interes.
24. Okresy retencji (propozycja: surowe zdarzenia słuchania 25 miesięcy, zagregowane dane do rozliczeń dłużej, analityka 13 miesięcy, audyt ≥ 2 lata) — czy są uzasadnione?
25. Wiek: w Polsce zgoda na usługi społeczeństwa informacyjnego od 16 lat — czy wystarczy oświadczenie użytkownika przy rejestracji (nie przechowujemy daty urodzenia)? Czy funkcje społecznościowe wymagają dodatkowych ograniczeń dla nieletnich?
26. Czy potrzebny jest Inspektor Ochrony Danych?
27. Umowy powierzenia z dostawcami (Supabase, Vercel, Cloudflare, Fly.io, Sentry, dostawca e-mail) — co sprawdzić, transfery poza EOG.
28. Baner cookies: tylko niezbędne domyślnie, równorzędny przycisk „odrzuć” — czy to wystarcza (Prawo komunikacji elektronicznej)?

### G. Kody promocyjne i przyszłe płatności
29. Kody na bezpłatne Premium (dni/miesiące/dożywotnio) — wymogi informacyjne, prawo odstąpienia, czy „Premium dożywotnio” wymaga szczególnych zastrzeżeń (np. na wypadek zamknięcia serwisu)?
30. Przyszłe subskrypcje: prawo konsumenckie, łatwa rezygnacja, dyrektywa Omnibus przy ogłaszaniu rabatów, VAT OSS.

## 3. Czego oczekujemy

1. Pisemne odpowiedzi na pytania A–G, z rozróżnieniem: **wymagane przed zamkniętą betą** vs **przed publiczną betą** vs **później**.
2. Projekty lub recenzja: Regulamin serwisu, Regulamin dla artystów, Polityka prywatności, Polityka cookies, Procedura zgłoszeń i usuwania treści.
3. Lista danych i oświadczeń, które formularz uploadu musi zbierać od artysty.
