/* Morse Code Card app */
(function () {
  'use strict';

  // --- Morse tree (left = dot, right = dash) ---------------------------------
  // Standard international Morse, depth 1..4 = letters covered by the chart.
  // Each node has: letter, code, optional dot/dash child nodes.
  // Missing dot/dash branches (e.g. accented characters) render as placeholders.
  function n(letter, code, dot, dash) {
    return { letter: letter, code: code, dot: dot || null, dash: dash || null };
  }

  const TREE_ROOT = {
    dot: n('E', '.',
      n('I', '..',
        n('S', '...', n('H', '....'), n('V', '...-')),
        n('U', '..-', n('F', '..-.'), n('Ü', '..--'))
      ),
      n('A', '.-',
        n('R', '.-.', n('L', '.-..'), n('Ä', '.-.-')),
        n('W', '.--', n('P', '.--.'), n('J', '.---'))
      )
    ),
    dash: n('T', '-',
      n('N', '-.',
        n('D', '-..', n('B', '-...'), n('X', '-..-')),
        n('K', '-.-', n('C', '-.-.'), n('Y', '-.--'))
      ),
      n('M', '--',
        n('G', '--.', n('Z', '--..'), n('Q', '--.-')),
        n('O', '---', n('Ö', '---.'), n('CH', '----'))
      )
    ),
  };

  const rows = [[], [], [], []]; // depth 1..4 (index 0..3)
  const byPath = new Map();
  byPath.set('', { letter: '', code: '', path: '' });

  function buildRows(node, path, depth) {
    const entry = { letter: node.letter, code: node.code, path: path };
    rows[depth - 1].push(entry);
    byPath.set(path, entry);
    if (depth >= 4) return;
    if (node.dot) buildRows(node.dot, path + '.', depth + 1);
    else addPlaceholders(depth + 1, path + '.');
    if (node.dash) buildRows(node.dash, path + '-', depth + 1);
    else addPlaceholders(depth + 1, path + '-');
  }

  function addPlaceholders(depth, path) {
    rows[depth - 1].push({ letter: '', code: '', path: path, placeholder: true });
    if (depth >= 4) return;
    addPlaceholders(depth + 1, path + '.');
    addPlaceholders(depth + 1, path + '-');
  }

  buildRows(TREE_ROOT.dot, '.', 1);
  buildRows(TREE_ROOT.dash, '-', 1);

  // --- Render the chart -----------------------------------------------------
  const chartEl = document.getElementById('chart');
  const nodeEls = new Map(); // path -> element

  rows.forEach((row, idx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'chart-row';
    rowEl.dataset.depth = String(idx + 1);
    row.forEach((entry) => {
      const el = document.createElement('div');
      if (!entry || entry.placeholder) {
        el.className = 'node placeholder';
        el.innerHTML = '<span class="letter">·</span><span class="code"></span>';
      } else {
        el.className = 'node';
        el.dataset.path = entry.path;
        el.innerHTML =
          '<span class="letter">' + entry.letter + '</span>' +
          '<span class="code">' + entry.code.replace(/\./g, '•').replace(/-/g, '–') + '</span>';
        nodeEls.set(entry.path, el);
      }
      rowEl.appendChild(el);
    });
    chartEl.appendChild(rowEl);
  });

  // --- Audio ---------------------------------------------------------------
  let audioCtx = null;
  let toneOsc = null;
  let toneGain = null;
  const TONE_FREQ = 600;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTap() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = TONE_FREQ;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.005);
    gain.gain.setValueAtTime(0.25, t0 + 0.07);
    gain.gain.linearRampToValueAtTime(0, t0 + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  function startTone() {
    const ctx = ensureAudio();
    if (!ctx) return;
    stopTone();
    toneOsc = ctx.createOscillator();
    toneGain = ctx.createGain();
    toneOsc.type = 'sine';
    toneOsc.frequency.value = TONE_FREQ;
    const t0 = ctx.currentTime;
    toneGain.gain.setValueAtTime(0, t0);
    toneGain.gain.linearRampToValueAtTime(0.25, t0 + 0.01);
    toneOsc.connect(toneGain).connect(ctx.destination);
    toneOsc.start(t0);
  }

  function stopTone() {
    if (!audioCtx || !toneOsc || !toneGain) return;
    const t0 = audioCtx.currentTime;
    try {
      toneGain.gain.cancelScheduledValues(t0);
      toneGain.gain.setValueAtTime(toneGain.gain.value, t0);
      toneGain.gain.linearRampToValueAtTime(0, t0 + 0.02);
      toneOsc.stop(t0 + 0.03);
    } catch (_) {}
    toneOsc = null;
    toneGain = null;
  }

  // --- State / interaction -------------------------------------------------
  const messageEl = document.getElementById('message');
  const currentEl = document.getElementById('current');
  const keyEl = document.getElementById('key');
  const clearBtn = document.getElementById('clearBtn');
  const spaceBtn = document.getElementById('spaceBtn');

  let currentCode = '';        // current in-progress morse code, e.g. ".-"
  let message = '';            // committed text
  let commitTimer = null;
  const COMMIT_MS = 500;       // pause that commits the letter
  const HOLD_MS = 180;         // press longer than this = dash (tap otherwise)

  let pressStart = 0;
  let holdTimer = null;
  let isHolding = false;       // currently rendering a hold (tone on)
  let pressActive = false;

  function refreshDisplay() {
    messageEl.textContent = message;
    currentEl.textContent = currentCode
      ? ' ' + currentCode.replace(/\./g, '•').replace(/-/g, '–')
      : '';
    highlightPath(currentCode);
  }

  function highlightPath(code) {
    // Clear all
    nodeEls.forEach((el) => el.classList.remove('path', 'active'));
    if (!code) return;
    // Mark each prefix as on-path, last one as active.
    let prefix = '';
    for (let i = 0; i < code.length; i++) {
      prefix += code[i];
      const el = nodeEls.get(prefix);
      if (!el) continue;
      if (i === code.length - 1) el.classList.add('active');
      else el.classList.add('path');
    }
  }

  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitLetter, COMMIT_MS);
  }

  function commitLetter() {
    if (!currentCode) return;
    const entry = byPath.get(currentCode);
    if (entry && entry.letter) {
      message += entry.letter;
    } else {
      message += '?';
    }
    currentCode = '';
    refreshDisplay();
  }

  function addSymbol(sym) {
    // Don't grow past depth 4 (chart limit).
    if (currentCode.length >= 4) {
      // Force-commit current then start fresh.
      commitLetter();
    }
    const next = currentCode + sym;
    // If the next path doesn't exist in the chart, still accept but mark unknown.
    currentCode = next;
    refreshDisplay();
    scheduleCommit();
  }

  function onPressDown(ev) {
    if (ev.cancelable) ev.preventDefault();
    if (pressActive) return;
    pressActive = true;
    keyEl.classList.add('pressed');
    pressStart = performance.now();
    isHolding = false;
    clearTimeout(commitTimer);

    holdTimer = setTimeout(() => {
      // Became a hold: start tone and tentatively treat as dash.
      isHolding = true;
      startTone();
    }, HOLD_MS);
  }

  function onPressUp(ev) {
    if (ev && ev.cancelable) ev.preventDefault();
    if (!pressActive) return;
    pressActive = false;
    keyEl.classList.remove('pressed');
    clearTimeout(holdTimer);

    if (isHolding) {
      stopTone();
      addSymbol('-');
    } else {
      playTap();
      addSymbol('.');
    }
    isHolding = false;
  }

  // Pointer events cover mouse + touch + pen.
  keyEl.addEventListener('pointerdown', onPressDown);
  keyEl.addEventListener('pointerup', onPressUp);
  keyEl.addEventListener('pointercancel', onPressUp);
  keyEl.addEventListener('pointerleave', (e) => { if (pressActive) onPressUp(e); });
  // Prevent context menu on long press.
  keyEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // Keyboard support: Space / Enter as the key.
  let kbDownAt = 0;
  let kbHolding = false;
  let kbHoldTimer = null;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    kbDownAt = performance.now();
    kbHolding = false;
    keyEl.classList.add('pressed');
    clearTimeout(commitTimer);
    kbHoldTimer = setTimeout(() => { kbHolding = true; startTone(); }, HOLD_MS);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    clearTimeout(kbHoldTimer);
    keyEl.classList.remove('pressed');
    if (kbHolding) { stopTone(); addSymbol('-'); }
    else { playTap(); addSymbol('.'); }
    kbHolding = false;
  });

  clearBtn.addEventListener('click', () => {
    message = '';
    currentCode = '';
    clearTimeout(commitTimer);
    refreshDisplay();
  });

  spaceBtn.addEventListener('click', () => {
    // Commit any in-progress letter, then add a space.
    clearTimeout(commitTimer);
    if (currentCode) commitLetter();
    if (message.length && message[message.length - 1] !== ' ') {
      message += ' ';
    }
    refreshDisplay();
  });

  refreshDisplay();
})();
