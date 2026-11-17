// The page around Flame and Blame (Docs/QA "Release polish"): a full-window canvas, the game's own loading look (no words
// on a loading screen: the bar says it), "Click
// to play" (it gives the canvas the focus, starts the sound and is the first gesture for the mouse lock), a controls card
// in the game's language, a desktop-only notice on phones, a fullscreen button, and the shift's loading curtain drawn
// again over the canvas so it keeps moving while a frame of the game compiles shaders. Relative paths only: any static
// host serves it (GitHub Pages: gzip with the decompression fallback, no server headers needed).
(function () {
  'use strict';

  var WORDS = {
    en: {
      play: 'Click to play',
      desktop: 'Flame and Blame plays in a desktop browser, with a keyboard and a mouse.', anyway: 'Load it anyway',
      move: 'Walk', run: 'Run', jump: 'Jump', crouch: 'Crouch', use: 'Take, open', ready: 'Ready, at the tea table',
      spray: 'Spray, use', drop: 'Put down, let go', pressure: 'Pressure', horn: 'Horn, in the truck', pause: 'Pause',
      controls: 'Controls', fullscreen: 'Full screen', webgl2: 'This browser cannot run the game: it needs WebGL 2. Try a current Chrome, Edge or Firefox.',
      failed: 'The game could not start. Reload the page to try again.',
      download: 'Download for Windows', downloadWhy: 'better quality · ~85 MB'
    },
    uk: {
      play: 'Натисніть, щоб грати',
      desktop: 'Flame and Blame грається в браузері на комп’ютері, з клавіатурою й мишею.', anyway: 'Все одно завантажити',
      move: 'Ходити', run: 'Бігти', jump: 'Стрибнути', crouch: 'Пригнутися', use: 'Взяти, відчинити', ready: 'Готовий, біля чаю',
      spray: 'Гасити, діяти', drop: 'Покласти, відпустити', pressure: 'Тиск', horn: 'Сигнал, у машині', pause: 'Пауза',
      controls: 'Керування', fullscreen: 'На весь екран', webgl2: 'Цей браузер не запустить гру: потрібен WebGL 2. Спробуйте свіжий Chrome, Edge чи Firefox.',
      failed: 'Гра не запустилася. Оновіть сторінку, щоб спробувати ще раз.',
      download: 'Завантажити для Windows', downloadWhy: 'краща якість · ~85 МБ'
    }
  };
  var LANGUAGE_KEY = 'fnb.page.lang';

  var $ = function (id) { return document.getElementById(id); };
  var language = pickLanguage();
  var state = 'loading';
  var shown = 0;          // the bar as drawn, 0..1
  var target = 0;         // where it is heading
  var downloaded = false; // the files are in: the engine is starting
  var startedAt = 0;
  var instance = null;

  function pickLanguage() {
    try {
      var saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved === 'en' || saved === 'uk') return saved;
    } catch (e) {}
    var asked = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return /^uk/i.test(asked) ? 'uk' : 'en';
  }

  function say(key) { return (WORDS[language] || WORDS.en)[key] || WORDS.en[key] || ''; }

  function applyWords() {
    document.documentElement.lang = language;
    var nodes = document.querySelectorAll('[data-say]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = say(nodes[i].getAttribute('data-say'));
    }
    var titled = document.querySelectorAll('[data-say-title]');
    for (var j = 0; j < titled.length; j++) {
      var title = say(titled[j].getAttribute('data-say-title'));
      titled[j].title = title;
      titled[j].setAttribute('aria-label', title);
    }
    $('keys').setAttribute('aria-label', say('controls'));
  }

  function isPhone() {
    var ua = navigator.userAgent || '';
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
    // iPadOS asks for the desktop site and says Macintosh.
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    return !!coarse;
  }

  function hasWebGL2() {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
  }

  // The bar never stands still: it eases toward the download's progress, and while the engine starts (no numbers from
  // Unity then) it keeps creeping toward the end. The sheen across it is a CSS animation, which the browser runs off
  // the main thread, so it moves even while the engine's start-up holds the page.
  function tick(now) {
    if (state !== 'loading') return;
    if (!startedAt) startedAt = now;
    if (downloaded) target = Math.min(0.995, target + (1 - target) * 0.012);
    shown += (target - shown) * 0.08;
    $('fill').style.transform = 'scaleX(' + shown.toFixed(4) + ')';
    $('track').setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    requestAnimationFrame(tick);
  }

  function setState(next) {
    state = next;
    $('cover').setAttribute('data-state', next);
    $('loader').hidden = next !== 'loading';
    $('play').hidden = next !== 'ready';
    $('notice').hidden = next !== 'phone';
    $('error').hidden = next !== 'error';
  }

  function fail(message) {
    setState('error');
    $('error').textContent = message;
    console.error('[page] ' + message);
  }

  // Unity's own banner: warnings to the console, an error on the cover.
  function banner(message, type) {
    if (type === 'error') fail(say('failed'));
    console.warn('[unity] ' + message);
  }

  function load(config, loaderUrl) {
    setState('loading');
    requestAnimationFrame(tick);
    config.showBanner = banner;
    // A sharp picture without drawing more than ~3 million pixels (a 4K or HiDPI screen at full density costs frames).
    var area = Math.max(1, window.innerWidth * window.innerHeight);
    config.devicePixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, Math.sqrt(3.0e6 / area)));
    var script = document.createElement('script');
    script.src = loaderUrl;
    script.onerror = function () { fail(say('failed')); };
    script.onload = function () {
      createUnityInstance($('unity-canvas'), config, function (progress) {
        // Unity reports the download as 0..0.9, then 1 when it is in; the engine starts after that.
        target = Math.max(target, Math.min(0.85, progress * 0.94));
        if (progress >= 0.9) downloaded = true;
      }).then(function (unity) {
        instance = unity;
        window.unityInstance = unity;
        target = 1;
        shown = 1;
        $('fill').style.transform = 'scaleX(1)';
        setState('ready');
        $('play').focus({ preventScroll: true });
      }).catch(function (message) {
        fail(say('failed'));
        console.error(message);
      });
    };
    document.body.appendChild(script);
  }

  // The click that starts it all: the canvas gets the keyboard, Unity's own mousedown listener on the window starts the
  // sound, and the game asks for the mouse lock when it needs it (this gesture lets it).
  function play(event) {
    if (state !== 'ready') return;
    if (event) event.preventDefault();
    setState('playing');
    var canvas = $('unity-canvas');
    canvas.focus({ preventScroll: true });
    $('tools').hidden = false;
    $('cover').classList.add('gone');
    setTimeout(function () { $('cover').hidden = true; }, 400);
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  // The whole page (canvas and overlays) full screen, or back. A refusal (no user gesture) is caught: Unity's loader
  // treats any unhandled rejection as fatal.
  function setFullscreen(on) {
    var root = $('game');
    if (!on && isFullscreen()) {
      var left = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (left && left.catch) left.catch(function () {});
    } else if (on && !isFullscreen()) {
      var ask = root.requestFullscreen || root.webkitRequestFullscreen;
      if (ask) {
        var asked = ask.call(root, { navigationUI: 'hide' });
        if (asked && asked.catch) asked.catch(function () {});
      }
    }
    $('unity-canvas').focus({ preventScroll: true });
  }

  function toggleFullscreen() {
    setFullscreen(!isFullscreen());
  }

  function toggleKeys() {
    var cover = $('cover');
    var open = cover.hidden || cover.classList.contains('gone');
    if (open) {
      cover.hidden = false;
      cover.classList.remove('gone');
      cover.setAttribute('data-state', 'keys');
    } else {
      cover.classList.add('gone');
      setTimeout(function () { if (cover.classList.contains('gone')) cover.hidden = true; }, 400);
    }
    $('keys-button').setAttribute('aria-expanded', String(open));
  }

  // Told by the game (Assets/FnB/Presentation/Page): its language, and a shift's loading curtain.
  var curtainTimer = 0;
  window.fnbPage = {
    // The game's Settings → Full screen (called from the press, so the browser counts it as the player's gesture).
    fullscreen: function (on) { setFullscreen(!!on); },
    isFullscreen: isFullscreen,
    language: function (next) {
      if (next !== 'en' && next !== 'uk') return;
      language = next;
      try { localStorage.setItem(LANGUAGE_KEY, next); } catch (e) {}
      applyWords();
    },
    curtain: function (progress) {
      var curtain = $('curtain');
      clearTimeout(curtainTimer);
      if (progress < 0) {
        curtain.classList.add('lifting');
        curtainTimer = setTimeout(function () { curtain.hidden = true; curtain.classList.remove('lifting'); }, 260);
        return;
      }
      curtain.classList.remove('lifting');
      curtain.hidden = false;
      $('curtain-fill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, progress)).toFixed(4) + ')';
      // Never left over the game: the game's own curtain gives up after 40 s.
      curtainTimer = setTimeout(function () { curtain.hidden = true; }, 45000);
    },
    start: function (config, loaderUrl) {
      applyWords();
      $('play').addEventListener('click', play);
      // The download link is its own action: its press never starts the game under it.
      $('download').addEventListener('mousedown', function (event) { event.stopPropagation(); });
      $('cover').addEventListener('mousedown', function (event) {
        if (state === 'ready') play(event);
        else if (state === 'playing' && $('cover').getAttribute('data-state') === 'keys') toggleKeys();
      });
      document.addEventListener('keydown', function (event) {
        if (state === 'ready' && (event.key === 'Enter' || event.key === ' ')) play(event);
      });
      $('fullscreen-button').addEventListener('click', toggleFullscreen);
      $('keys-button').addEventListener('click', toggleKeys);
      $('anyway').addEventListener('click', function () { load(config, loaderUrl); });
      // The tools stay out of the way while the game holds the mouse.
      document.addEventListener('pointerlockchange', function () {
        document.body.classList.toggle('locked', !!document.pointerLockElement);
      });
      if (!hasWebGL2()) { fail(say('webgl2')); return; }
      if (isPhone()) { setState('phone'); return; }
      load(config, loaderUrl);
    }
  };
})();
