(function (root) {
  'use strict';

  const Net = root.Net;

  // ---------- DOM helpers ----------

  function append(parent, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach((c) => append(parent, c));
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    append(el, children);
    return el;
  }

  // **bold**, `code`, _{subscript}, ^{superscript}
  function rich(text) {
    const frag = document.createDocumentFragment();
    String(text)
      .split(/(\*\*[^*]+\*\*|`[^`]+`|_\{[^}]+\}|\^\{[^}]+\})/)
      .forEach((part) => {
        if (!part) return;
        if (part.startsWith('**')) frag.appendChild(h('strong', null, part.slice(2, -2)));
        else if (part.startsWith('`')) frag.appendChild(h('code', null, part.slice(1, -1)));
        else if (part.startsWith('_{')) frag.appendChild(h('sub', null, part.slice(2, -1)));
        else if (part.startsWith('^{')) frag.appendChild(h('sup', null, part.slice(2, -1)));
        else frag.appendChild(document.createTextNode(part));
      });
    return frag;
  }

  // ---------- bit strips (identity motif) ----------

  function bitCells(bits, offset, prefix) {
    return h(
      'span',
      { class: 'octet', 'aria-hidden': 'true' },
      bits.split('').map((bit, i) => {
        const index = offset + i;
        const cls = ['bit', index < prefix ? 'is-net' : 'is-host'];
        if (index === prefix && index > 0) cls.push('is-edge');
        return h('span', { class: cls.join(' ') }, bit);
      })
    );
  }

  // rows: [{ label, ip }]; the prefix boundary is drawn on every row
  function bitRows({ prefix, rows }) {
    return h(
      'div',
      { class: 'bitrows' },
      rows.map((row) => {
        const bits = Net.ipBits(row.ip);
        const dotted = Net.formatIp(row.ip);
        const spoken = row.label + ': ' + dotted + ', binarnie ' + bits.match(/.{8}/g).join(' ') + ', prefiks ' + prefix + ' bitów sieci';
        return h(
          'div',
          { class: 'bitrow', role: 'group', 'aria-label': spoken },
          h('span', { class: 'bitrow-label', 'aria-hidden': 'true' }, row.label),
          h('span', { class: 'bitrow-bits' }, [0, 1, 2, 3].map((o) => bitCells(bits.slice(o * 8, o * 8 + 8), o * 8, prefix))),
          h('span', { class: 'bitrow-dec mono', 'aria-hidden': 'true' }, dotted)
        );
      })
    );
  }

  function weightsStrip(bitsText) {
    const bits = bitsText.padStart(8, '0');
    const spoken = 'Pozycje od lewej: ' + bits.split('').map((b, i) => Math.pow(2, bits.length - 1 - i) + ' ma ' + b).join(', ');
    return h(
      'div',
      { class: 'weights', role: 'img', 'aria-label': spoken },
      bits.split('').map((bit, i) =>
        h(
          'span',
          { class: 'weight' + (bit === '1' ? ' is-one' : ''), 'aria-hidden': 'true' },
          h('span', { class: 'weight-value' }, String(Math.pow(2, bits.length - 1 - i))),
          h('span', { class: 'weight-bit' }, bit)
        )
      )
    );
  }

  // ---------- worked solution ----------

  function table({ head, rows }) {
    return h(
      'div',
      { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabela, przewijana poziomo' },
      h(
        'table',
        null,
        h('thead', null, h('tr', null, head.map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : null, c)))))
      )
    );
  }

  function solutionBlocks(blocks) {
    return h(
      'div',
      { class: 'solution-body' },
      blocks.map((block) => {
        if (typeof block === 'string') return h('p', null, rich(block));
        if (block.table) return table(block.table);
        if (block.weights) return weightsStrip(block.weights.bits);
        if (block.bitrows) return bitRows(block.bitrows);
        return null;
      })
    );
  }

  // ---------- task form ----------

  let uid = 0;

  function feedbackText(res) {
    if (res.ok) return 'Poprawnie.';
    return 'Błąd. ' + (res.message || '') + (res.expected ? ' Poprawna odpowiedź: ' + res.expected : '');
  }

  // opts: { onInput(), onSubmit(), answers }
  function taskForm(task, opts) {
    const options = opts || {};
    const prefix = 'f' + ++uid;
    const controls = {};
    let locked = false;

    const form = h('form', {
      class: 'task-form',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        if (!locked && options.onSubmit) options.onSubmit();
      },
    });
    form.addEventListener('input', () => options.onInput && options.onInput());
    form.addEventListener('change', () => options.onInput && options.onInput());

    form.appendChild(
      h('div', { class: 'prompt' }, task.prompt.map((p) => (typeof p === 'string' ? h('p', null, rich(p)) : h('ul', null, p.list.map((item) => h('li', null, rich(item)))))))
    );

    // fields that share a `group` sit together under one legend
    let container = form;
    let currentGroup = null;

    task.fields.forEach((field) => {
      if ((field.group || null) !== currentGroup) {
        currentGroup = field.group || null;
        container = currentGroup ? h('fieldset', { class: 'group' }, h('legend', null, currentGroup)) : form;
        if (currentGroup) form.appendChild(container);
      }
      const base = prefix + '-' + field.id;
      const hint = h('span', { class: 'hint', id: base + '-hint' }, field.hint);
      const feedback = h('p', { class: 'feedback', id: base + '-fb', hidden: true });

      if (field.kind === 'text') {
        const input = h('input', {
          type: 'text', id: base, name: field.id, class: field.mono ? 'mono' : null, autocomplete: 'off',
          autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-describedby': base + '-hint ' + base + '-fb',
        });
        const wrap = h('div', { class: field.wide ? 'field is-wide' : 'field' }, h('label', { for: base }, field.label), hint, input, feedback);
        controls[field.id] = { kind: 'text', wrap, feedback, input };
        container.appendChild(wrap);
      } else if (field.kind === 'choice') {
        const radios = field.options.map((text, i) => {
          const input = h('input', { type: 'radio', name: base, value: String(i), 'aria-describedby': base + '-fb' });
          const label = h('label', { class: 'option' }, input, h('span', null, text));
          return { input, label, text };
        });
        const wrap = h(
          'fieldset',
          { class: 'field' },
          h('legend', null, field.label),
          hint,
          h('div', { class: 'options' }, radios.map((r) => r.label)),
          feedback
        );
        controls[field.id] = { kind: 'choice', wrap, feedback, radios };
        container.appendChild(wrap);
      } else if (field.kind === 'list') {
        const list = h('ol', { class: 'rows' });
        const rows = [];
        const addButton = h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { addRow(''); if (options.onInput) options.onInput(); } }, field.addLabel);
        const wrap = h('fieldset', { class: 'field is-list' }, h('legend', null, field.label), hint, list, h('div', { class: 'row-actions' }, addButton), feedback);

        const renumber = () => {
          rows.forEach((row, i) => {
            row.label.textContent = 'Podsieć ' + (i + 1);
            row.remove.setAttribute('aria-label', 'Usuń podsieć ' + (i + 1));
            row.remove.disabled = rows.length === 1 || locked;
          });
        };
        function addRow(value) {
          const id = base + '-r' + ++uid;
          const label = h('label', { for: id });
          const input = h('input', {
            type: 'text', id, class: 'mono', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
            spellcheck: 'false', 'aria-describedby': base + '-hint ' + id + '-fb',
          });
          input.value = value;
          const rowFeedback = h('p', { class: 'feedback', id: id + '-fb', hidden: true });
          const remove = h('button', {
            type: 'button', class: 'btn btn-quiet',
            onclick: () => {
              const at = rows.findIndex((r) => r.remove === remove);
              rows[at].item.remove();
              rows.splice(at, 1);
              renumber();
              if (options.onInput) options.onInput();
            },
          }, 'Usuń');
          const item = h('li', { class: 'row' }, h('div', { class: 'row-line' }, label, input, remove), rowFeedback);
          rows.push({ item, label, input, remove, feedback: rowFeedback });
          list.appendChild(item);
          renumber();
        }
        addRow('');
        addRow('');
        controls[field.id] = { kind: 'list', wrap, feedback, rows, addRow, addButton, renumber, list };
        container.appendChild(wrap);
      }
    });

    function getAnswers() {
      const answers = {};
      task.fields.forEach((field) => {
        const c = controls[field.id];
        if (c.kind === 'text') answers[field.id] = c.input.value;
        else if (c.kind === 'choice') answers[field.id] = (c.radios.find((r) => r.input.checked) || { input: { value: '' } }).input.value;
        else answers[field.id] = c.rows.map((r) => r.input.value);
      });
      return answers;
    }

    function setAnswers(answers) {
      task.fields.forEach((field) => {
        const c = controls[field.id];
        const value = answers[field.id];
        if (value == null) return;
        if (c.kind === 'text') c.input.value = value;
        else if (c.kind === 'choice') c.radios.forEach((r) => (r.input.checked = r.input.value === value));
        else {
          while (c.rows.length > Math.max(2, value.length)) c.rows.pop().item.remove();
          while (c.rows.length < value.length) c.addRow('x');
          c.rows.forEach((r, i) => (r.input.value = value[i] || ''));
          c.renumber();
        }
      });
    }

    function hasAnyAnswer() {
      return Object.values(getAnswers()).some((v) => (Array.isArray(v) ? v.some((x) => x.trim() !== '') : String(v).trim() !== ''));
    }

    function show(el, res) {
      el.hidden = false;
      el.textContent = feedbackText(res);
    }

    function reveal(result) {
      locked = true;
      task.fields.forEach((field) => {
        const c = controls[field.id];
        const res = result.fields[field.id];
        c.wrap.classList.add(res.ok ? 'is-ok' : 'is-bad');
        show(c.feedback, res);
        if (c.kind === 'text') {
          c.input.readOnly = true;
        } else if (c.kind === 'choice') {
          c.radios.forEach((r) => {
            r.input.disabled = true;
            if (!res.ok && r.text === res.expected) r.label.classList.add('is-answer');
          });
        } else {
          c.rows.forEach((r, i) => {
            r.input.readOnly = true;
            const rowRes = res.rows && res.rows[i];
            if (rowRes && rowRes.ok === false) {
              r.item.classList.add('is-bad');
              r.feedback.hidden = false;
              r.feedback.textContent = 'Błąd. ' + rowRes.message;
            }
          });
          c.addButton.disabled = true;
          c.renumber();
        }
      });
    }

    if (options.answers) setAnswers(options.answers);
    return { el: form, getAnswers, setAnswers, hasAnyAnswer, reveal };
  }

  // ---------- dialog, live region ----------

  function confirmDialog({ title, body, confirmLabel, cancelLabel }) {
    return new Promise((resolve) => {
      const dialog = h(
        'dialog',
        { class: 'dialog', 'aria-labelledby': 'dialog-title' },
        h('h2', { id: 'dialog-title' }, title),
        h('p', null, body),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => dialog.close('confirm') }, confirmLabel),
          h('button', { type: 'button', class: 'btn', onclick: () => dialog.close('cancel') }, cancelLabel)
        )
      );
      dialog.addEventListener('close', () => {
        const confirmed = dialog.returnValue === 'confirm';
        dialog.remove();
        resolve(confirmed);
      });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  function announce(message) {
    const live = document.getElementById('live');
    if (!live) return;
    live.textContent = '';
    // a new text node each time so repeated messages are read again
    setTimeout(() => (live.textContent = message), 30);
  }

  root.UI = { h, rich, bitRows, weightsStrip, table, solutionBlocks, taskForm, confirmDialog, announce };
})(globalThis);
