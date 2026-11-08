(function (root) {
  'use strict';

  const ALL_ONES = 0xffffffff;

  function parseIp(text) {
    if (typeof text !== 'string') return null;
    const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(text);
    if (!m) return null;
    let n = 0;
    for (let i = 1; i <= 4; i++) {
      const octet = Number(m[i]);
      if (octet > 255) return null;
      n = n * 256 + octet;
    }
    return n;
  }

  function formatIp(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  // "a.b.c.d/p" -> { ip, prefix } or null
  function parseCidr(text) {
    if (typeof text !== 'string') return null;
    const m = /^\s*([\d.]+)\s*\/\s*(\d{1,2})\s*$/.exec(text);
    if (!m) return null;
    const ip = parseIp(m[1]);
    const prefix = Number(m[2]);
    if (ip === null || prefix > 32) return null;
    return { ip, prefix };
  }

  function maskInt(prefix) {
    return prefix === 0 ? 0 : (ALL_ONES << (32 - prefix)) >>> 0;
  }

  // dotted mask -> prefix, or null when the mask is not contiguous ones followed by zeros
  function prefixFromMask(maskText) {
    const m = parseIp(maskText);
    if (m === null) return null;
    for (let p = 0; p <= 32; p++) if (maskInt(p) === m) return p;
    return null;
  }

  function networkOf(ip, prefix) {
    return (ip & maskInt(prefix)) >>> 0;
  }

  function broadcastOf(ip, prefix) {
    return (networkOf(ip, prefix) | (~maskInt(prefix) >>> 0)) >>> 0;
  }

  function blockSize(prefix) {
    return Math.pow(2, 32 - prefix);
  }

  // classic count: network and broadcast addresses are not usable, /31 and /32 give 0
  function usableHosts(prefix) {
    return Math.max(0, blockSize(prefix) - 2);
  }

  function log2Ceil(n) {
    let bits = 0;
    while (Math.pow(2, bits) < n) bits++;
    return bits;
  }

  // smallest block (largest prefix) that holds `hosts` usable addresses
  function prefixForHosts(hosts) {
    let hostBits = 2;
    while (Math.pow(2, hostBits) - 2 < hosts) hostBits++;
    return 32 - hostBits;
  }

  function toBin(n, width) {
    return n.toString(2).padStart(width || 1, '0');
  }

  function ipBits(ip) {
    return toBin(ip, 32);
  }

  function cidrText(ip, prefix) {
    return formatIp(ip) + '/' + prefix;
  }

  const CLASS_INFO = {
    A: { first: 1, last: 126, prefix: 8, leadBits: '0', networks: 128, usableNetworks: 126, hosts: 16777214 },
    B: { first: 128, last: 191, prefix: 16, leadBits: '10', networks: 16384, usableNetworks: 16384, hosts: 65534 },
    C: { first: 192, last: 223, prefix: 24, leadBits: '110', networks: 2097152, usableNetworks: 2097152, hosts: 254 },
    D: { first: 224, last: 239, prefix: null, leadBits: '1110', networks: null, usableNetworks: null, hosts: null },
    E: { first: 240, last: 255, prefix: null, leadBits: '1111', networks: null, usableNetworks: null, hosts: null },
  };

  function classOf(ip) {
    const first = ip >>> 24;
    if (first < 128) return 'A';
    if (first < 192) return 'B';
    if (first < 224) return 'C';
    if (first < 240) return 'D';
    return 'E';
  }

  const PRIVATE_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

  function inRange(ip, cidr) {
    const c = parseCidr(cidr);
    return networkOf(ip, c.prefix) === c.ip;
  }

  // 'private' | 'loopback' | 'linklocal' | 'multicast' | 'reserved' | 'public'
  function scopeOf(ip) {
    if (PRIVATE_RANGES.some((r) => inRange(ip, r))) return 'private';
    if (inRange(ip, '127.0.0.0/8')) return 'loopback';
    if (inRange(ip, '169.254.0.0/16')) return 'linklocal';
    if (inRange(ip, '0.0.0.0/8')) return 'reserved';
    const cls = classOf(ip);
    if (cls === 'D') return 'multicast';
    if (cls === 'E') return 'reserved';
    return 'public';
  }

  function describe(ip, prefix) {
    const network = networkOf(ip, prefix);
    const broadcast = broadcastOf(ip, prefix);
    const hasHosts = prefix <= 30;
    return {
      ip,
      prefix,
      mask: maskInt(prefix),
      network,
      broadcast,
      first: hasHosts ? network + 1 : null,
      last: hasHosts ? broadcast - 1 : null,
      size: blockSize(prefix),
      hosts: usableHosts(prefix),
    };
  }

  // VLSM: biggest requirement first, each from the first free address.
  // Returns entries in allocation order; `index` points to the requirement's original position.
  function allocateVlsm(parentIp, parentPrefix, hostRequirements) {
    const start = networkOf(parentIp, parentPrefix);
    const end = broadcastOf(parentIp, parentPrefix);
    const order = hostRequirements
      .map((hosts, index) => ({ hosts, index }))
      .sort((a, b) => b.hosts - a.hosts || a.index - b.index);
    let cursor = start;
    const result = [];
    for (const req of order) {
      const prefix = prefixForHosts(req.hosts);
      const size = blockSize(prefix);
      cursor = Math.ceil(cursor / size) * size;
      if (prefix < parentPrefix || cursor + size - 1 > end) {
        throw new RangeError('Wymagania nie mieszczą się w sieci nadrzędnej');
      }
      result.push({ ...req, prefix, network: cursor, broadcast: cursor + size - 1, size });
      cursor += size;
    }
    return { start, end, allocations: result, nextFree: cursor };
  }

  // FLSM: `count` equal subnets taken from the start of the parent block.
  function splitEqual(parentIp, parentPrefix, count) {
    const bits = log2Ceil(count);
    const prefix = parentPrefix + bits;
    if (prefix > 30) throw new RangeError('Podsieci byłyby zbyt małe');
    const start = networkOf(parentIp, parentPrefix);
    const size = blockSize(prefix);
    const subnets = [];
    for (let i = 0; i < count; i++) {
      const network = start + i * size;
      subnets.push({ network, prefix, broadcast: network + size - 1, size });
    }
    return { bits, prefix, subnets };
  }

  // Split `size` addresses into `parts` power-of-two blocks (each at least 4), halving the largest block.
  // Returns blocks largest first, or null when impossible.
  function splitIntoBlocks(size, parts) {
    const blocks = [size];
    while (blocks.length < parts) {
      blocks.sort((a, b) => b - a);
      if (blocks[0] < 8) return null;
      const half = blocks[0] / 2;
      blocks.splice(0, 1, half, half);
    }
    return blocks.sort((a, b) => b - a);
  }

  const api = {
    parseIp, formatIp, parseCidr, maskInt, prefixFromMask, networkOf, broadcastOf, blockSize,
    usableHosts, log2Ceil, prefixForHosts, toBin, ipBits, cidrText, CLASS_INFO, classOf,
    PRIVATE_RANGES, scopeOf, describe, allocateVlsm, splitEqual, splitIntoBlocks,
  };
  root.Net = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
