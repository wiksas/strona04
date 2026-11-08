(function (root) {
  'use strict';

  const Net = root.Net || require('./net.js');

  // ---------- random helpers (rng is a function returning [0,1)) ----------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];

  function shuffled(rng, list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // ---------- text helpers ----------

  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

  function listPl(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' i ' + items[items.length - 1];
  }

  function hostsWord(n) {
    if (n === 1) return 'host';
    const last = n % 10;
    const lastTwo = n % 100;
    return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'hosty' : 'hostów';
  }

  const COUNT_EQUAL = { 2: 'dwie równe', 4: 'cztery równe', 8: 'osiem równych' };
  const COUNT_PLAIN = { 2: 'dwie', 4: 'cztery', 8: 'osiem' };

  function weightSum(bits) {
    const terms = [];
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') terms.push(Math.pow(2, bits.length - 1 - i));
    return (terms.length ? terms.join(' + ') : '0') + ' = ' + parseInt(bits, 2);
  }

  // ---------- answer parsing: each returns { value } or { error } ----------

  const EMPTY = 'Brak odpowiedzi.';

  function parseNumber(text) {
    const s = String(text == null ? '' : text).replace(/[\s\u00a0.,_']/g, '');
    if (s === '') return { error: EMPTY };
    if (!/^\d+$/.test(s)) return { error: 'Wpisz liczbę całkowitą, same cyfry.' };
    return { value: Number(s) };
  }

  function parseBinary(text) {
    const s = String(text == null ? '' : text).replace(/\s/g, '');
    if (s === '') return { error: EMPTY };
    if (!/^[01]+$/.test(s)) return { error: 'Liczba dwójkowa składa się wyłącznie z cyfr 0 i 1.' };
    if (s.length > 32) return { error: 'Za dużo cyfr, to zadanie mieści się w 32 bitach.' };
    return { value: parseInt(s, 2) };
  }

  function parseIpAnswer(text) {
    const s = String(text == null ? '' : text).trim();
    if (s === '') return { error: EMPTY };
    const ip = Net.parseIp(s);
    if (ip === null) return { error: 'To nie jest adres IPv4: potrzebne są cztery liczby 0 do 255 oddzielone kropkami.' };
    return { value: ip };
  }

  function parseCidrAnswer(text) {
    const s = String(text == null ? '' : text).trim();
    if (s === '') return { error: EMPTY };
    const cidr = Net.parseCidr(s);
    if (cidr === null) return { error: 'Użyj formatu adres/prefiks: cztery liczby, ukośnik, długość prefiksu 0 do 32.' };
    return { value: cidr };
  }

  function judge(answer, parse, matches, expectedText) {
    const parsed = parse(answer);
    if (parsed.error) return { ok: false, message: parsed.error, expected: expectedText };
    return matches(parsed.value)
      ? { ok: true }
      : { ok: false, message: 'Niepoprawna odpowiedź.', expected: expectedText };
  }

  function summarize(fields) {
    const ids = Object.keys(fields);
    return { fields, correct: ids.filter((id) => fields[id].ok).length, total: ids.length };
  }

  // ---------- network generators ----------

  // Random aligned network base in a private-looking range, so generated tasks look like classroom exercises.
  function randomBase(rng, prefix) {
    const family = randInt(rng, 0, 2);
    let octets;
    if (family === 0) octets = [10, randInt(rng, 0, 255), randInt(rng, 0, 255), 0];
    else if (family === 1) octets = [172, randInt(rng, 16, 31), randInt(rng, 0, 255), 0];
    else octets = [192, 168, randInt(rng, 0, 255), 0];
    return Net.networkOf(Net.parseIp(octets.join('.')), prefix);
  }

  function parseParent(text) {
    const c = Net.parseCidr(text);
    return { ip: Net.networkOf(c.ip, c.prefix), prefix: c.prefix };
  }

  // ---------- task types ----------
  // Each type: build(params) -> { prompt, fields }, check(task, answers) -> summary, solve(task) -> blocks.
  // Blocks: string (rich text), { table }, { weights }, { bitrows }.

  const textField = (id, label, hint, mono) => ({ id, label, kind: 'text', hint, mono: !!mono });

  const dec2bin = {
    id: 'dec2bin',
    name: 'Dziesiętny na dwójkowy',
    summary: 'Zamiana liczby dziesiętnej na zapis w systemie dwójkowym.',
    generate: (rng) => ({ value: randInt(rng, 16, 255) }),
    build: ({ value }) => ({
      prompt: ['Zapisz liczbę (' + value + ')_{10} w systemie dwójkowym.'],
      fields: [textField('answer', 'Zapis dwójkowy', 'Same cyfry 0 i 1, spacje są ignorowane', true)],
    }),
    check: (task, answers) => {
      const value = task.params.value;
      return summarize({
        answer: judge(answers.answer, parseBinary, (v) => v === value, Net.toBin(value)),
      });
    },
    solve: (task) => {
      const value = task.params.value;
      const bin = Net.toBin(value);
      const rows = [];
      for (let n = value; n > 0; n = Math.floor(n / 2)) {
        rows.push([n + ' : 2', String(Math.floor(n / 2)), String(n % 2)]);
      }
      return [
        'Dzielimy liczbę kolejno przez 2 i zapisujemy reszty. Wynik to reszty odczytane od dołu do góry.',
        { table: { head: ['Dzielenie', 'Iloraz', 'Reszta'], rows } },
        'Reszty od dołu do góry: **' + bin + '**, czyli (' + value + ')_{10} = (' + bin + ')_{2}.',
        'Sprawdzenie wagami pozycji (od prawej 1, 2, 4, 8, ...):',
        { weights: { bits: bin } },
        weightSum(bin),
      ];
    },
  };

  const bin2dec = {
    id: 'bin2dec',
    name: 'Dwójkowy na dziesiętny',
    summary: 'Zamiana liczby dwójkowej na zapis dziesiętny.',
    generate: (rng) => {
      const length = randInt(rng, 6, 8);
      let bits = '1';
      for (let i = 1; i < length; i++) bits += rng() < 0.5 ? '1' : '0';
      return { bits };
    },
    build: ({ bits }) => ({
      prompt: ['Zapisz liczbę (' + bits + ')_{2} w systemie dziesiętnym.'],
      fields: [textField('answer', 'Zapis dziesiętny', 'Liczba całkowita', true)],
    }),
    check: (task, answers) => {
      const value = parseInt(task.params.bits, 2);
      return summarize({
        answer: judge(answers.answer, parseNumber, (v) => v === value, String(value)),
      });
    },
    solve: (task) => {
      const bits = task.params.bits;
      const value = parseInt(bits, 2);
      return [
        'Każda cyfra ma wagę równą potędze dwójki: od prawej 1, 2, 4, 8, 16, ... Dodajemy wagi tych pozycji, na których stoi jedynka.',
        { weights: { bits } },
        weightSum(bits),
        '(' + bits + ')_{2} = (' + value + ')_{10}.',
      ];
    },
  };

  const hostsInPrefix = {
    id: 'hostsInPrefix',
    name: 'Liczba hostów w sieci',
    summary: 'Ile użytecznych adresów hostów daje podana maska.',
    generate: (rng) => ({ prefix: randInt(rng, 8, 30), form: rng() < 0.7 ? 'slash' : 'dotted' }),
    build: ({ prefix, form }) => {
      const mask = form === 'dotted' ? Net.formatIp(Net.maskInt(prefix)) : '/' + prefix;
      return {
        prompt: ['Ile hostów można zaadresować w sieci o masce ' + mask + '? Podaj liczbę użytecznych adresów hostów.'],
        fields: [textField('answer', 'Liczba użytecznych hostów', 'Liczba całkowita', true)],
      };
    },
    check: (task, answers) => {
      const hosts = Net.usableHosts(task.params.prefix);
      return summarize({
        answer: judge(answers.answer, parseNumber, (v) => v === hosts, fmt(hosts)),
      });
    },
    solve: (task) => {
      const prefix = task.params.prefix;
      const hostBits = 32 - prefix;
      const size = Net.blockSize(prefix);
      const hosts = Net.usableHosts(prefix);
      const blocks = [];
      if (task.params.form === 'dotted') {
        blocks.push('Maska ' + Net.formatIp(Net.maskInt(prefix)) + ' ma ' + prefix + ' jedynek, to prefiks /' + prefix + '.');
      }
      blocks.push(
        'Adres IPv4 ma 32 bity. Na część sieci przypada ' + prefix + ', więc na hosty zostaje 32 - ' + prefix + ' = **' + hostBits + '** bitów.',
        'Wszystkich adresów w sieci: 2^{' + hostBits + '} = ' + fmt(size) + '.',
        'Dwa adresy są zarezerwowane: adres sieci (same zera w części hosta) i adres rozgłoszeniowy (same jedynki). Użytecznych hostów: ' + fmt(size) + ' - 2 = **' + fmt(hosts) + '**.'
      );
      return blocks;
    },
  };

  // ---- class, networks, hosts, private-address reason ----

  const REASONS = [
    'Nie należy do zakresów adresów prywatnych (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). To adres publiczny, przydzielony w Internecie, więc w sieci lokalnej koliduje z jego prawdziwym właścicielem.',
    'Jest adresem rozgłoszeniowym swojej sieci, więc nie można go przypisać żadnemu urządzeniu.',
    'Należy do zakresu zarezerwowanego dla multicastu, czyli transmisji do grupy odbiorców.',
    'Jest adresem pętli zwrotnej (loopback), przeznaczonym tylko do testów na jednym komputerze.',
  ];

  const ipClass = {
    id: 'ipClass',
    name: 'Klasa adresu i adresy prywatne',
    summary: 'Klasa, liczba sieci i hostów w klasie oraz dlaczego adres publiczny nie nadaje się do sieci lokalnej.',
    generate: (rng) => {
      const cls = pick(rng, ['A', 'B', 'C', 'C']);
      const info = Net.CLASS_INFO[cls];
      for (;;) {
        const octets = [randInt(rng, info.first, info.last), randInt(rng, 1, 254), randInt(rng, 1, 254), randInt(rng, 1, 254)];
        const ip = octets.join('.');
        if (Net.scopeOf(Net.parseIp(ip)) === 'public') return { ip, order: shuffled(rng, [0, 1, 2, 3]) };
      }
    },
    build: ({ ip, order }) => ({
      prompt: ['Adres `' + ip + '`:'],
      fields: [
        textField('class', 'Do której klasy należy?', 'Litera A, B lub C'),
        textField('networks', 'Ile sieci można zaadresować w tej klasie?', 'Liczba całkowita', true),
        textField('hosts', 'Ile hostów można zaadresować w jednej sieci tej klasy?', 'Liczba użytecznych adresów hostów', true),
        {
          id: 'reason',
          label: 'Wyjaśnij, dlaczego ten adres nie powinien być używany w sieciach prywatnych (lokalnych).',
          hint: 'Wybierz poprawne wyjaśnienie',
          kind: 'choice',
          options: order.map((i) => REASONS[i]),
        },
      ],
    }),
    check: (task, answers) => {
      const ip = Net.parseIp(task.params.ip);
      const cls = Net.classOf(ip);
      const info = Net.CLASS_INFO[cls];
      const letter = String(answers.class == null ? '' : answers.class).trim().toUpperCase().replace(/^KLASA\s*/, '');
      const classField =
        letter === ''
          ? { ok: false, message: EMPTY, expected: cls }
          : letter === cls
            ? { ok: true }
            : { ok: false, message: 'Niepoprawna odpowiedź.', expected: cls };
      const networkAccepted = [info.networks, info.usableNetworks];
      const networksExpected = cls === 'A' ? '128 (lub 126, jeśli odjąć zarezerwowane 0 i 127)' : fmt(info.networks);
      const correctOption = task.params.order.indexOf(0);
      const chosen = answers.reason == null || answers.reason === '' ? null : Number(answers.reason);
      const reasonField =
        chosen === null
          ? { ok: false, message: 'Nie wybrano odpowiedzi.', expected: REASONS[0] }
          : chosen === correctOption
            ? { ok: true }
            : { ok: false, message: 'Niepoprawna odpowiedź.', expected: REASONS[0] };
      return summarize({
        class: classField,
        networks: judge(answers.networks, parseNumber, (v) => networkAccepted.includes(v), networksExpected),
        hosts: judge(answers.hosts, parseNumber, (v) => v === info.hosts, fmt(info.hosts)),
        reason: reasonField,
      });
    },
    solve: (task) => {
      const ipText = task.params.ip;
      const ip = Net.parseIp(ipText);
      const cls = Net.classOf(ip);
      const info = Net.CLASS_INFO[cls];
      const first = ip >>> 24;
      const hostBits = 32 - info.prefix;
      const freeNetworkBits = info.prefix - info.leadBits.length;
      const rows = ['A', 'B', 'C'].map((c) => {
        const i = Net.CLASS_INFO[c];
        return [c, i.leadBits + '...', i.first + ' do ' + i.last, '/' + i.prefix, fmt(i.networks), fmt(i.hosts)];
      });
      const blocks = [
        'Klasę wyznacza pierwszy oktet. W ' + ipText + ' to ' + first + ', czyli w zapisie dwójkowym ' + Net.toBin(first, 8) + '. Zaczyna się od ' + info.leadBits + ', więc adres należy do klasy **' + cls + '** (pierwszy oktet od ' + info.first + ' do ' + info.last + ').',
        { table: { head: ['Klasa', 'Początek bitów', 'Pierwszy oktet', 'Maska domyślna', 'Sieci', 'Hosty w sieci'], rows } },
        'Sieci w klasie ' + cls + ': prefiks /' + info.prefix + ' daje ' + info.prefix + ' bitów sieci, z czego ' + info.leadBits.length + ' to stały początek (' + info.leadBits + '). Zmiennych bitów sieci jest ' + info.prefix + ' - ' + info.leadBits.length + ' = ' + freeNetworkBits + ', więc sieci jest 2^{' + freeNetworkBits + '} = **' + fmt(info.networks) + '**.',
      ];
      if (cls === 'A') {
        blocks.push('W klasie A adresy sieci 0 i 127 są zarezerwowane (127 to pętla zwrotna), więc w praktyce użytecznych sieci jest 126. Kontrola przyjmuje 128 i 126.');
      }
      blocks.push(
        'Hosty w jednej sieci: bitów hosta jest 32 - ' + info.prefix + ' = ' + hostBits + ', więc 2^{' + hostBits + '} - 2 = **' + fmt(info.hosts) + '**.',
        'Adresy prywatne (RFC 1918) to wyłącznie: ' + Net.PRIVATE_RANGES.join(', ') + '. Adres ' + ipText + ' nie należy do żadnego z tych zakresów, więc jest adresem **publicznym**: jest routowany w Internecie i został komuś przydzielony. W sieci lokalnej urządzenia nie dotarłyby przez ten adres do jego prawdziwego właściciela w Internecie.'
      );
      return blocks;
    },
  };

  const netBroadcast = {
    id: 'netBroadcast',
    name: 'Adres sieci i rozgłoszeniowy',
    summary: 'Adres sieci i adres rozgłoszeniowy urządzenia na podstawie adresu i prefiksu.',
    generate: (rng) => {
      const prefix = randInt(rng, 12, 29);
      const ip = (randomBase(rng, 16) + randInt(rng, 1, 65534)) >>> 0;
      return { ip: Net.formatIp(ip), prefix };
    },
    build: ({ ip, prefix }) => ({
      prompt: ['Oblicz adres sieci i adres rozgłoszeniowy dla urządzenia o adresie `' + ip + '/' + prefix + '`.'],
      fields: [
        textField('network', 'Adres sieci', 'Cztery liczby oddzielone kropkami', true),
        textField('broadcast', 'Adres rozgłoszeniowy', 'Cztery liczby oddzielone kropkami', true),
      ],
    }),
    check: (task, answers) => {
      const d = Net.describe(Net.parseIp(task.params.ip), task.params.prefix);
      return summarize({
        network: judge(answers.network, parseIpAnswer, (v) => v === d.network, Net.formatIp(d.network)),
        broadcast: judge(answers.broadcast, parseIpAnswer, (v) => v === d.broadcast, Net.formatIp(d.broadcast)),
      });
    },
    solve: (task) => {
      const prefix = task.params.prefix;
      const d = Net.describe(Net.parseIp(task.params.ip), prefix);
      const blocks = [
        'Maska /' + prefix + ' to ' + prefix + ' jedynek, a po nich same zera: **' + Net.formatIp(d.mask) + '**.',
        {
          bitrows: {
            prefix,
            rows: [
              { label: 'Adres', ip: d.ip },
              { label: 'Maska', ip: d.mask },
              { label: 'Sieć (AND)', ip: d.network },
              { label: 'Rozgłoszeniowy', ip: d.broadcast },
            ],
          },
        },
        'Adres sieci: bity hosta zerujemy, czyli liczymy iloczyn bitowy adresu i maski: **' + Net.formatIp(d.network) + '**.',
        'Adres rozgłoszeniowy: wszystkie bity hosta ustawiamy na 1: **' + Net.formatIp(d.broadcast) + '**.',
      ];
      if (prefix % 8 !== 0) {
        const octet = Math.floor((prefix - 1) / 8);
        const maskOctet = (d.mask >>> (24 - 8 * octet)) & 255;
        const ipOctet = (d.ip >>> (24 - 8 * octet)) & 255;
        const netOctet = (d.network >>> (24 - 8 * octet)) & 255;
        const step = 256 - maskOctet;
        blocks.push(
          'Skrót: granica prefiksu leży w ' + (octet + 1) + '. oktecie, którego maska to ' + maskOctet + '. Podsieci w tym oktecie zaczynają się co 256 - ' + maskOctet + ' = ' + step + ', a ' + ipOctet + ' mieści się w bloku od ' + netOctet + ' do ' + (netOctet + step - 1) + '.'
        );
      }
      if (d.first !== null) {
        blocks.push('Zakres hostów: od ' + Net.formatIp(d.first) + ' do ' + Net.formatIp(d.last) + ' (' + fmt(d.hosts) + ' użytecznych adresów).');
      }
      return blocks;
    },
  };

  // ---- VLSM ----

  const vlsm = {
    id: 'vlsm',
    name: 'Podział VLSM',
    summary: 'Podsieci o różnych rozmiarach, od największej do najmniejszej.',
    generate: (rng) => {
      for (let attempt = 0; attempt < 500; attempt++) {
        const prefix = randInt(rng, 20, 24);
        const count = randInt(rng, 3, 4);
        const maxHostBits = 32 - prefix - 1;
        const hosts = [];
        for (let i = 0; i < count; i++) {
          const hostBits = randInt(rng, 3, maxHostBits);
          hosts.push(randInt(rng, Math.pow(2, hostBits - 1) - 1, Math.pow(2, hostBits) - 2));
        }
        if (new Set(hosts).size !== count) continue;
        const sortedDesc = hosts.slice().sort((a, b) => b - a);
        if (hosts.every((h, i) => h === sortedDesc[i])) continue;
        const total = hosts.reduce((sum, h) => sum + Net.blockSize(Net.prefixForHosts(h)), 0);
        if (total > Net.blockSize(prefix)) continue;
        return { parent: Net.cidrText(randomBase(rng, prefix), prefix), hosts };
      }
      throw new Error('Nie udało się wylosować zadania VLSM');
    },
    build: ({ parent, hosts }) => ({
      prompt: [
        'Podziel sieć `' + parent + '` na podsieci dla ' + listPl(hosts.map(String)) + ' hostów. Przydzielaj od największej do najmniejszej, każdą od pierwszego wolnego adresu.',
      ],
      fields: hosts.map((h, i) => textField('s' + i, 'Podsieć dla ' + h + ' hostów', 'adres/prefiks', true)),
    }),
    check: (task, answers) => {
      const parent = parseParent(task.params.parent);
      const plan = Net.allocateVlsm(parent.ip, parent.prefix, task.params.hosts);
      const fields = {};
      for (const a of plan.allocations) {
        const expectedText = Net.cidrText(a.network, a.prefix);
        const parsed = parseCidrAnswer(answers['s' + a.index]);
        if (parsed.error) {
          fields['s' + a.index] = { ok: false, message: parsed.error, expected: expectedText };
        } else if (parsed.value.ip === a.network && parsed.value.prefix === a.prefix) {
          fields['s' + a.index] = { ok: true };
        } else {
          const message =
            parsed.value.ip === a.network
              ? 'Adres sieci się zgadza, prefiks nie.'
              : parsed.value.prefix === a.prefix
                ? 'Prefiks się zgadza, adres sieci nie.'
                : 'Niepoprawna odpowiedź.';
          fields['s' + a.index] = { ok: false, message, expected: expectedText };
        }
      }
      const ordered = {};
      task.params.hosts.forEach((_, i) => (ordered['s' + i] = fields['s' + i]));
      return summarize(ordered);
    },
    solve: (task) => {
      const parent = parseParent(task.params.parent);
      const plan = Net.allocateVlsm(parent.ip, parent.prefix, task.params.hosts);
      const sizing = plan.allocations.map((a) => {
        const hostBits = 32 - a.prefix;
        return [a.hosts + ' hostów', String(hostBits), fmt(a.size), fmt(Net.usableHosts(a.prefix)), '/' + a.prefix];
      });
      const layout = plan.allocations.map((a) => [
        a.hosts + ' hostów',
        Net.cidrText(a.network, a.prefix),
        Net.formatIp(a.network + 1) + ' do ' + Net.formatIp(a.broadcast - 1),
        Net.formatIp(a.broadcast),
      ]);
      const blocks = [
        'Dla każdego wymagania szukamy najmniejszego bloku 2^{n}, w którym 2^{n} - 2 jest nie mniejsze niż liczba hostów. Kolejność od największego wymagania:',
        { table: { head: ['Wymaganie', 'Bity hosta (n)', 'Adresy w bloku', 'Użyteczne hosty', 'Prefiks'], rows: sizing } },
        'Układamy bloki w tej kolejności, każdy od pierwszego wolnego adresu. Sieć nadrzędna zaczyna się od ' + Net.formatIp(plan.start) + '.',
        { table: { head: ['Wymaganie', 'Adres sieci/prefiks', 'Zakres hostów', 'Adres rozgłoszeniowy'], rows: layout } },
      ];
      if (plan.nextFree <= plan.end) {
        blocks.push('Wolne zostaje: od ' + Net.formatIp(plan.nextFree) + ' do ' + Net.formatIp(plan.end) + ' (' + fmt(plan.end - plan.nextFree + 1) + ' adresów).');
      } else {
        blocks.push('Sieć nadrzędna została wykorzystana w całości.');
      }
      return blocks;
    },
  };

  // ---- FLSM ----

  function checkSubnetSet(task, answers, expectedSubnets) {
    const expected = new Set(expectedSubnets.map((s) => Net.cidrText(s.network, s.prefix)));
    const used = new Set();
    const fields = {};
    task.fields.forEach((field) => {
      const parsed = parseCidrAnswer(answers[field.id]);
      if (parsed.error) {
        fields[field.id] = { ok: false, message: parsed.error };
        return;
      }
      const text = Net.cidrText(parsed.value.ip, parsed.value.prefix);
      if (!expected.has(text)) fields[field.id] = { ok: false, message: 'To nie jest żadna z szukanych podsieci.' };
      else if (used.has(text)) fields[field.id] = { ok: false, message: 'Ta podsieć jest już wpisana w innym polu.' };
      else {
        used.add(text);
        fields[field.id] = { ok: true };
      }
    });
    return summarize(fields);
  }

  function subnetListTable(subnets) {
    return {
      table: {
        head: ['Podsieć', 'Adres sieci/prefiks', 'Zakres hostów', 'Adres rozgłoszeniowy'],
        rows: subnets.map((s, i) => [
          String(i + 1),
          Net.cidrText(s.network, s.prefix),
          Net.formatIp(s.network + 1) + ' do ' + Net.formatIp(s.broadcast - 1),
          Net.formatIp(s.broadcast),
        ]),
      },
    };
  }

  function subnetFields(count) {
    const fields = [];
    for (let i = 0; i < count; i++) fields.push(textField('s' + i, 'Podsieć ' + (i + 1), 'adres/prefiks, kolejność dowolna', true));
    return fields;
  }

  const flsmCount = {
    id: 'flsmCount',
    name: 'Podział FLSM na równe podsieci',
    summary: 'Podsieci tej samej wielkości, jak największe możliwe przy zadanej ich liczbie.',
    generate: (rng) => {
      const count = pick(rng, [2, 4, 8]);
      const bits = Net.log2Ceil(count);
      const prefix = randInt(rng, 16, 27 - bits);
      return { parent: Net.cidrText(randomBase(rng, prefix), prefix), count };
    },
    build: ({ parent, count }) => ({
      prompt: ['Podziel sieć `' + parent + '` na ' + COUNT_EQUAL[count] + ' podsieci o maksymalnej możliwej wielkości.'],
      fields: subnetFields(count),
    }),
    check: (task, answers) => {
      const parent = parseParent(task.params.parent);
      return checkSubnetSet(task, answers, Net.splitEqual(parent.ip, parent.prefix, task.params.count).subnets);
    },
    solve: (task) => {
      const parent = parseParent(task.params.parent);
      const { count } = task.params;
      const plan = Net.splitEqual(parent.ip, parent.prefix, count);
      return [
        'Żeby dostać ' + count + ' równych podsieci, pożyczamy z części hosta tyle bitów k, aby 2^{k} było co najmniej ' + count + '. Tu k = **' + plan.bits + '** (2^{' + plan.bits + '} = ' + Math.pow(2, plan.bits) + '). Pożyczamy tylko tyle, więc podsieci są największe z możliwych.',
        'Nowy prefiks: /' + parent.prefix + ' + ' + plan.bits + ' = **/' + plan.prefix + '**. Każda podsieć ma ' + fmt(Net.blockSize(plan.prefix)) + ' adresów, w tym ' + fmt(Net.usableHosts(plan.prefix)) + ' użytecznych hostów.',
        subnetListTable(plan.subnets),
        'Kolejne podsieci zaczynają się co ' + fmt(Net.blockSize(plan.prefix)) + ' adresów.',
      ];
    },
  };

  const flsmHosts = {
    id: 'flsmHosts',
    name: 'Podział FLSM pod liczbę hostów',
    summary: 'Równe podsieci, z których każda ma pomieścić zadaną liczbę hostów.',
    generate: (rng) => {
      const count = pick(rng, [2, 4, 8]);
      const bits = Net.log2Ceil(count);
      const hostBits = randInt(rng, 3, 6);
      const prefix = 32 - hostBits - bits;
      const hosts = randInt(rng, Math.pow(2, hostBits - 1) - 1, Math.pow(2, hostBits) - 2);
      return { parent: Net.cidrText(randomBase(rng, prefix), prefix), count, hosts };
    },
    build: ({ parent, count, hosts }) => ({
      prompt: ['Podziel sieć `' + parent + '` na ' + COUNT_PLAIN[count] + ' podsieci, z których każda pomieści ' + hosts + ' ' + hostsWord(hosts) + '.'],
      fields: subnetFields(count),
    }),
    check: (task, answers) => {
      const parent = parseParent(task.params.parent);
      return checkSubnetSet(task, answers, Net.splitEqual(parent.ip, parent.prefix, task.params.count).subnets);
    },
    solve: (task) => {
      const parent = parseParent(task.params.parent);
      const { count, hosts } = task.params;
      const plan = Net.splitEqual(parent.ip, parent.prefix, count);
      const hostBits = 32 - Net.prefixForHosts(hosts);
      return [
        'Szukamy najmniejszego bloku, który pomieści ' + hosts + ' ' + hostsWord(hosts) + ': 2^{n} - 2 >= ' + hosts + '. Najmniejsze takie n to **' + hostBits + '** (2^{' + hostBits + '} - 2 = ' + Net.usableHosts(32 - hostBits) + '), czyli prefiks /' + (32 - hostBits) + '.',
        'Z sieci /' + parent.prefix + ' wychodzi 2^{' + (32 - hostBits - parent.prefix) + '} = ' + count + ' takich podsieci, dokładnie tyle, ile trzeba. Wszystkie mają prefiks **/' + plan.prefix + '**.',
        subnetListTable(plan.subnets),
      ];
    },
  };

  // ---- total usable hosts ----

  function partitionPlan(parentText, total) {
    const parent = parseParent(parentText);
    const size = Net.blockSize(parent.prefix);
    const parts = (size - total) / 2;
    if (!Number.isInteger(parts) || parts < 1) return null;
    const sizes = Net.splitIntoBlocks(size, parts);
    if (!sizes) return null;
    let cursor = parent.ip;
    const subnets = sizes.map((blockLength) => {
      const prefix = 32 - Net.log2Ceil(blockLength);
      const subnet = { network: cursor, prefix, size: blockLength };
      cursor += blockLength;
      return subnet;
    });
    return { parent, size, parts, sizes, subnets };
  }

  const partition = {
    id: 'partition',
    name: 'Podział pod sumę hostów',
    summary: 'Podział sieci tak, by suma użytecznych hostów we wszystkich podsieciach miała zadaną wartość.',
    generate: (rng) => {
      const prefix = randInt(rng, 24, 28);
      const size = Net.blockSize(prefix);
      const parts = randInt(rng, 2, Math.min(4, size / 4));
      return { parent: Net.cidrText(randomBase(rng, prefix), prefix), total: size - 2 * parts };
    },
    build: ({ parent, total }) => {
      if (!partitionPlan(parent, total)) throw new RangeError('Zadanie nie ma rozwiązania');
      return {
        prompt: ['Podziel sieć `' + parent + '` tak, aby łączna liczba hostów możliwych do zaadresowania wynosiła ' + total + '.'],
        fields: [
          {
            id: 'subnets',
            label: 'Twój podział na podsieci',
            hint: 'adres/prefiks w każdym polu',
            kind: 'list',
            mono: true,
            addLabel: 'Dodaj podsieć',
          },
        ],
      };
    },
    check: (task, answers) => {
      const plan = partitionPlan(task.params.parent, task.params.total);
      const parent = plan.parent;
      const parentText = Net.cidrText(parent.ip, parent.prefix);
      const rawRows = Array.isArray(answers.subnets) ? answers.subnets : [];
      const rows = [];
      const accepted = [];
      let sum = 0;
      for (const raw of rawRows) {
        if (String(raw == null ? '' : raw).trim() === '') {
          rows.push({ ok: null });
          continue;
        }
        const parsed = parseCidrAnswer(raw);
        if (parsed.error) {
          rows.push({ ok: false, message: parsed.error });
          continue;
        }
        const { ip, prefix } = parsed.value;
        const text = Net.cidrText(ip, prefix);
        let message = null;
        if (Net.networkOf(ip, prefix) !== ip) {
          message = 'To nie jest adres sieci dla prefiksu /' + prefix + ': bity hosta muszą być zerami.';
        } else if (prefix > 30) {
          message = 'Podsieć /' + prefix + ' nie ma użytecznych hostów.';
        } else if (prefix < parent.prefix || Net.networkOf(ip, parent.prefix) !== parent.ip) {
          message = 'Podsieć nie mieści się w sieci ' + parentText + '.';
        } else {
          const overlap = accepted.find((a) => ip <= a.broadcast && Net.broadcastOf(ip, prefix) >= a.network);
          if (overlap) message = 'Nakłada się na podsieć ' + Net.cidrText(overlap.network, overlap.prefix) + '.';
        }
        if (message) {
          rows.push({ ok: false, message });
        } else {
          accepted.push({ network: ip, prefix, broadcast: Net.broadcastOf(ip, prefix) });
          sum += Net.usableHosts(prefix);
          rows.push({ ok: true });
        }
      }
      const rowsValid = rows.every((r) => r.ok !== false) && accepted.length > 0;
      const ok = rowsValid && sum === task.params.total;
      let message;
      if (rawRows.every((r) => String(r == null ? '' : r).trim() === '')) message = EMPTY;
      else if (!ok && rowsValid) message = 'Suma użytecznych hostów w Twoim podziale to ' + sum + ', a ma być ' + task.params.total + '.';
      else if (!ok) message = 'Popraw zaznaczone podsieci.';
      return summarize({
        subnets: ok ? { ok: true, rows } : { ok: false, rows, message },
      });
    },
    solve: (task) => {
      const plan = partitionPlan(task.params.parent, task.params.total);
      const { total } = task.params;
      const usable = plan.subnets.map((s) => Net.usableHosts(s.prefix));
      return [
        'Każda podsieć traci dwa adresy: swój adres sieci i adres rozgłoszeniowy. Gdy podsieci jest k, a razem zajmują całą sieć, użytecznych hostów jest (liczba adresów) - 2k.',
        'Sieć ma ' + fmt(plan.size) + ' adresów, więc ' + fmt(plan.size) + ' - 2k = ' + total + ', stąd k = **' + plan.parts + '**.',
        'Potrzebujemy ' + plan.parts + ' podsieci, których rozmiary (potęgi dwójki) dają razem ' + fmt(plan.size) + ': ' + plan.sizes.join(' + ') + ' = ' + fmt(plan.size) + '.',
        {
          table: {
            head: ['Podsieć', 'Adres sieci/prefiks', 'Adresy', 'Użyteczne hosty'],
            rows: plan.subnets.map((s, i) => [String(i + 1), Net.cidrText(s.network, s.prefix), String(s.size), String(usable[i])]),
          },
        },
        'Sprawdzenie: ' + usable.join(' + ') + ' = ' + total + '.',
        'To jeden z poprawnych podziałów. Kontrola akceptuje każdy podział, który spełnia warunki zadania.',
      ];
    },
  };

  // ---------- registry ----------

  const TYPES = [dec2bin, bin2dec, hostsInPrefix, ipClass, netBroadcast, vlsm, flsmCount, flsmHosts, partition];
  const BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

  // The nine tasks from the class sheet, verbatim.
  const FIXED = [
    { label: 'Zadanie 1a', type: 'dec2bin', params: { value: 191 } },
    { label: 'Zadanie 1b', type: 'bin2dec', params: { bits: '11001101' } },
    { label: 'Zadanie 2', type: 'hostsInPrefix', params: { prefix: 26, form: 'slash' } },
    { label: 'Zadanie 3', type: 'ipClass', params: { ip: '195.64.159.184', order: [2, 0, 3, 1] } },
    { label: 'Zadanie 4', type: 'netBroadcast', params: { ip: '172.20.144.101', prefix: 23 } },
    { label: 'Zadanie 5 (VLSM)', type: 'vlsm', params: { parent: '172.20.144.0/22', hosts: [400, 10, 15, 220] } },
    { label: 'Zadanie 6a (FLSM)', type: 'flsmCount', params: { parent: '10.10.32.0/21', count: 4 } },
    { label: 'Zadanie 6b (FLSM)', type: 'flsmHosts', params: { parent: '10.0.0.0/27', count: 2, hosts: 8 } },
    { label: 'Zadanie 7', type: 'partition', params: { parent: '192.168.0.0/27', total: 26 } },
  ];

  function build(typeId, params, label) {
    const type = BY_ID[typeId];
    if (!type) throw new Error('Nieznany typ zadania: ' + typeId);
    const { prompt, fields } = type.build(params);
    return { type: typeId, name: type.name, label: label || null, params, prompt, fields };
  }

  function generate(typeId, rng) {
    const type = BY_ID[typeId];
    if (!type) throw new Error('Nieznany typ zadania: ' + typeId);
    return build(typeId, type.generate(rng || Math.random));
  }

  function fixedTask(typeId) {
    const entry = FIXED.find((f) => f.type === typeId);
    return entry ? build(entry.type, entry.params, entry.label) : null;
  }

  function check(task, answers) {
    return BY_ID[task.type].check(task, answers || {});
  }

  function solve(task) {
    return BY_ID[task.type].solve(task);
  }

  // kind: 'fixed' (class sheet) or 'random' (same nine types, fresh numbers)
  function testSet(kind, rng) {
    return FIXED.map((entry) =>
      kind === 'fixed'
        ? build(entry.type, entry.params, entry.label)
        : { ...generate(entry.type, rng), label: entry.label }
    );
  }

  const api = { TYPES, BY_ID, FIXED, build, generate, fixedTask, check, solve, testSet, mulberry32, fmt, hostsWord, partitionPlan };
  root.Tasks = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
