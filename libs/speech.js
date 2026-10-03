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
//   Speech.stop();
//   Speech.setMuted(true);
(function () {
  const synth = window.speechSynthesis;
  const supported = !!(synth && window.SpeechSynthesisUtterance && window.EasySpeech);

  // The same teacher voice in every game. Samantha, Karen and Moira are Apple voices.
  const settings = {
    voices: ['Samantha', 'Karen', 'Moira'],
    rate: 0.95,
    pitch: 1.15,
    words: [], // game-specific [pattern, replacement] pairs, applied before the shared ones
  };

  // Math symbols are read as words. Emoji are dropped.
  const SHARED_WORDS = [
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

  let muted = false;
  let voice = null;
  let turn = 0; // goes up on every speak() and stop(), so a late speak() never talks over a newer one

  function pickVoice(voices) {
    for (const name of settings.voices) {
      const exact = voices.find(v => v.name === name);
      if (exact) return exact;
    }
    return voices.find(v => settings.voices.some(name => v.name.includes(name))) ||
      voices.find(v => v.lang === 'en-US') ||
      voices.find(v => /^en/.test(v.lang)) ||
      null;
  }

  // Voices load in the background as soon as the page opens. Resolves to true when they are ready.
  const ready = supported
    ? EasySpeech.init({ maxTimeout: 5000, interval: 250, quiet: true })
      .then(ok => {
        if (ok) voice = pickVoice(EasySpeech.voices());
        return ok;
      })
      .catch(() => false)
    : Promise.resolve(false);

  function clean(text) {
    let out = String(text || '');
    for (const [pattern, replacement] of settings.words.concat(SHARED_WORDS)) out = out.replace(pattern, replacement);
    return out.trim();
  }

  function cancel() {
    if (!supported) return;
    try { EasySpeech.cancel(); } catch { synth.cancel(); } // EasySpeech throws until its voices load
  }

  // Stops anything being said, then says `text`. Does nothing when muted.
  function speak(text) {
    const mine = ++turn;
    cancel();
    const words = clean(text);
    if (!supported || muted || !words) return;
    ready.then(ok => {
      if (mine !== turn) return;
      // force: still try the default voice if this browser never listed its voices
      const options = { text: words, rate: settings.rate, pitch: settings.pitch, volume: 1, force: !ok };
      if (voice) options.voice = voice;
      try {
        EasySpeech.speak(options).catch(() => {}); // rejects when cut off by the next speak()
      } catch { /* never block gameplay on speech */ }
    });
  }

  function stop() {
    turn++;
    cancel();
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

  window.Speech = { supported, ready, setup, speak, stop, setMuted, clean };
})();
