(function () {
  'use strict';

  const { Net, Tasks, Store, UI } = globalThis;
  const { h, rich, bitRows, weightsStrip, table, solutionBlocks, taskForm, confirmDialog, announce } = UI;
  const fmt = Tasks.fmt;

  const state = {
    test: null, // in-progress test: { kind, items, answers, startedAt }
    result: null, // last finished test
  };
  const sessionCounts = {};
  let firstRender = true;

  // ---------- shared helpers ----------

  const pct = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

  function mmss(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function link(href, label, cls, extra) {
    return h('a', Object.assign({ href, class: cls || null }, extra || {}), label);
  }

  function storageNotice() {
    if (Store.status === 'unavailable') {
      return h('p', { class: 'notice', role: 'status' }, 'Ta przeglądarka blokuje zapis danych. Możesz ćwiczyć dalej, ale wyniki znikną po zamknięciu karty.');
    }
    if (Store.status === 'reset') {
      const box = h('div', { class: 'notice', role: 'status' });
      box.append(
        h('p', null, 'Zapisane wyniki były uszkodzone, więc zostały wyzerowane.'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { Store.acknowledge(); box.remove(); } }, 'Rozumiem')
      );
      return box;
    }
    return document.createDocumentFragment();
  }

  function mount({ title, node, scrollTo }) {
    const root = document.getElementById('main-content');
    root.replaceChildren(node);
    document.title = title + ' | Podsieci';
    updateNav();
    const target = scrollTo && document.getElementById(scrollTo);
    if (target) {
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, 0);
      const heading = root.querySelector('h1');
      if (!firstRender && heading) heading.focus({ preventScroll: true });
    }
    firstRender = false;
  }

  function updateNav() {
    const section = location.hash.split('/')[1] || 'cwicz';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  // ---------- practice: list ----------

  function practiceListView() {
    const totals = Store.totals();
    const node = h('div', { class: 'view' });
    node.append(
      h('h1', { tabindex: '-1' }, 'Ćwiczenia'),
      h('p', { class: 'lede' }, 'Wybierz typ zadania. Liczby i adresy są losowane za każdym razem, a po sprawdzeniu dostajesz pełne rozwiązanie krok po kroku.'),
      storageNotice()
    );

    if (totals.tasks === 0) {
      node.append(
        h('div', { class: 'empty' },
          h('p', null, h('strong', null, 'Nie masz jeszcze wyników.')),
          h('p', null, 'Wybierz dowolny typ zadania poniżej albo rozwiąż test z jednego z arkuszy. Wyniki zapisują się w tej przeglądarce.'))
      );
    } else {
      node.append(
        h('div', { class: 'progress' },
          h('p', { class: 'progress-main' }, h('span', { class: 'progress-number mono' }, String(totals.tasks)), ' ' + (totals.tasks === 1 ? 'sprawdzone zadanie' : 'sprawdzonych zadań')),
          h('p', { class: 'progress-detail' }, 'Poprawne odpowiedzi: ' + totals.correct + ' z ' + totals.total + ' (' + pct(totals.correct, totals.total) + '%). Liczą się ćwiczenia i testy.'))
      );
    }

    node.append(
      h('ul', { class: 'topics' },
        Tasks.TYPES.map((type) => {
          const s = Store.typeStats(type.id);
          const stat = s
            ? 'Sprawdzono: ' + s.tasks + '. Poprawne odpowiedzi: ' + s.correct + ' z ' + s.total + ' (' + pct(s.correct, s.total) + '%).'
            : 'Jeszcze nie rozwiązywano.';
          return h('li', { class: 'topic' },
            h('div', { class: 'topic-text' }, h('h2', null, type.name), h('p', { class: 'muted' }, type.summary), h('p', { class: 'topic-stat' }, stat)),
            link('#/cwicz/' + type.id, 'Ćwicz', 'btn', { 'aria-label': 'Ćwicz: ' + type.name }));
        }))
    );

    if (totals.tasks > 0) {
      node.append(
        h('div', { class: 'actions' },
          h('button', {
            type: 'button', class: 'btn btn-quiet',
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Wyzerować wyniki?',
                body: 'Skasujemy statystyki ćwiczeń i historię testów zapisane w tej przeglądarce. Tego nie da się cofnąć.',
                confirmLabel: 'Wyzeruj wyniki', cancelLabel: 'Zostaw wyniki',
              });
              if (ok) {
                Store.clear();
                route();
              }
            },
          }, 'Wyzeruj wyniki'))
      );
    }
    return { title: 'Ćwiczenia', node };
  }

  // ---------- practice: one task at a time ----------

  function practiceRunnerView(typeId) {
    const type = Tasks.BY_ID[typeId];
    if (!type) return notFoundView();
    const heading = h('h1', { tabindex: '-1' }, type.name);
    const meta = h('p', { class: 'meta' });
    const host = h('div', { class: 'task-host' });
    const node = h('div', { class: 'view' }, h('p', { class: 'crumb' }, link('#/cwicz', 'Wszystkie typy zadań')), heading, meta, host);

    function load(task, fromSheet) {
      sessionCounts[typeId] = (sessionCounts[typeId] || 0) + 1;
      meta.textContent = fromSheet ? 'Zadanie z arkusza: ' + task.label : 'Zadanie losowe, nr ' + sessionCounts[typeId] + ' w tej sesji';
      let checked = false;
      const form = taskForm(task, { onSubmit: check });
      const outcome = h('section', { class: 'outcome', hidden: true, 'aria-labelledby': 'outcome-title' });
      const actions = h('div', { class: 'actions' },
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Sprawdź odpowiedzi'),
        h('button', { type: 'button', class: 'btn', onclick: () => load(Tasks.generate(typeId), false) }, 'Wylosuj inne zadanie'),
        h('button', { type: 'button', class: 'btn', onclick: () => load(Tasks.fixedTask(typeId), true) }, 'Wczytaj zadanie z arkusza'));
      form.el.appendChild(actions);

      function check() {
        if (checked) return;
        checked = true;
        const result = Tasks.check(task, form.getAnswers());
        form.reveal(result);
        Store.recordTask(typeId, result.correct, result.total);
        actions.hidden = true;
        const summary = 'Poprawne odpowiedzi: ' + result.correct + ' z ' + result.total + '.';
        const title = h('h2', { id: 'outcome-title', tabindex: '-1' }, summary);
        outcome.hidden = false;
        outcome.classList.add(result.correct === result.total ? 'is-ok' : 'is-bad');
        outcome.replaceChildren(
          title,
          h('p', { class: 'muted' }, result.correct === result.total ? 'Wszystko się zgadza. Rozwiązanie poniżej pokazuje drogę, którą warto porównać z własną.' : 'Poniżej pełne rozwiązanie. Zaznaczone pola pokazują, gdzie odpowiedź się rozjechała.'),
          h('h3', null, 'Rozwiązanie'),
          solutionBlocks(Tasks.solve(task)),
          h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => load(Tasks.generate(typeId), false) }, 'Następne zadanie losowe'),
            h('button', { type: 'button', class: 'btn', onclick: () => load(Tasks.fixedTask(typeId), true) }, 'Wczytaj zadanie z arkusza')));
        announce(summary);
        title.focus();
      }

      host.replaceChildren(form.el, outcome);
      const first = form.el.querySelector('input');
      if (first && !firstRender) first.focus({ preventScroll: true });
    }

    load(Tasks.generate(typeId), false);
    return { title: type.name, node };
  }

  // ---------- test ----------

  function startTest(kind) {
    const begin = () => {
      state.test = { kind, items: Tasks.testSet(kind), answers: [], startedAt: Date.now() };
      location.hash = '#/test/rozwiazuj';
    };
    if (!state.test) return begin();
    confirmDialog({
      title: 'Porzucić niedokończony test?',
      body: 'Masz rozpoczęty test. Jeśli zaczniesz nowy, odpowiedzi z tamtego przepadną.',
      confirmLabel: 'Zacznij nowy test', cancelLabel: 'Wróć do starego',
    }).then((ok) => ok && begin());
  }

  const KIND_NAME = {
    fixed: 'arkusz 1, zadania z arkusza',
    random: 'arkusz 1, losowe',
    fixed2: 'arkusz 2, zadania z arkusza',
    random2: 'arkusz 2, losowe',
  };

  function testHomeView() {
    const node = h('div', { class: 'view' });
    node.append(
      h('h1', { tabindex: '-1' }, 'Test'),
      h('p', { class: 'lede' }, 'Każdy arkusz to jedno podejście. Poprawność zobaczysz dopiero po zakończeniu, razem z rozwiązaniami każdego zadania. Wersja losowa ma te same typy zadań, ale nowe liczby i adresy.'),
      storageNotice()
    );

    if (state.test) {
      const done = state.test.answers.filter((a) => a && Object.values(a).some((v) => (Array.isArray(v) ? v.some((x) => x.trim()) : String(v).trim()))).length;
      node.append(
        h('div', { class: 'notice', role: 'status' },
          h('p', null, 'Masz rozpoczęty test (' + KIND_NAME[state.test.kind] + '), wypełnione zadania: ' + done + ' z ' + state.test.items.length + '.'),
          h('div', { class: 'actions' },
            link('#/test/rozwiazuj', 'Wróć do testu', 'btn btn-primary'),
            h('button', { type: 'button', class: 'btn', onclick: () => { state.test = null; route(); } }, 'Porzuć test')))
      );
    }

    node.append(
      h('ul', { class: 'topics' },
        h('li', { class: 'topic' },
          h('div', { class: 'topic-text' }, h('h2', null, 'Arkusz 1'), h('p', { class: 'muted' }, 'Dziewięć zadań: systemy liczbowe, maski, klasy, adres sieci, VLSM, FLSM i suma hostów.')),
          h('div', { class: 'topic-actions' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startTest('fixed') }, 'Zadania z arkusza 1'),
            h('button', { type: 'button', class: 'btn', onclick: () => startTest('random') }, 'Losowe, arkusz 1'))),
        h('li', { class: 'topic' },
          h('div', { class: 'topic-text' }, h('h2', null, 'Arkusz 2'), h('p', { class: 'muted' }, 'Cztery zadania z pełnymi danymi podsieci: klasa i adres sieci, FLSM, podsieci o zadanej liczbie adresów i VLSM.')),
          h('div', { class: 'topic-actions' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startTest('fixed2') }, 'Zadania z arkusza 2'),
            h('button', { type: 'button', class: 'btn', onclick: () => startTest('random2') }, 'Losowe, arkusz 2'))))
    );

    const tests = Store.tests();
    node.append(h('h2', { class: 'section-title' }, 'Poprzednie testy'));
    if (tests.length === 0) {
      node.append(h('div', { class: 'empty' }, h('p', null, 'Nie rozwiązano jeszcze żadnego testu. Wynik pojawi się tutaj po pierwszym zakończonym teście.')));
    } else {
      node.append(
        h('ul', { class: 'history' },
          tests.map((t) =>
            h('li', null,
              h('span', null, new Date(t.at).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })),
              h('span', null, KIND_NAME[t.mode] || t.mode),
              h('span', { class: 'mono' }, t.correct + ' z ' + t.total + ' (' + pct(t.correct, t.total) + '%)'),
              h('span', { class: 'mono' }, mmss(t.seconds)))))
      );
    }
    return { title: 'Test', node };
  }

  function testRunView() {
    const t = state.test;
    if (!t) {
      location.hash = '#/test';
      return null;
    }
    const total = t.items.length;
    const progress = h('p', { class: 'progress-line', 'aria-live': 'off' });
    const forms = [];
    const updateProgress = () => {
      const filled = forms.filter((f) => f.hasAnyAnswer()).length;
      progress.textContent = 'Wypełnione zadania: ' + filled + ' z ' + total;
    };

    const sections = t.items.map((task, i) => {
      const form = taskForm(task, {
        answers: t.answers[i],
        onInput: () => {
          t.answers[i] = form.getAnswers();
          updateProgress();
        },
      });
      forms.push(form);
      return h('section', { class: 'test-task', 'aria-labelledby': 'task-' + i },
        h('h2', { id: 'task-' + i }, task.label, h('span', { class: 'task-type' }, task.name)),
        form.el);
    });

    async function finish() {
      const blank = t.items.map((task, i) => (forms[i].hasAnyAnswer() ? null : task.label)).filter(Boolean);
      if (blank.length > 0) {
        const ok = await confirmDialog({
          title: 'Zakończyć test?',
          body: 'Bez odpowiedzi zostały: ' + blank.join(', ') + '. Za te zadania dostaniesz 0 punktów.',
          confirmLabel: 'Zakończ i sprawdź', cancelLabel: 'Wróć do testu',
        });
        if (!ok) return;
      }
      const answers = forms.map((f) => f.getAnswers());
      const results = t.items.map((task, i) => Tasks.check(task, answers[i]));
      const correct = results.reduce((s, r) => s + r.correct, 0);
      const max = results.reduce((s, r) => s + r.total, 0);
      const seconds = Math.round((Date.now() - t.startedAt) / 1000);
      results.forEach((r, i) => Store.recordTask(t.items[i].type, r.correct, r.total));
      Store.recordTest({ at: new Date().toISOString(), mode: t.kind, correct, total: max, seconds });
      state.result = { kind: t.kind, items: t.items, answers, results, correct, total: max, seconds };
      state.test = null;
      location.hash = '#/test/wynik';
    }

    const bar = h('div', { class: 'sticky-bar' }, progress, h('button', { type: 'button', class: 'btn btn-primary', onclick: finish }, 'Zakończ test'));
    const node = h('div', { class: 'view' },
      h('p', { class: 'crumb' }, link('#/test', 'Wróć do listy testów')),
      h('h1', { tabindex: '-1' }, 'Test: ' + KIND_NAME[t.kind]),
      h('p', { class: 'lede' }, 'Odpowiedzi możesz zmieniać do chwili zakończenia. Rozwiązania zobaczysz dopiero w wynikach.'),
      bar,
      sections);
    updateProgress();
    return { title: 'Test: ' + KIND_NAME[t.kind], node };
  }

  function testResultView() {
    const r = state.result;
    if (!r) {
      location.hash = '#/test';
      return null;
    }
    const perfect = r.results.filter((x) => x.correct === x.total).length;
    const weak = Tasks.TYPES.filter((type) => r.items.some((task, i) => task.type === type.id && r.results[i].correct < r.results[i].total));

    const node = h('div', { class: 'view' });
    node.append(
      h('h1', { tabindex: '-1' }, 'Wynik testu'),
      h('div', { class: 'score' },
        h('p', { class: 'score-main' }, h('span', { class: 'mono score-number' }, r.correct + ' z ' + r.total), ' poprawnych odpowiedzi (' + pct(r.correct, r.total) + '%)'),
        h('p', { class: 'muted' }, 'W całości poprawnie: ' + perfect + ' z ' + r.items.length + ' zadań. Czas: ' + mmss(r.seconds) + '. Zestaw: ' + KIND_NAME[r.kind] + '.')),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => startTest(r.kind) }, r.kind.startsWith('fixed') ? 'Powtórz ten test' : 'Rozpocznij nowy test losowy'),
        link('#/test', 'Wróć do listy testów', 'btn'))
    );

    if (weak.length > 0) {
      node.append(
        h('h2', { class: 'section-title' }, 'Do powtórzenia'),
        h('ul', { class: 'weak' }, weak.map((type) => h('li', null, link('#/cwicz/' + type.id, type.name))))
      );
    }

    node.append(h('h2', { class: 'section-title' }, 'Zadania'), h('p', { class: 'muted' }, 'Zadania z błędami są rozwinięte.'));
    r.items.forEach((task, i) => {
      const res = r.results[i];
      const ok = res.correct === res.total;
      const form = taskForm(task, { answers: r.answers[i] });
      form.reveal(res);
      node.append(
        h('details', { class: 'review ' + (ok ? 'is-ok' : 'is-bad'), open: !ok },
          h('summary', null,
            h('span', { class: 'review-title' }, task.label + '. ' + task.name),
            h('span', { class: 'review-score mono' }, res.correct + ' z ' + res.total + (ok ? ', poprawnie' : ', do poprawy'))),
          form.el,
          h('div', { class: 'solution' }, h('h3', null, 'Rozwiązanie'), solutionBlocks(Tasks.solve(task))))
      );
    });
    return { title: 'Wynik testu', node };
  }

  // ---------- theory ----------

  const THEORY = [
    ['liczby', 'Systemy liczbowe'],
    ['maska', 'Maska i prefiks'],
    ['klasy', 'Klasy adresów i adresy prywatne'],
    ['adres', 'Adres sieci i rozgłoszeniowy'],
    ['vlsm', 'VLSM'],
    ['flsm', 'FLSM'],
    ['suma', 'Suma hostów w podsieciach'],
    ['tablica', 'Tablica prefiksów'],
  ];

  function prefixExplorer() {
    const input = h('input', { type: 'range', id: 'prefix-range', min: '0', max: '32', value: '24', 'aria-describedby': 'prefix-facts' });
    const value = h('output', { for: 'prefix-range', class: 'mono range-value' });
    const strip = h('div', { class: 'explorer-strip' });
    const facts = h('dl', { class: 'facts', id: 'prefix-facts' });
    function update() {
      const p = Number(input.value);
      value.textContent = '/' + p;
      strip.replaceChildren(bitRows({ prefix: p, rows: [{ label: 'Maska', ip: Net.maskInt(p) }] }));
      const rows = [
        ['Maska dziesiętnie', Net.formatIp(Net.maskInt(p))],
        ['Bity sieci / hosta', p + ' / ' + (32 - p)],
        ['Adresów w sieci', fmt(Net.blockSize(p))],
        ['Użyteczne hosty', fmt(Net.usableHosts(p))],
      ];
      facts.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', { class: 'mono' }, v)]));
    }
    input.addEventListener('input', update);
    update();
    return h('div', { class: 'explorer' },
      h('div', { class: 'explorer-control' }, h('label', { for: 'prefix-range' }, 'Długość prefiksu'), value, input),
      strip, facts);
  }

  function theoryView(scrollTo) {
    const classRows = ['A', 'B', 'C'].map((c) => {
      const i = Net.CLASS_INFO[c];
      return [c, i.first + ' do ' + i.last, i.leadBits + '...', '/' + i.prefix, fmt(i.networks) + (c === 'A' ? ' (126 użytecznych)' : ''), fmt(i.hosts)];
    });
    classRows.push(['D', '224 do 239', '1110...', 'brak', 'multicast', 'brak']);
    classRows.push(['E', '240 do 255', '1111...', 'brak', 'zarezerwowane', 'brak']);

    const prefixRows = [];
    for (let p = 8; p <= 30; p++) {
      prefixRows.push(['/' + p, Net.formatIp(Net.maskInt(p)), fmt(Net.blockSize(p)), fmt(Net.usableHosts(p))]);
    }

    const section = (id, title, ...content) => h('section', { class: 'theory-section', 'aria-labelledby': 't-' + id }, h('h2', { id: 't-' + id, tabindex: '-1' }, title), content);
    const steps = (items) => h('ol', { class: 'steps' }, items.map((s) => h('li', null, rich(s))));

    const node = h('div', { class: 'view theory' },
      h('h1', { tabindex: '-1' }, 'Teoria i ściągawka'),
      h('p', { class: 'lede' }, 'Wszystko, czego potrzeba do zadań w tej aplikacji, w kolejności od liczb do podziału sieci.'),
      h('nav', { class: 'toc', 'aria-label': 'Spis działów' }, h('ul', null, THEORY.map(([id, title]) => h('li', null, link('#/teoria/' + id, title))))),
      section('liczby', 'Systemy liczbowe',
        h('p', null, 'Adres IPv4 to 32 bity podzielone na cztery oktety po 8 bitów. Każda pozycja w oktecie ma wagę równą potędze dwójki:'),
        weightsStrip('11111111'),
        h('p', null, 'Największy oktet to 11111111, czyli 128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = 255.'),
        steps([
          '**Dziesiętny na dwójkowy:** dziel liczbę przez 2, zapisuj reszty i odczytaj je od dołu do góry. Drugi sposób: od największej wagi ustawiaj 1 wszędzie tam, gdzie waga mieści się w pozostałej liczbie, i odejmuj ją.',
          '**Dwójkowy na dziesiętny:** dodaj wagi tych pozycji, na których stoi jedynka.',
        ])),
      section('maska', 'Maska i prefiks',
        h('p', null, rich('Prefiks `/n` mówi, że pierwsze n bitów adresu to bity sieci, a pozostałe 32 - n to bity hosta. Maska to te same n jedynek zapisane jako cztery liczby dziesiętne. Przesuń suwak i obserwuj granicę między bitami sieci (wypełnione) i hosta (puste).')),
        prefixExplorer(),
        h('p', null, rich('Adresów w sieci jest 2^{32-n}. Użytecznych hostów jest 2^{32-n} - 2, bo pierwszy adres to adres sieci (same zera w części hosta), a ostatni to adres rozgłoszeniowy (same jedynki).')),
        h('p', null, rich('Gdy z części hosta pożyczysz k bitów, dostajesz 2^{k} podsieci.'))),
      section('klasy', 'Klasy adresów i adresy prywatne',
        h('p', null, 'Klasę wyznaczają początkowe bity pierwszego oktetu. W praktyce używa się dziś CIDR, czyli prefiksu dowolnej długości, ale klasy nadal pojawiają się w zadaniach.'),
        table({ head: ['Klasa', 'Pierwszy oktet', 'Początek bitów', 'Maska domyślna', 'Liczba sieci', 'Hosty w sieci'], rows: classRows }),
        h('p', null, rich('W klasie A adresy sieci 0 i 127 są zarezerwowane (`127.0.0.0/8` to pętla zwrotna), stąd 126 użytecznych sieci zamiast 128.')),
        h('p', null, 'Adresy prywatne (RFC 1918) nie są routowane w Internecie i służą do sieci lokalnych:'),
        h('ul', null, h('li', null, rich('`10.0.0.0/8`, czyli 10.0.0.0 do 10.255.255.255')), h('li', null, rich('`172.16.0.0/12`, czyli 172.16.0.0 do 172.31.255.255')), h('li', null, rich('`192.168.0.0/16`, czyli 192.168.0.0 do 192.168.255.255'))),
        h('p', null, rich('Każdy inny adres klas A, B i C, poza `127.0.0.0/8` i `169.254.0.0/16` (adresy link-local), jest publiczny i ma właściciela w Internecie.'))),
      section('adres', 'Adres sieci i rozgłoszeniowy',
        steps([
          'Zapisz maskę z prefiksu: n jedynek, potem same zera.',
          '**Adres sieci:** wyzeruj bity hosta (adres AND maska).',
          '**Adres rozgłoszeniowy:** ustaw wszystkie bity hosta na 1.',
          '**Hosty:** od adresu sieci + 1 do adresu rozgłoszeniowego - 1.',
          'Skrót dla oktetu z granicą prefiksu: rozmiar bloku to 256 - wartość maski w tym oktecie. Adres sieci to największa wielokrotność rozmiaru bloku, która nie przekracza wartości oktetu.',
        ])),
      section('vlsm', 'VLSM',
        steps([
          'Posortuj wymagania od największego do najmniejszego.',
          'Dla każdego znajdź najmniejsze n, przy którym 2^{n} - 2 jest nie mniejsze niż liczba hostów. Prefiks to 32 - n.',
          'Pierwszą podsieć zacznij od adresu sieci nadrzędnej, każdą kolejną od pierwszego wolnego adresu (koniec poprzedniej + 1).',
          'Sprawdź, czy ostatnia podsieć kończy się w granicach sieci nadrzędnej.',
        ]),
        h('p', null, 'Kolejność od największego sprawia, że każdy blok trafia na granicę swojego rozmiaru, więc nie powstają dziury wynikające z wyrównania.')),
      section('flsm', 'FLSM',
        steps([
          'Ustal liczbę podsieci i znajdź najmniejsze k, dla którego 2^{k} jest co najmniej tak duże.',
          'Nowy prefiks to prefiks sieci + k.',
          'Kolejne podsieci zaczynają się co 2^{32 - nowy prefiks} adresów.',
          'Gdy zadanie podaje liczbę hostów w podsieci, prefiks wynika z hostów: najmniejsze n, przy którym 2^{n} - 2 jest nie mniejsze niż liczba hostów.',
        ])),
      section('suma', 'Suma hostów w podsieciach',
        h('p', null, rich('Każda podsieć traci dwa adresy. Gdy sieć o N adresach dzielisz w całości na k podsieci, użytecznych hostów jest N - 2k. Z równania N - 2k = szukana suma wyznacz k, a potem rozbij N na k potęg dwójki, na przykład dzieląc największy blok na pół, aż będzie ich k.'))),
      section('tablica', 'Tablica prefiksów',
        table({ head: ['Prefiks', 'Maska', 'Adresów w sieci', 'Użyteczne hosty'], rows: prefixRows }))
    );
    return { title: 'Teoria', node, scrollTo: scrollTo ? 't-' + scrollTo : null };
  }

  // ---------- calculator ----------

  const SCOPE_NAME = {
    public: 'publiczny',
    private: 'prywatny (RFC 1918)',
    loopback: 'pętla zwrotna (loopback)',
    linklocal: 'link-local (APIPA)',
    multicast: 'multicast',
    reserved: 'zarezerwowany',
  };

  function parseCalculatorInput(text) {
    const t = text.trim();
    if (t === '') return { empty: true };
    if (t.includes('/')) {
      const [ipPart, prefixPart] = t.split('/').map((s) => s.trim());
      if (Net.parseIp(ipPart) === null) return { error: 'Adres IP musi mieć cztery liczby od 0 do 255 oddzielone kropkami.' };
      if (!/^\d{1,2}$/.test(prefixPart) || Number(prefixPart) > 32) return { error: 'Prefiks to liczba całkowita od 0 do 32.' };
      return { ip: Net.parseIp(ipPart), prefix: Number(prefixPart) };
    }
    const parts = t.split(/\s+/);
    if (parts.length === 2) {
      const ip = Net.parseIp(parts[0]);
      if (ip === null) return { error: 'Adres IP musi mieć cztery liczby od 0 do 255 oddzielone kropkami.' };
      if (Net.parseIp(parts[1]) === null) return { error: 'Maska musi mieć cztery liczby od 0 do 255 oddzielone kropkami.' };
      const prefix = Net.prefixFromMask(parts[1]);
      if (prefix === null) return { error: 'Maska musi składać się z jedynek, po których są same zera.' };
      return { ip, prefix };
    }
    return { error: 'Wpisz adres z prefiksem (adres/prefiks) albo z maską (adres maska).' };
  }

  function calculatorView() {
    const input = h('input', {
      type: 'text', id: 'calc-input', class: 'mono', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      'aria-describedby': 'calc-hint calc-output',
    });
    const output = h('div', { id: 'calc-output', 'aria-live': 'polite' });

    function update() {
      const parsed = parseCalculatorInput(input.value);
      if (parsed.empty) {
        output.replaceChildren(h('div', { class: 'empty' }, h('p', null, 'Wpisz adres z prefiksem lub maską, a zobaczysz adres sieci, adres rozgłoszeniowy i zakres hostów.')));
        return;
      }
      if (parsed.error) {
        output.replaceChildren(h('p', { class: 'calc-error' }, 'Błąd. ' + parsed.error));
        return;
      }
      const d = Net.describe(parsed.ip, parsed.prefix);
      const rows = [
        ['Adres', Net.formatIp(d.ip) + '/' + d.prefix],
        ['Maska', Net.formatIp(d.mask)],
        ['Adres sieci', Net.formatIp(d.network)],
        ['Adres rozgłoszeniowy', Net.formatIp(d.broadcast)],
        ['Pierwszy host', d.first === null ? 'brak' : Net.formatIp(d.first)],
        ['Ostatni host', d.last === null ? 'brak' : Net.formatIp(d.last)],
        ['Użyteczne hosty', fmt(d.hosts)],
        ['Klasa', Net.classOf(d.ip)],
        ['Rodzaj adresu', SCOPE_NAME[Net.scopeOf(d.ip)]],
      ];
      output.replaceChildren(
        h('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', { class: 'mono' }, v)])),
        bitRows({ prefix: d.prefix, rows: [{ label: 'Adres', ip: d.ip }, { label: 'Maska', ip: d.mask }, { label: 'Sieć', ip: d.network }, { label: 'Rozgłoszeniowy', ip: d.broadcast }] })
      );
    }
    input.addEventListener('input', update);
    update();

    const node = h('div', { class: 'view' },
      h('h1', { tabindex: '-1' }, 'Kalkulator podsieci'),
      h('p', { class: 'lede' }, 'Narzędzie do sprawdzania własnych obliczeń. W teście policz sam, a tutaj porównaj wynik.'),
      h('form', { class: 'calc-form', onsubmit: (e) => e.preventDefault() },
        h('div', { class: 'field' },
          h('label', { for: 'calc-input' }, 'Adres z prefiksem lub maską'),
          h('span', { class: 'hint', id: 'calc-hint' }, 'adres/prefiks albo adres maska, wynik pojawia się podczas pisania'),
          input)),
      output);
    return { title: 'Kalkulator', node };
  }

  // ---------- fallback views ----------

  function notFoundView() {
    return {
      title: 'Nie ma takiej strony',
      node: h('div', { class: 'view' },
        h('h1', { tabindex: '-1' }, 'Nie ma takiej strony'),
        h('p', { class: 'lede' }, 'Adres ' + location.hash + ' nie prowadzi do żadnego widoku tej aplikacji.'),
        h('div', { class: 'actions' }, link('#/cwicz', 'Wróć do ćwiczeń', 'btn btn-primary'))),
    };
  }

  function errorView(err) {
    return {
      title: 'Błąd',
      node: h('div', { class: 'view' },
        h('h1', { tabindex: '-1' }, 'Coś poszło nie tak'),
        h('p', { class: 'lede' }, 'Ten widok nie mógł się wczytać. Odśwież stronę, a jeśli błąd wróci, wyślij poniższy komunikat osobie, która utrzymuje aplikację.'),
        h('pre', { class: 'error-detail' }, String(err && err.message ? err.message : err)),
        h('div', { class: 'actions' }, link('#/cwicz', 'Wróć do ćwiczeń', 'btn btn-primary'))),
    };
  }

  // ---------- router ----------

  function route() {
    // in-page anchors such as the skip link are not routes
    if (location.hash && !location.hash.startsWith('#/')) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    let view;
    try {
      switch (parts[0]) {
        case undefined:
          location.replace('#/cwicz');
          return;
        case 'cwicz':
          view = parts[1] ? practiceRunnerView(parts[1]) : practiceListView();
          break;
        case 'test':
          view = parts[1] === 'rozwiazuj' ? testRunView() : parts[1] === 'wynik' ? testResultView() : testHomeView();
          break;
        case 'teoria':
          view = theoryView(parts[1]);
          break;
        case 'kalkulator':
          view = calculatorView();
          break;
        default:
          view = notFoundView();
      }
    } catch (err) {
      view = errorView(err);
    }
    if (view) mount(view);
  }

  // ---------- theme ----------

  function effectiveTheme() {
    return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function initTheme() {
    const button = document.getElementById('theme-toggle');
    const label = () => {
      button.textContent = effectiveTheme() === 'dark' ? 'Jasny motyw' : 'Ciemny motyw';
    };
    button.addEventListener('click', () => {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      Store.setTheme(next);
      label();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
    label();
  }

  try {
    initTheme();
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    mount(errorView(err));
  }
})();
