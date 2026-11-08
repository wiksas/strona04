(function (root) {
  'use strict';

  const KEY = 'podsieci:v1';
  const THEME_KEY = 'podsieci:theme';
  const MAX_TESTS = 10;

  // 'ok' | 'unavailable' (browser blocks storage) | 'reset' (stored data was unreadable and was dropped)
  let status = 'ok';

  const empty = () => ({ types: {}, tests: [] });

  function validShape(data) {
    return data && typeof data === 'object' && data.types && typeof data.types === 'object' && Array.isArray(data.tests);
  }

  function load() {
    let raw;
    try {
      raw = root.localStorage.getItem(KEY);
    } catch (err) {
      status = 'unavailable';
      return empty();
    }
    if (raw === null) return empty();
    try {
      const data = JSON.parse(raw);
      if (validShape(data)) return data;
    } catch (err) {
      // falls through to reset
    }
    status = 'reset';
    return empty();
  }

  let data = load();

  function save() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(data));
      if (status === 'unavailable') status = 'ok';
    } catch (err) {
      status = 'unavailable';
    }
  }

  function recordTask(typeId, correct, total) {
    const t = data.types[typeId] || { tasks: 0, perfect: 0, correct: 0, total: 0 };
    t.tasks += 1;
    t.perfect += correct === total ? 1 : 0;
    t.correct += correct;
    t.total += total;
    data.types[typeId] = t;
    save();
  }

  function recordTest(entry) {
    data.tests.unshift(entry);
    data.tests.length = Math.min(data.tests.length, MAX_TESTS);
    save();
  }

  function clear() {
    data = empty();
    save();
  }

  function getTheme() {
    try {
      const t = root.localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch (err) {
      return null;
    }
  }

  function setTheme(theme) {
    try {
      root.localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      // theme still applies for this visit
    }
  }

  root.Store = {
    get status() { return status; },
    acknowledge() { if (status === 'reset') status = 'ok'; },
    typeStats: (typeId) => data.types[typeId] || null,
    totals() {
      const all = Object.values(data.types);
      return all.reduce(
        (sum, t) => ({ tasks: sum.tasks + t.tasks, correct: sum.correct + t.correct, total: sum.total + t.total }),
        { tasks: 0, correct: 0, total: 0 }
      );
    },
    tests: () => data.tests.slice(),
    recordTask, recordTest, clear, getTheme, setTheme,
  };
})(globalThis);
