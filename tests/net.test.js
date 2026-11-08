const test = require('node:test');
const assert = require('node:assert/strict');
const Net = require('../js/net.js');

const ip = (s) => Net.parseIp(s);

test('parseIp rejects malformed addresses', () => {
  assert.equal(Net.parseIp('192.168.0.256'), null);
  assert.equal(Net.parseIp('192.168.0'), null);
  assert.equal(Net.parseIp('a.b.c.d'), null);
  assert.equal(Net.formatIp(Net.parseIp('255.255.255.255')), '255.255.255.255');
  assert.equal(Net.formatIp(Net.parseIp('0.0.0.0')), '0.0.0.0');
});

test('parseCidr rejects prefix above 32 and missing prefix', () => {
  assert.equal(Net.parseCidr('10.0.0.0/33'), null);
  assert.equal(Net.parseCidr('10.0.0.0'), null);
  assert.deepEqual(Net.parseCidr(' 10.0.0.0 / 8 '), { ip: ip('10.0.0.0'), prefix: 8 });
});

test('mask boundaries /0, /8, /23, /32', () => {
  assert.equal(Net.formatIp(Net.maskInt(0)), '0.0.0.0');
  assert.equal(Net.formatIp(Net.maskInt(8)), '255.0.0.0');
  assert.equal(Net.formatIp(Net.maskInt(23)), '255.255.254.0');
  assert.equal(Net.formatIp(Net.maskInt(32)), '255.255.255.255');
  assert.equal(Net.prefixFromMask('255.255.254.0'), 23);
  assert.equal(Net.prefixFromMask('255.0.255.0'), null);
});

test('network and broadcast with the prefix inside an octet', () => {
  const d = Net.describe(ip('172.20.144.101'), 23);
  assert.equal(Net.formatIp(d.network), '172.20.144.0');
  assert.equal(Net.formatIp(d.broadcast), '172.20.145.255');
  assert.equal(d.hosts, 510);
});

test('usable hosts never negative and prefixForHosts is the tightest block', () => {
  assert.equal(Net.usableHosts(26), 62);
  assert.equal(Net.usableHosts(31), 0);
  assert.equal(Net.usableHosts(32), 0);
  assert.equal(Net.prefixForHosts(2), 30);
  assert.equal(Net.prefixForHosts(30), 27);
  assert.equal(Net.prefixForHosts(31), 26);
  assert.equal(Net.prefixForHosts(400), 23);
});

test('classes and scopes at their boundaries', () => {
  assert.equal(Net.classOf(ip('127.255.255.255')), 'A');
  assert.equal(Net.classOf(ip('128.0.0.0')), 'B');
  assert.equal(Net.classOf(ip('191.255.255.255')), 'B');
  assert.equal(Net.classOf(ip('192.0.0.0')), 'C');
  assert.equal(Net.classOf(ip('223.255.255.255')), 'C');
  assert.equal(Net.classOf(ip('224.0.0.0')), 'D');
  assert.equal(Net.classOf(ip('240.0.0.0')), 'E');
  assert.equal(Net.scopeOf(ip('172.15.255.255')), 'public');
  assert.equal(Net.scopeOf(ip('172.16.0.0')), 'private');
  assert.equal(Net.scopeOf(ip('172.31.255.255')), 'private');
  assert.equal(Net.scopeOf(ip('172.32.0.0')), 'public');
  assert.equal(Net.scopeOf(ip('192.168.1.1')), 'private');
  assert.equal(Net.scopeOf(ip('127.0.0.1')), 'loopback');
  assert.equal(Net.scopeOf(ip('195.64.159.184')), 'public');
});

test('VLSM allocates largest first, aligned, and rejects overflow', () => {
  const plan = Net.allocateVlsm(ip('172.20.144.0'), 22, [400, 10, 15, 220]);
  const texts = plan.allocations.map((a) => a.index + ':' + Net.cidrText(a.network, a.prefix));
  assert.deepEqual(texts, ['0:172.20.144.0/23', '3:172.20.146.0/24', '2:172.20.147.0/27', '1:172.20.147.32/28']);
  assert.equal(Net.formatIp(plan.nextFree), '172.20.147.48');
  assert.throws(() => Net.allocateVlsm(ip('10.0.0.0'), 24, [200, 100]), RangeError);
  assert.throws(() => Net.allocateVlsm(ip('10.0.0.0'), 24, [1000]), RangeError);
});

test('splitEqual rounds the count up to a power of two and refuses tiny subnets', () => {
  const plan = Net.splitEqual(ip('10.10.32.0'), 21, 4);
  assert.equal(plan.prefix, 23);
  assert.deepEqual(plan.subnets.map((s) => Net.formatIp(s.network)), ['10.10.32.0', '10.10.34.0', '10.10.36.0', '10.10.38.0']);
  assert.equal(Net.splitEqual(ip('10.0.0.0'), 24, 3).prefix, 26);
  assert.throws(() => Net.splitEqual(ip('10.0.0.0'), 29, 4), RangeError);
});

test('splitIntoBlocks sums to the size and respects the minimum block of 4', () => {
  assert.deepEqual(Net.splitIntoBlocks(32, 3), [16, 8, 8]);
  assert.deepEqual(Net.splitIntoBlocks(16, 4), [4, 4, 4, 4]);
  assert.equal(Net.splitIntoBlocks(16, 5), null);
});
