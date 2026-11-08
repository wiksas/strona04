# Podsieci

Strona do nauki i sprawdzania się z zadań z podziału sieci IPv4. Działa w całości w przeglądarce, bez serwera i bez instalacji.

## Uruchomienie

Otwórz `index.html` w przeglądarce albo uruchom dowolny serwer statyczny w tym katalogu, na przykład `python -m http.server 8765`.

## Co jest w środku

| Widok | Zawartość |
|---|---|
| Ćwiczenia | 13 typów zadań, losowane od nowa, sprawdzane od razu, z rozwiązaniem krok po kroku. Statystyki per typ zapisują się w `localStorage`. |
| Test | Arkusz 1 (9 zadań) i arkusz 2 (4 zadania), każdy w wersji dosłownej z arkusza albo losowej z tymi samymi typami zadań. Wynik, czas i rozwiązania po zakończeniu. |
| Teoria | Systemy liczbowe, maska i prefiks (suwak), klasy i adresy prywatne, adres sieci, VLSM, FLSM, suma hostów, tablica prefiksów. |
| Kalkulator | Adres z prefiksem lub maską: adres sieci, rozgłoszeniowy, zakres hostów, klasa, rodzaj adresu. |

Typy zadań: dziesiętny na dwójkowy, dwójkowy na dziesiętny, liczba hostów w sieci, klasa adresu i adresy prywatne, adres sieci i rozgłoszeniowy, VLSM, FLSM na równe podsieci, FLSM pod liczbę hostów, podział pod sumę hostów (arkusz 1) oraz klasa i adres sieci z maską, FLSM z pełnymi danymi podsieci, podsieci o zadanej liczbie adresów, VLSM z pełnymi danymi podsieci (arkusz 2).

Odpowiedzi w podziałach są sprawdzane regułami, nie porównaniem z jednym wzorcem: kolejność podsieci w FLSM jest dowolna, a w zadaniu na sumę hostów przechodzi każdy podział spełniający warunki.

## Struktura

```
index.html        szkielet i nawigacja
css/styles.css    style, motywy jasny i ciemny
js/net.js         arytmetyka IPv4 (bez DOM)
js/tasks.js       generatory, sprawdzanie i rozwiązania zadań (bez DOM)
js/store.js       zapis wyników i motywu w localStorage
js/ui.js          budowanie DOM, formularze zadań, paski bitów
js/app.js         router (#/cwicz, #/test, #/teoria, #/kalkulator) i widoki
tests/            testy jednostkowe (node:test)
fonts/            Atkinson Hyperlegible Next i Mono (SIL OFL), woff2
DESIGN.md         kierunek wizualny i powody decyzji
```

## Testy

```
npm test
```

Wymaga Node 20 lub nowszego. Testy sprawdzają arytmetykę sieci, odpowiedzi do zadań z obu arkuszy oraz 300 losowych zadań na każdy typ (zadanie się buduje, pusta odpowiedź daje 0, poprawna odpowiedź daje komplet punktów).
