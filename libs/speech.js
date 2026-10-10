// Speech: Ms. Menna's voice, shared by the games. It reads text out loud with the
// browser's built-in voices (no sound files) through EasySpeech, which works around
// browser bugs such as Chrome cutting off long sentences and voices loading late.
//
// Load EasySpeech first, then this file:
//   <script src="./libs/easy-speech-2.4.0.js"></script>
//   <script src="./libs/speech.js"></script>
//
// Use:
//   Speech.setup({ words: [[/💎/g, ' gems']] }); // optional, before the first speak()
//   Speech.speak('7 × 8 = 56! 🐾');              // says "7 times 8 equals 56!"
//   Speech.speak('Next one!', { after: true });  // waits for the line being said to finish
//   Speech.stop();
//   Speech.setMuted(true);
//   Speech.openPicker();                         // lets a grown-up pick the voice and speed
//   Speech.setup({ onTalk: what => {} });        // 'start', 'word' and 'end' of each line, to move a mouth
//
// A button with class "speech-voice-btn" gets the picker's look, placed in the top-left
// corner of its nearest positioned parent.
(function () {
  const synth = window.speechSynthesis;
  const supported = !!(synth && window.SpeechSynthesisUtterance && window.EasySpeech);

  // The same teacher voice in every game.
  const settings = {
    best: ['Ava', 'Zoe', 'Samantha', 'Allison', 'Susan'], // preferred Premium or Enhanced voices
    voices: ['Samantha', 'Karen', 'Moira'], // standard Apple voices, used when no better one is downloaded
    rate: 0.95,
    pitch: 1.15,
    sample: "Hi! I'm Ms. Menna. Let's do some math!",
    words: [], // game-specific [pattern, replacement] pairs, applied before the shared ones
    onTalk: null, // called with 'start' when a line starts, 'word' at each word if the voice reports words, and 'end'
  };

  // Math symbols are read as words. Emoji are dropped. "Grrr" has no vowel, so voices spell it out as letters. She says "Ruff ruff" instead.
  const SHARED_WORDS = [
    [/\b([Gg])r{2,}\b/g, (_, g) => (g === 'G' ? 'R' : 'r') + 'uff ruff'],
    [/×/g, ' times '],
    [/÷/g, ' divided by '],
    [/−/g, ' minus '],
    [/\+/g, ' plus '],
    [/=/g, ' equals '],
    [/(\d+)¢/g, '$1 cents'],
    [/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, ''],
    [/\s+([!?.,])/g, '$1'],
    [/\s{2,}/g, ' '],
  ];

  // Mac sound-effect voices that sing or buzz instead of talking.
  const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/;

  const SPEEDS = { slow: 0.8, normal: 1, fast: 1.2 }; // multiplies settings.rate
  const SPEED_NAMES = ['slow', 'normal', 'fast'];

  let muted = false;
  // Every line gets a number. speak() and stop() drop all lines before theirs, so a late line never talks
  // over a newer one. A line said `after` waits for the one before it, then a short breath, so waiting lines
  // are said in order.
  let count = 0;
  let cut = 0; // lines numbered below this are dropped
  const GAP = 350;
  let current = Promise.resolve(); // settles when the newest line ends or is dropped
  let quietSince = 0;
  let talking = 0; // the number of the line being said, so a late event from a cut-off line is ignored
  const tell = what => { try { if (settings.onTalk) settings.onTalk(what); } catch { /* never block speech on a mouth */ } };
  const hush = line => { if (talking && (!line || talking === line)) { talking = 0; tell('end'); } };
  const pause = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  // iOS Safari sometimes never sends `end`, so a waiting line stops waiting after about as long as the line takes.
  const lineTime = (words, rate) => 1500 + words.length * 80 / rate;

  // ===== SAVED CHOICE =====
  // Saved in localStorage with a cookie copy, like the piggy bank, so it survives if either one is
  // cleared. Every game on the site shares it.
  const STORE_KEY = 'mennaVoice';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // Browsers cap cookie lifetime at 400 days.

  function readSaved() {
    const found = [];
    try { found.push(JSON.parse(localStorage.getItem(STORE_KEY))); } catch { /* storage may be unavailable */ }
    const match = document.cookie.match(new RegExp('(?:^|; )' + STORE_KEY + '=([^;]*)'));
    if (match) try { found.push(JSON.parse(decodeURIComponent(match[1]))); } catch { /* broken cookie */ }
    const saved = found.filter(s => s && typeof s === 'object')
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0] || {};
    return {
      voice: typeof saved.voice === 'string' ? saved.voice : '', // voiceURI, or '' for the best voice
      speed: SPEED_NAMES.includes(saved.speed) ? saved.speed : 'normal',
      savedAt: Number.isFinite(saved.savedAt) ? saved.savedAt : 0,
    };
  }

  const choice = readSaved();

  function save() {
    choice.savedAt = Date.now();
    const json = JSON.stringify(choice);
    try { localStorage.setItem(STORE_KEY, json); } catch { /* storage may be unavailable in private mode */ }
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${STORE_KEY}=${encodeURIComponent(json)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax${secure}`;
  }

  // ===== VOICES =====
  // Read fresh each time, so a voice downloaded while the page is open shows up.
  function englishVoices() {
    if (!supported) return [];
    return synth.getVoices().filter(v => /^en/i.test(v.lang) && !NOVELTY.test(v.name));
  }

  const quality = v => /premium/i.test(v.name) ? 0 : /enhanced/i.test(v.name) ? 1 : 2;

  function bestVoice(voices) {
    for (const level of [0, 1]) {
      for (const name of settings.best) {
        const found = voices.find(v => quality(v) === level && v.name.startsWith(name));
        if (found) return found;
      }
    }
    for (const name of settings.voices) {
      const exact = voices.find(v => v.name === name);
      if (exact) return exact;
    }
    return voices.find(v => settings.voices.some(name => v.name.includes(name))) ||
      voices.find(v => /^en[-_]US/i.test(v.lang)) ||
      voices[0] ||
      null;
  }

  // The picked voice, or the best one if nothing was picked or it's gone from this device.
  function currentVoice() {
    const voices = englishVoices();
    return (choice.voice && voices.find(v => v.voiceURI === choice.voice)) || bestVoice(voices);
  }

  // Voices load in the background as soon as the page opens. Resolves to true when they are ready.
  const ready = supported
    ? EasySpeech.init({ maxTimeout: 5000, interval: 250, quiet: true }).catch(() => false)
    : Promise.resolve(false);

  // ===== SPEAKING =====
  function clean(text) {
    let out = String(text || '');
    for (const [pattern, replacement] of settings.words.concat(SHARED_WORDS)) out = out.replace(pattern, replacement);
    return out.trim();
  }

  function cancel() {
    if (!supported) return;
    hush();
    try { EasySpeech.cancel(); } catch { synth.cancel(); } // EasySpeech throws until its voices load
  }

  function talk(text, evenWhenMuted, after) {
    const mine = ++count;
    if (!after) { cut = mine; cancel(); }
    const words = clean(text);
    if (!supported || (muted && !evenWhenMuted) || !words) return;
    const waited = after ? current.then(() => pause(quietSince + GAP - Date.now())) : null;
    let finished;
    current = new Promise(resolve => { finished = resolve; });
    Promise.all([ready, waited]).then(([ok]) => {
      if (mine < cut) return finished();
      // force: still try the default voice if this browser never listed its voices
      // noStop: if the wait gave up early, the browser still lets the last line finish first
      const options = {
        text: words, rate: Math.round(settings.rate * SPEEDS[choice.speed] * 100) / 100, pitch: settings.pitch, volume: 1, force: !ok, noStop: !!after,
      };
      const voice = currentVoice();
      if (voice) options.voice = voice;
      options.start = () => { if (mine >= cut) { talking = mine; tell('start'); } };
      // Chrome also reports sentences; only words move the mouth.
      options.boundary = e => { if (talking === mine && e.name !== 'sentence') tell('word'); };
      options.end = options.error = () => hush(mine);
      let done = Promise.resolve();
      try {
        done = EasySpeech.speak(options).catch(() => {}); // rejects when cut off by the next speak()
      } catch { /* never block gameplay on speech */ }
      Promise.race([done, pause(lineTime(words, options.rate))]).then(() => { hush(mine); quietSince = Date.now(); finished(); });
    });
  }

  // Says `text`. Stops anything being said first, or with { after: true } lets it finish. Does nothing when muted.
  function speak(text, { after = false } = {}) {
    talk(text, false, after);
  }

  function stop() {
    hush();
    cut = ++count;
    cancel();
    current = Promise.resolve(); // nothing is being said, so the next `after` line need not wait
  }

  // Settles when every line said so far has ended or been dropped, so a game can wait to show its next bubble.
  // Like a waiting line, it gives up after about as long as the line takes.
  function idle() {
    return current;
  }

  function setMuted(on) {
    muted = !!on;
    if (muted) stop();
  }

  function setup(options = {}) {
    Object.assign(settings, options);
  }

  // iOS Safari only speaks after a first speak() inside a tap, so a silent one unlocks it.
  function unlock() {
    document.removeEventListener('touchend', unlock, true);
    document.removeEventListener('click', unlock, true);
    if (!supported) return;
    const utt = new SpeechSynthesisUtterance(' ');
    utt.volume = 0;
    synth.speak(utt);
  }
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click', unlock, true);

  // ===== VOICE PICKER =====
  const style = document.createElement('style');
  style.textContent = `
    .speech-voice-btn {
      position: absolute; top: 12px; left: 12px; z-index: 5;
      width: 48px; height: 48px; border-radius: 50%;
      border: 3px solid #FFD6B0; background: #fff; box-shadow: 0 3px 0 #EEC89A;
      font-size: 1.4rem; line-height: 1; cursor: pointer;
    }
    .speech-picker {
      position: fixed; inset: 0; z-index: 1000;
      display: flex; align-items: center; justify-content: center;
      padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
      background: rgba(92, 61, 30, 0.45);
    }
    .speech-picker[hidden] { display: none; }
    .speech-card {
      width: min(440px, 100%); max-height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch;
      background: #FFFCF8; border: 3px solid #FFE0C0; border-radius: 28px;
      padding: 20px 18px; box-shadow: 0 8px 40px rgba(92, 61, 30, 0.25);
      color: #5C3D1E; text-align: center;
    }
    .speech-card h2 { margin: 0 0 6px; font-size: 1.5rem; }
    .speech-label { margin: 14px 0 8px; font-weight: 800; }
    .speech-card button { font: inherit; color: inherit; cursor: pointer; }
    .speech-speeds { display: flex; gap: 8px; }
    .speech-speeds button, .speech-voices button {
      min-height: 48px; border: 3px solid #FFD6B0; border-radius: 16px; background: #fff;
    }
    .speech-speeds button { flex: 1; font-weight: 700; }
    .speech-voices { display: flex; flex-direction: column; gap: 6px; }
    .speech-voices button { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 14px; text-align: left; }
    .speech-voices small { opacity: 0.6; text-align: right; }
    .speech-card button.on { border-color: #FF8C42; background: #FFF1DE; font-weight: 800; }
    .speech-tip { margin: 12px 0 0; font-size: 0.85rem; opacity: 0.75; }
    .speech-card .speech-done {
      margin-top: 16px; padding: 12px 40px; border: none; border-radius: 50px;
      background: #FF8C42; color: #fff; font-weight: 800; font-size: 1.2rem; box-shadow: 0 4px 0 #D9702E;
    }
  `;
  document.head.appendChild(style);

  let panel = null;

  function regionOf(lang) {
    const code = (lang.split(/[-_]/)[1] || '').toUpperCase();
    if (!code) return '';
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'speech-picker';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', "Ms. Menna's voice");
    panel.innerHTML = `
      <div class="speech-card">
        <h2>🗣️ Ms. Menna's voice</h2>
        <p class="speech-label">Speed</p>
        <div class="speech-speeds">
          <button type="button" data-speed="slow">🐢 Slow</button>
          <button type="button" data-speed="normal">🐕 Normal</button>
          <button type="button" data-speed="fast">🐇 Fast</button>
        </div>
        <p class="speech-label">Voice</p>
        <div class="speech-voices"></div>
        <p class="speech-tip">Want a nicer voice? On iPhone or iPad, download one in Settings → Accessibility → Spoken Content → Voices → English. Premium voices sound best.</p>
        <button type="button" class="speech-done">Done</button>
      </div>`;
    panel.addEventListener('click', e => {
      const speed = e.target.closest('[data-speed]');
      const voice = e.target.closest('[data-voice]');
      if (speed) {
        choice.speed = speed.dataset.speed;
      } else if (voice) {
        choice.voice = voice.dataset.voice;
      } else {
        if (e.target === panel || e.target.closest('.speech-done')) closePicker();
        return;
      }
      save();
      renderPicker();
      talk(settings.sample, true); // a grown-up is choosing, so play the sample even when muted
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closePicker(); });
    document.body.appendChild(panel);
  }

  function renderPicker() {
    for (const btn of panel.querySelectorAll('[data-speed]')) {
      btn.classList.toggle('on', btn.dataset.speed === choice.speed);
      btn.setAttribute('aria-pressed', btn.dataset.speed === choice.speed);
    }
    const list = panel.querySelector('.speech-voices');
    const voices = englishVoices().sort((a, b) =>
      quality(a) - quality(b) || a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang));
    const picked = choice.voice && voices.some(v => v.voiceURI === choice.voice) ? choice.voice : '';
    const best = bestVoice(voices);
    list.textContent = '';
    if (!supported || !voices.length) {
      list.textContent = supported ? 'Loading voices…' : "This browser can't talk.";
      return;
    }
    const add = (uri, name, note) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.voice = uri;
      btn.classList.toggle('on', uri === picked);
      btn.setAttribute('aria-pressed', uri === picked);
      btn.append(name);
      const small = document.createElement('small');
      small.textContent = note;
      btn.append(small);
      list.append(btn);
    };
    add('', '✨ Best voice', best ? best.name : '');
    for (const v of voices) add(v.voiceURI, v.name, regionOf(v.lang));
  }

  function openPicker() {
    if (!panel) buildPanel();
    renderPicker();
    panel.hidden = false;
    ready.then(() => { if (!panel.hidden) renderPicker(); }); // voices can arrive after it opens
  }

  function closePicker() {
    panel.hidden = true;
    stop();
  }

  window.Speech = { supported, ready, setup, speak, stop, idle, setMuted, clean, openPicker, closePicker, currentVoice };
})();
