/* Password gate for the public site.
   The roadmap data in data/*.enc.js is AES-GCM ciphertext: the public repo
   never holds the plaintext. The password derives the key via PBKDF2, so the
   gate is real encryption, not a JS "if (password === ...)" check.

   window.ENC — { key: {salt, iv, ct} } filled by the data/*.enc.js files.
   After a successful unlock this sets window.ROADMAP (and window.__B/__T for
   the hub) and loads assets/roadmap.js. */

(function () {
  'use strict';

  var SESSION = 'inscreens.roadmap.pw';
  var ITER = 250000;

  function b64d(s) {
    var bin = atob(s), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function b64e(buf) {
    var a = new Uint8Array(buf), s = '';
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s);
  }

  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  function decrypt(payload, password) {
    var salt = b64d(payload.salt), iv = b64d(payload.iv), ct = b64d(payload.ct);
    return deriveKey(password, salt).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    }).then(function (buf) {
      return JSON.parse(new TextDecoder().decode(buf));
    });
  }

  // Re-encrypts edited data on export, with a fresh salt and IV each time.
  function encryptFile(data) {
    var password = sessionStorage.getItem(SESSION);
    if (!password) return Promise.reject(new Error('сессия истекла, перезагрузите страницу'));
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(password, salt).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv },
        key, new TextEncoder().encode(JSON.stringify(data)));
    }).then(function (ct) {
      var payload = { salt: b64e(salt), iv: b64e(iv), ct: b64e(ct) };
      return '/* InScreens roadmap — зашифрованные данные (AES-GCM, PBKDF2-SHA256, ' +
        ITER + ' итераций).\n' +
        '   Выгружено ' + new Date().toISOString().slice(0, 10) + '. Замените этим файлом\n' +
        '   data/' + data.key + '.enc.js в репозитории сайта и закоммитьте. */\n\n' +
        'window.ENC = window.ENC || {};\n' +
        'window.ENC["' + data.key + '"] = ' + JSON.stringify(payload, null, 2) + ';\n';
    });
  }

  window.__GATE = { encryptFile: encryptFile, decrypt: decrypt };

  // ---------- unlock ----------
  function unlockAll(password) {
    var keys = Object.keys(window.ENC || {});
    return Promise.all(keys.map(function (k) {
      return decrypt(window.ENC[k], password).then(function (data) { return [k, data]; });
    })).then(function (pairs) {
      var out = {};
      pairs.forEach(function (p) { out[p[0]] = p[1]; });
      return out;
    });
  }

  function start(models) {
    var page = document.body.dataset.page;
    if (page === 'hub') {
      document.getElementById('gate').remove();
      document.getElementById('site').hidden = false;
      window.renderHub(models.business, models.technical);
      return;
    }
    window.ROADMAP = models[page];
    document.getElementById('gate').remove();
    document.getElementById('site').hidden = false;
    var s = document.createElement('script');
    s.src = 'assets/roadmap.js?v=47e0e15d';
    document.body.appendChild(s);
  }

  function boot() {
    var form = document.getElementById('gateForm');
    var input = document.getElementById('gatePw');
    var err = document.getElementById('gateErr');
    var btn = document.getElementById('gateBtn');

    if (!window.crypto || !crypto.subtle) {
      err.textContent = 'Браузер не даёт доступ к WebCrypto. Откройте страницу по https или через http://localhost, а не как локальный файл.';
      err.hidden = false;
      return;
    }

    function attempt(password, quiet) {
      btn.disabled = true; btn.textContent = 'Расшифровываю…';
      return unlockAll(password).then(function (models) {
        try { sessionStorage.setItem(SESSION, password); } catch (e) {}
        start(models);
      }, function () {
        try { sessionStorage.removeItem(SESSION); } catch (e) {}
        btn.disabled = false; btn.textContent = 'Открыть';
        if (!quiet) {
          err.textContent = 'Пароль не подошёл.';
          err.hidden = false;
          input.value = ''; input.focus();
        }
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      if (input.value) attempt(input.value, false);
    });

    var remembered = null;
    try { remembered = sessionStorage.getItem(SESSION); } catch (e) {}
    if (remembered) attempt(remembered, true);
    else input.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
