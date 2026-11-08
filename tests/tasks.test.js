const test = require('node:test');
const assert = require('node:assert/strict');
const Net = require('../js/net.js');
const Tasks = require('../js/tasks.js');

const fixed = (label) => Tasks.testSet('fixed').find((t) => t.label === label);

function result(task, answers) {
  const r = Tasks.check(task, answers);
  return Object.fromEntries(Object.entries(r.fields).map(([id, f]) => [id, f.ok]));
}

test('class sheet: Zadanie 1a and 1b', () => {
  assert.deepEqual(result(fixed('Zadanie 1a'), { answer: '1011 1111' }), { answer: true });
  assert.deepEqual(result(fixed('Zadanie 1a'), { answer: '10111110' }), { answer: false });
  assert.deepEqual(result(fixed('Zadanie 1b'), { answer: '205' }), { answer: true });
});

test('class sheet: Zadanie 2 accepts grouped digits and rejects 64', () => {
  const t = fixed('Zadanie 2');
  assert.deepEqual(result(t, { answer: '62' }), { answer: true });
  assert.deepEqual(result(t, { answer: '64' }), { answer: false });
  assert.equal(Tasks.check(t, { answer: 'abc' }).fields.answer.message, 'Wpisz liczbę całkowitą, same cyfry.');
});

test('class sheet: Zadanie 3 grades each of the four fields independently', () => {
  const t = fixed('Zadanie 3');
  const correct = t.params.order.indexOf(0);
  assert.deepEqual(
    result(t, { class: 'c', networks: '2 097 152', hosts: '254', reason: String(correct) }),
    { class: true, networks: true, hosts: true, reason: true }
  );
  assert.deepEqual(
    result(t, { class: 'B', networks: '2097152', hosts: '65534', reason: String((correct + 1) % 4) }),
    { class: false, networks: true, hosts: false, reason: false }
  );
  assert.equal(Tasks.check(t, {}).fields.reason.message, 'Nie wybrano odpowiedzi.');
});

test('class A accepts both 128 and 126 networks', () => {
  const t = Tasks.build('ipClass', { ip: '81.10.20.30', order: [0, 1, 2, 3] });
  assert.equal(result(t, { class: 'A', networks: '128', hosts: '16777214', reason: '0' }).networks, true);
  assert.equal(result(t, { class: 'A', networks: '126', hosts: '16777214', reason: '0' }).networks, true);
  assert.equal(result(t, { class: 'A', networks: '127', hosts: '16777214', reason: '0' }).networks, false);
});

test('class sheet: Zadanie 4', () => {
  const t = fixed('Zadanie 4');
  assert.deepEqual(result(t, { network: '172.20.144.0', broadcast: '172.20.145.255' }), { network: true, broadcast: true });
  assert.deepEqual(result(t, { network: '172.20.144.0', broadcast: '172.20.144.255' }), { network: true, broadcast: false });
  assert.equal(Tasks.check(t, { network: '172.20.144', broadcast: '' }).fields.network.ok, false);
});

test('class sheet: Zadanie 5 VLSM is graded per requirement in the order given', () => {
  const t = fixed('Zadanie 5 (VLSM)');
  assert.deepEqual(t.fields.map((f) => f.label), [
    'Podsieć dla 400 hostów', 'Podsieć dla 10 hostów', 'Podsieć dla 15 hostów', 'Podsieć dla 220 hostów',
  ]);
  const answers = { s0: '172.20.144.0/23', s1: '172.20.147.32/28', s2: '172.20.147.0/27', s3: '172.20.146.0/24' };
  assert.deepEqual(result(t, answers), { s0: true, s1: true, s2: true, s3: true });
  const swapped = { ...answers, s1: '172.20.147.0/28' };
  const r = Tasks.check(t, swapped);
  assert.equal(r.fields.s1.ok, false);
  assert.equal(r.fields.s1.message, 'Prefiks się zgadza, adres sieci nie.');
  assert.equal(r.correct, 3);
});

test('class sheet: Zadanie 6a and 6b accept the subnets in any order but not twice', () => {
  const a = fixed('Zadanie 6a (FLSM)');
  assert.deepEqual(
    result(a, { s0: '10.10.38.0/23', s1: '10.10.32.0/23', s2: '10.10.36.0/23', s3: '10.10.34.0/23' }),
    { s0: true, s1: true, s2: true, s3: true }
  );
  const dup = Tasks.check(a, { s0: '10.10.32.0/23', s1: '10.10.32.0/23', s2: '10.10.36.0/23', s3: '10.10.34.0/24' });
  assert.deepEqual([dup.fields.s0.ok, dup.fields.s1.ok, dup.fields.s2.ok, dup.fields.s3.ok], [true, false, true, false]);
  const b = fixed('Zadanie 6b (FLSM)');
  assert.deepEqual(result(b, { s0: '10.0.0.16/28', s1: '10.0.0.0/28' }), { s0: true, s1: true });
  assert.deepEqual(result(b, { s0: '10.0.0.0/29', s1: '10.0.0.8/29' }), { s0: false, s1: false });
});

test('class sheet: Zadanie 7 accepts any valid division with 26 usable hosts and rejects the rest', () => {
  const t = fixed('Zadanie 7');
  const ok = (rows) => Tasks.check(t, { subnets: rows }).fields.subnets;
  assert.equal(ok(['192.168.0.0/28', '192.168.0.16/29', '192.168.0.24/29']).ok, true);
  assert.equal(ok(['192.168.0.24/29', '', '192.168.0.16/29', '192.168.0.0/28']).ok, true, 'order and blank rows do not matter');
  assert.match(ok(['192.168.0.0/28', '192.168.0.16/28']).message, /Suma użytecznych hostów w Twoim podziale to 28, a ma być 26/);
  assert.match(ok(['192.168.0.0/28', '192.168.0.8/29']).rows[1].message, /Nakłada się/);
  assert.match(ok(['192.168.0.4/28']).rows[0].message, /bity hosta muszą być zerami/);
  assert.match(ok(['192.168.1.0/28']).rows[0].message, /nie mieści się/);
  assert.match(ok(['192.168.0.0/31']).rows[0].message, /nie ma użytecznych hostów/);
  assert.equal(ok([]).message, 'Brak odpowiedzi.');
});

test('solutions state the expected answers for the class sheet', () => {
  const text = (label) =>
    Tasks.solve(fixed(label))
      .map((b) => (typeof b === 'string' ? b : JSON.stringify(b)))
      .join('\n');
  assert.match(text('Zadanie 1a'), /10111111/);
  assert.match(text('Zadanie 2'), /\*\*62\*\*/);
  assert.match(text('Zadanie 3'), /klasy \*\*C\*\*/);
  assert.match(text('Zadanie 3'), /2\^\{21\} = \*\*2\u00a0097\u00a0152\*\*/);
  assert.match(text('Zadanie 5 (VLSM)'), /172\.20\.147\.32\/28/);
  assert.match(text('Zadanie 5 (VLSM)'), /od 172\.20\.147\.48 do 172\.20\.147\.255/);
  assert.match(text('Zadanie 7'), /k = \*\*3\*\*/);
});

// Generators: every random task must be well-formed, unsolved by empty input, and solvable by its own oracle.
function oracle(task) {
  const answers = {};
  const r = Tasks.check(task, {});
  switch (task.type) {
    case 'dec2bin':
    case 'bin2dec':
    case 'hostsInPrefix':
      answers.answer = r.fields.answer.expected;
      break;
    case 'netBroadcast':
      answers.network = r.fields.network.expected;
      answers.broadcast = r.fields.broadcast.expected;
      break;
    case 'ipClass': {
      const ip = Net.parseIp(task.params.ip);
      const info = Net.CLASS_INFO[Net.classOf(ip)];
      Object.assign(answers, { class: Net.classOf(ip), networks: String(info.networks), hosts: String(info.hosts), reason: String(task.params.order.indexOf(0)) });
      break;
    }
    case 'vlsm':
      task.fields.forEach((f) => (answers[f.id] = r.fields[f.id].expected));
      break;
    case 'flsmCount':
    case 'flsmHosts': {
      const parent = Net.parseCidr(task.params.parent);
      Net.splitEqual(parent.ip, parent.prefix, task.params.count).subnets.forEach((s, i) => (answers['s' + i] = Net.cidrText(s.network, s.prefix)));
      break;
    }
    case 'partition': {
      const plan = Tasks.partitionPlan(task.params.parent, task.params.total);
      answers.subnets = plan.subnets.map((s) => Net.cidrText(s.network, s.prefix));
      break;
    }
    default:
      throw new Error('no oracle for ' + task.type);
  }
  return answers;
}

test('300 random tasks per type: build, reject empty input, accept the oracle answer, produce a solution', () => {
  const rng = Tasks.mulberry32(20251108);
  for (const type of Tasks.TYPES) {
    for (let i = 0; i < 300; i++) {
      const task = Tasks.generate(type.id, rng);
      const empty = Tasks.check(task, {});
      assert.equal(empty.correct, 0, type.id + ' empty input must score 0: ' + JSON.stringify(task.params));
      const full = Tasks.check(task, oracle(task));
      assert.equal(full.correct, full.total, type.id + ' oracle must score full: ' + JSON.stringify(task.params));
      assert.ok(Tasks.solve(task).length > 0);
    }
  }
});

test('generated hosts-per-subnet tasks have exactly one valid prefix', () => {
  const rng = Tasks.mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const { params } = Tasks.generate('flsmHosts', rng);
    const parent = Net.parseCidr(params.parent);
    const byCount = Net.splitEqual(parent.ip, parent.prefix, params.count).prefix;
    assert.equal(Net.prefixForHosts(params.hosts), byCount);
  }
});

test('hostsWord follows Polish plural rules', () => {
  const w = Tasks.hostsWord;
  assert.deepEqual([1, 3, 5, 12, 14, 22, 24, 25, 32, 62].map(w), ['host', 'hosty', 'hostów', 'hostów', 'hostów', 'hosty', 'hosty', 'hostów', 'hosty', 'hosty']);
});

test('the class sheet set has nine tasks and every fixed task builds', () => {
  const set = Tasks.testSet('fixed');
  assert.equal(set.length, 9);
  assert.deepEqual(new Set(set.map((t) => t.type)), new Set(Tasks.TYPES.map((t) => t.id)));
});
