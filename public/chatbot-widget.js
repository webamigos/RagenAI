/* Ragen Chatbot Widget — standalone, no dependencies */
(function () {
  'use strict';

  // document.currentScript is null when loaded with async — capture it immediately
  // or fall back to querySelector for deferred loads
  var scriptTag =
    document.currentScript ||
    document.querySelector(
      'script[src*="chatbot-widget"][data-chatbot-token]',
    ) ||
    document.querySelector('script[data-chatbot-token]');
  if (!scriptTag) {
    return;
  }

  var token = scriptTag.getAttribute('data-chatbot-token');
  if (!token) {
    return;
  }

  if (window.__ragenChatbotLoaded) {
    return;
  }
  window.__ragenChatbotLoaded = true;

  var API_BASE = scriptTag.src
    .replace(/\/chatbot-widget\.js(\?.*)?$/, '')
    .replace(/\/$/, '');

  var SESSIONS_KEY = 'ragen_sessions_' + token;
  var CURRENT_KEY = 'ragen_current_' + token;

  function newUUID() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getSessions() {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function getCurrentSessionId() {
    var current = localStorage.getItem(CURRENT_KEY);
    if (current) {
      return current;
    }
    // migrate legacy single-session key
    var legacy = localStorage.getItem('ragen_session_' + token);
    if (legacy) {
      var sessions = [legacy];
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      localStorage.setItem(CURRENT_KEY, legacy);
      return legacy;
    }
    return createNewSession();
  }

  function createNewSession() {
    var sid = newUUID();
    var sessions = getSessions();
    sessions.unshift(sid);
    if (sessions.length > 100) {
      sessions = sessions.slice(0, 100);
    }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(CURRENT_KEY, sid);
    return sid;
  }

  function switchSession(sid) {
    localStorage.setItem(CURRENT_KEY, sid);
  }

  var md = null;

  function renderMarkdown(text) {
    if (md && window.DOMPurify) {
      return window.DOMPurify.sanitize(md.render(text), {
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      });
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function loadScript(src, integrity, cb) {
    var s = document.createElement('script');
    s.src = src;
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = 'anonymous';
    }
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  function loadConfig(cb) {
    fetch(API_BASE + '/api/chatbot/' + token + '/config')
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(cb)
      .catch(function () {
        cb(null);
      });
  }

  function hexToRgba(hex, alpha) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return 'rgba(99,102,241,' + alpha + ')';
    }
    return (
      'rgba(' +
      parseInt(result[1], 16) +
      ',' +
      parseInt(result[2], 16) +
      ',' +
      parseInt(result[3], 16) +
      ',' +
      alpha +
      ')'
    );
  }

  function render(config) {
    var theme = (config && config.themeConfig) || {};
    var primary = theme.primaryColor || '#6366f1';
    var bubbleColor = theme.bubbleColor || primary;
    var position = theme.position === 'left' ? 'left' : 'right';
    var botName = theme.botName || (config && config.name) || 'Assistant';
    var welcome = theme.welcomeMessage || 'Hi! How can I help you today?';
    var primaryAlpha = hexToRgba(primary, 0.15);
    var primaryLight = hexToRgba(primary, 0.08);
    var avatarLetter = (botName || 'A').charAt(0).toUpperCase();

    var hSide = position === 'left' ? 'left:20px' : 'right:20px';

    var host = document.createElement('div');
    host.id = 'ragen-chatbot-host';
    host.style.cssText =
      'position:fixed;bottom:20px;' +
      hSide +
      ';z-index:2147483647;' +
      'width:56px;height:56px;font-family:system-ui,sans-serif;';
    document.body.appendChild(host);

    var windowHost = document.createElement('div');
    windowHost.id = 'ragen-chatbot-window-host';
    windowHost.style.cssText =
      'position:fixed;bottom:92px;' +
      hSide +
      ';z-index:2147483646;' +
      'width:440px;max-width:calc(100vw - 40px);' +
      'font-family:system-ui,sans-serif;display:none;overflow:hidden;border-radius:16px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.15);';
    document.body.appendChild(windowHost);

    var shadow = host.attachShadow({ mode: 'open' });
    var windowShadow = windowHost.attachShadow({ mode: 'open' });

    var btnStyles = [
      ':host{all:initial;display:block}',
      '.btn{position:relative;width:56px;height:56px;border-radius:50%;background:' +
        bubbleColor +
        ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.25),0 1px 4px rgba(0,0,0,.1);transition:transform .2s ease,box-shadow .2s ease}',
      '.btn:hover{transform:scale(1.06);box-shadow:0 6px 24px rgba(0,0,0,.3)}',
      '.btn::before{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid ' +
        bubbleColor +
        ';opacity:0;animation:rc-pulse 2.5s ease-out infinite}',
      '@keyframes rc-pulse{0%{opacity:.5;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}',
      '.btn .ic{position:absolute;transition:opacity .2s,transform .2s}',
      '.btn .ic-chat{opacity:1;transform:scale(1)}',
      '.btn .ic-close{opacity:0;transform:scale(.7) rotate(-45deg)}',
      '.btn.open .ic-chat{opacity:0;transform:scale(.7) rotate(45deg)}',
      '.btn.open .ic-close{opacity:1;transform:scale(1) rotate(0deg)}',
      '.btn svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    ].join('');

    var btnStyleEl = document.createElement('style');
    btnStyleEl.textContent = btnStyles;
    shadow.appendChild(btnStyleEl);

    var winStyles = [
      ':host{all:initial;display:block;width:100%;height:100%}',
      '@keyframes rc-open{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}',
      '@keyframes rc-close{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.98)}}',
      '@keyframes rc-bounce{0%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}',
      '.window{width:100%;height:100%;background:#fff;display:flex;flex-direction:column;overflow:hidden;position:relative;animation:rc-open .2s cubic-bezier(.16,1,.3,1) both;font-family:-apple-system,"Segoe UI",system-ui,sans-serif}',
      '.window.closing{animation:rc-close .15s ease-in both}',
      '@media(prefers-color-scheme:dark){.window{background:#111113;color:#f4f4f5}}',
      // Header
      '.header{padding:14px 16px;background:#fff;color:#18181b;display:flex;align-items:center;gap:10px;flex-shrink:0;border-bottom:1px solid #f0f0f0;position:relative}',
      '@media(prefers-color-scheme:dark){.header{background:#18181a;border-color:#2a2a2e;color:#f4f4f5}}',
      '.bot-avatar{width:34px;height:34px;border-radius:50%;background:' +
        primary +
        ';display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;letter-spacing:-.5px}',
      '.bot-info{flex:1;min-width:0}',
      '.bot-name{font-size:14px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bot-status{font-size:11px;color:#71717a;font-weight:400;margin-top:1px;display:flex;align-items:center;gap:4px}',
      '.bot-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0}',
      '.header-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}',
      '.header button{background:none;border:none;cursor:pointer;color:#71717a;padding:6px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}',
      '.header button:hover{background:#f4f4f5;color:#18181b}',
      '@media(prefers-color-scheme:dark){.header button:hover{background:#27272a;color:#f4f4f5}}',
      '.header button svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      // Menu
      '.menu-wrap{position:relative}',
      '.menu-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.12),0 1px 4px rgba(0,0,0,.06);min-width:188px;overflow:hidden;z-index:10;animation:rc-open .15s ease both;border:1px solid rgba(0,0,0,.06)}',
      '@media(prefers-color-scheme:dark){.menu-dropdown{background:#1c1c1f;border-color:#2a2a2e}}',
      '.menu-dropdown button{width:100%;text-align:left;padding:10px 14px;background:none;border:none;cursor:pointer;font-size:13.5px;color:#18181b;display:flex;align-items:center;gap:9px;font-family:inherit;letter-spacing:-.01em;transition:background .1s}',
      '@media(prefers-color-scheme:dark){.menu-dropdown button{color:#f4f4f5}}',
      '.menu-dropdown button:hover{background:#f7f7f8}',
      '@media(prefers-color-scheme:dark){.menu-dropdown button:hover{background:#27272a}}',
      '.menu-dropdown button svg{width:15px;height:15px;stroke:' +
        primary +
        ';fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}',
      '.menu-dropdown hr{border:none;border-top:1px solid #f0f0f0;margin:0}',
      '@media(prefers-color-scheme:dark){.menu-dropdown hr{border-color:#2a2a2e}}',
      // Messages
      '.messages{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:12px;min-height:0;scroll-behavior:smooth}',
      '.messages::-webkit-scrollbar{width:4px}',
      '.messages::-webkit-scrollbar-thumb{background:#d4d4d8;border-radius:4px}',
      '@media(prefers-color-scheme:dark){.messages::-webkit-scrollbar-thumb{background:#3f3f46}}',
      // Message bubbles
      '.msg{padding:11px 15px;border-radius:18px;font-size:14.5px;line-height:1.65;word-wrap:break-word;width:fit-content;max-width:85%}',
      '.msg.user{align-self:flex-end;background:' +
        primary +
        ';color:#fff;border-bottom-right-radius:4px}',
      '.msg.bot{align-self:flex-start;background:#f5f5f7;color:#18181b;border-bottom-left-radius:4px}',
      '@media(prefers-color-scheme:dark){.msg.bot{background:#232328;color:#f4f4f5}}',
      '.msg.bot.typing{opacity:.7}',
      // Bot message content
      '.msg.bot p{margin:.35em 0}.msg.bot p:first-child{margin-top:0}.msg.bot p:last-child{margin-bottom:0}',
      '.msg.bot h1,.msg.bot h2,.msg.bot h3{font-weight:600;margin:.5em 0 .25em;letter-spacing:-.02em}.msg.bot h1{font-size:1.15em}.msg.bot h2{font-size:1.05em}.msg.bot h3{font-size:1em}',
      '.msg.bot ul,.msg.bot ol{margin:.35em 0;padding-left:1.4em}.msg.bot li{margin:.2em 0}',
      '.msg.bot code{background:rgba(0,0,0,.06);border-radius:5px;padding:1px 5px;font-size:.87em;font-family:"SF Mono","Fira Code",monospace}',
      '.msg.bot pre{background:#1a1a1e;border-radius:10px;padding:12px 16px;overflow-x:auto;margin:.5em 0}.msg.bot pre code{background:none;padding:0;color:#e2e8f0;font-size:.84em}',
      '.msg.bot strong{font-weight:600}.msg.bot em{font-style:italic}',
      '.msg.bot a{color:' +
        primary +
        ';text-decoration:underline;text-underline-offset:2px}',
      '.msg.bot hr{border:none;border-top:1px solid #e4e4e7;margin:.5em 0}',
      // Message actions
      '.msg-wrap{display:flex;flex-direction:column;align-items:flex-start;gap:3px;max-width:85%}',
      '.msg-actions{display:flex;gap:2px;opacity:0;transition:opacity .15s}',
      '.msg-wrap:hover .msg-actions{opacity:1}',
      '.act-btn{background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;color:#a1a1aa;display:flex;align-items:center;justify-content:center;transition:color .15s,background .15s}',
      '.act-btn:hover{background:#f4f4f5;color:#3f3f46}',
      '.act-btn svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.act-btn.copied{color:#22c55e}',
      // Typing dots
      '.dots{display:inline-flex;gap:4px;align-items:center;height:14px}',
      '.dots span{width:5px;height:5px;border-radius:50%;background:#a1a1aa;animation:rc-bounce .9s ease-in-out infinite}',
      '.dots span:nth-child(2){animation-delay:.15s}',
      '.dots span:nth-child(3){animation-delay:.3s}',
      // Input
      '.input-row{padding:12px 14px;border-top:1px solid #f0f0f0;display:flex;gap:8px;align-items:flex-end;background:inherit;flex-shrink:0}',
      '@media(prefers-color-scheme:dark){.input-row{border-color:#2a2a2e}}',
      '.input{flex:1;border:1.5px solid #e4e4e7;border-radius:22px;padding:9px 16px;font-size:14px;outline:none;background:#fafafa;color:#18181b;resize:none;overflow-y:auto;line-height:1.5;min-height:38px;max-height:120px;height:38px;box-sizing:border-box;font-family:inherit;transition:border-color .15s,box-shadow .15s}',
      '.input:focus{border-color:' +
        primary +
        ';box-shadow:0 0 0 3px ' +
        primaryAlpha +
        ';background:#fff}',
      '@media(prefers-color-scheme:dark){.input{background:#1c1c1f;border-color:#3f3f46;color:#f4f4f5}}',
      '@media(prefers-color-scheme:dark){.input:focus{background:#232328}}',
      '.input::placeholder{color:#a1a1aa}',
      '.input-wrap{position:relative;flex:1}',
      '.input-wrap .input{width:100%;box-sizing:border-box}',
      '.input-wrap.has-counter .input{padding-bottom:22px}',
      '.char-count{position:absolute;right:12px;bottom:7px;font-size:9px;font-family:ui-monospace,monospace;letter-spacing:0;color:#a1a1aa;opacity:.35;transition:opacity .25s,color .25s;white-space:nowrap;line-height:1;pointer-events:none}',
      '.char-count.warn{color:#b45309;opacity:.55}',
      '.char-count.over{color:#be123c;opacity:.7}',
      '.send{width:36px;height:36px;border-radius:50%;background:' +
        primary +
        ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,opacity .15s}',
      '.send:hover{transform:scale(1.06)}',
      '.send:disabled{opacity:.4;cursor:not-allowed;transform:none}',
      '.send svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
      // Views
      '.view{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;background:#fff;transition:transform .28s cubic-bezier(.16,1,.3,1)}',
      '@media(prefers-color-scheme:dark){.view{background:#111113}}',
      '.view-chat{transform:translateX(0)}',
      '.view-history{transform:translateX(100%)}',
      '.window.show-history .view-chat{transform:translateX(-28%)}',
      '.window.show-history .view-history{transform:translateX(0)}',
      // History
      '.hist-header{padding:14px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;flex-shrink:0;background:#fff}',
      '@media(prefers-color-scheme:dark){.hist-header{background:#18181a;border-color:#2a2a2e}}',
      '.hist-header h2{flex:1;text-align:center;font-size:14px;font-weight:600;margin:0;color:#18181b;letter-spacing:-.02em}',
      '@media(prefers-color-scheme:dark){.hist-header h2{color:#f4f4f5}}',
      '.hist-header button{background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;display:flex;color:#71717a;align-items:center;justify-content:center;transition:background .15s,color .15s}',
      '.hist-header button:hover{background:#f4f4f5;color:#18181b}',
      '@media(prefers-color-scheme:dark){.hist-header button:hover{background:#27272a;color:#f4f4f5}}',
      '.hist-header button svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.hist-list{flex:1;overflow-y:auto}',
      '.hist-item{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #f7f7f8;cursor:pointer;transition:background .1s}',
      '@media(prefers-color-scheme:dark){.hist-item{border-color:#1e1e22}}',
      '.hist-item:hover{background:#f9f9fb}',
      '@media(prefers-color-scheme:dark){.hist-item:hover{background:#1e1e22}}',
      '.hist-item.active{background:' + primaryLight + '}',
      '.hist-avatar{width:38px;height:38px;border-radius:50%;background:' +
        primary +
        ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;color:#fff;font-weight:700;letter-spacing:-.5px}',
      '.hist-info{flex:1;min-width:0}',
      '.hist-title{font-size:13.5px;font-weight:500;color:#18181b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '@media(prefers-color-scheme:dark){.hist-title{color:#f4f4f5}}',
      '.hist-sub{font-size:12px;color:#a1a1aa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.hist-time{font-size:11px;color:#a1a1aa;flex-shrink:0}',
      '.hist-empty{padding:40px 16px;text-align:center;color:#a1a1aa;font-size:13.5px}',
      '.hist-loading{padding:20px 16px;text-align:center;color:#a1a1aa;font-size:13.5px}',
    ].join('');

    var winStyleEl = document.createElement('style');
    winStyleEl.textContent = winStyles;
    windowShadow.appendChild(winStyleEl);

    var chatIcon =
      '<span class="ic ic-chat"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>' +
      '<span class="ic ic-close"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
    var sendIcon =
      '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    var menuIcon =
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="#fff"/><circle cx="12" cy="12" r="1" fill="#fff"/><circle cx="12" cy="19" r="1" fill="#fff"/></svg>';
    var newChatIcon =
      '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
    var historyIcon =
      '<svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg>';
    var closeIcon =
      '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    var backIcon =
      '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
    var addIcon =
      '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    var windowEl = document.createElement('div');
    windowEl.className = 'window';
    windowEl.innerHTML =
      '<div class="view view-chat">' +
      '<div class="header">' +
      '<div class="bot-avatar">' +
      escapeHtml(avatarLetter) +
      '</div>' +
      '<div class="bot-info">' +
      '<div class="bot-name">' +
      escapeHtml(botName) +
      '</div>' +
      '<div class="bot-status">Online</div>' +
      '</div>' +
      '<div class="header-actions">' +
      '<div class="menu-wrap"><button id="rc-menu-btn">' +
      menuIcon +
      '</button></div>' +
      '<button id="rc-close">' +
      closeIcon +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="messages" id="rc-messages"></div>' +
      '<div class="input-row"><div class="input-wrap" id="rc-input-wrap"><textarea class="input" id="rc-input" placeholder="Type a message..." rows="1"></textarea><span class="char-count" id="rc-char-count" style="display:none"></span></div><button class="send" id="rc-send">' +
      sendIcon +
      '</button></div>' +
      '</div>' +
      '<div class="view view-history">' +
      '<div class="hist-header">' +
      '<button id="rc-hist-back">' +
      backIcon +
      '</button>' +
      '<h2>Ostatnie czaty</h2>' +
      '<button id="rc-hist-new">' +
      addIcon +
      '</button>' +
      '</div>' +
      '<div class="hist-list" id="rc-hist-list"></div>' +
      '</div>';

    windowShadow.appendChild(windowEl);

    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.innerHTML = chatIcon;
    shadow.appendChild(btn);

    var MSG_MAX_LENGTH = 10000;
    var messagesEl = windowShadow.querySelector('#rc-messages');
    var inputEl = windowShadow.querySelector('#rc-input');
    var sendEl = windowShadow.querySelector('#rc-send');
    var charCountEl = windowShadow.querySelector('#rc-char-count');
    var inputWrapEl = windowShadow.querySelector('#rc-input-wrap');
    var histListEl = windowShadow.querySelector('#rc-hist-list');

    var open = false;
    var sending = false;

    function startFreshChat() {
      messagesEl.innerHTML = '';
      loadHistory(welcome);
    }

    function openWindow() {
      windowHost.style.width = Math.min(440, window.innerWidth - 40) + 'px';
      var vh = document.documentElement.clientHeight;
      windowHost.style.bottom = '92px';
      windowHost.style.height = vh - 112 + 'px';
      windowHost.style.display = 'block';
      windowEl.classList.remove('closing', 'show-history');
      windowEl.style.animation = 'none';
      windowEl.getBoundingClientRect();
      windowEl.style.animation = '';
      if (messagesEl.childElementCount === 0) {
        loadHistory(welcome);
      }
      inputEl.focus();
    }

    function loadHistory(welcomeMsg) {
      var sessionId = getCurrentSessionId();
      fetch(
        API_BASE +
          '/api/chatbot/' +
          token +
          '/history?sessionId=' +
          encodeURIComponent(sessionId),
      )
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          var msgs = data && data.messages;
          if (!msgs || msgs.length === 0) {
            appendMessage(welcomeMsg, 'bot');
            return;
          }
          for (var i = 0; i < msgs.length; i++) {
            var m = msgs[i];
            appendMessage(m.content, m.role === 'USER' ? 'user' : 'bot');
          }
          messagesEl.scrollTop = messagesEl.scrollHeight;
        })
        .catch(function () {
          appendMessage(welcomeMsg, 'bot');
        });
    }

    function closeWindow() {
      windowEl.classList.add('closing');
      windowEl.addEventListener('animationend', function handler() {
        windowEl.removeEventListener('animationend', handler);
        windowHost.style.display = 'none';
        windowEl.classList.remove('closing');
      });
    }

    btn.addEventListener('click', function () {
      open = !open;
      if (open) {
        btn.classList.add('open');
        openWindow();
      } else {
        btn.classList.remove('open');
        closeWindow();
      }
    });

    windowShadow
      .querySelector('#rc-close')
      .addEventListener('click', function () {
        open = false;
        btn.classList.remove('open');
        closeWindow();
      });

    var menuOpen = false;

    function closeMenu() {
      menuOpen = false;
      var d = windowShadow.querySelector('.menu-dropdown');
      if (d) {
        d.remove();
      }
    }

    function openMenu() {
      if (menuOpen) {
        closeMenu();
        return;
      }
      menuOpen = true;

      var dropdown = document.createElement('div');
      dropdown.className = 'menu-dropdown';

      var newBtn = document.createElement('button');
      newBtn.innerHTML = newChatIcon + 'Nowy czat';
      newBtn.addEventListener('click', function () {
        closeMenu();
        createNewSession();
        startFreshChat();
      });
      dropdown.appendChild(newBtn);

      var hr = document.createElement('hr');
      dropdown.appendChild(hr);

      var histBtn = document.createElement('button');
      histBtn.innerHTML = historyIcon + 'Historia czatów';
      histBtn.addEventListener('click', function () {
        closeMenu();
        showHistory();
      });
      dropdown.appendChild(histBtn);

      windowShadow.querySelector('.menu-wrap').appendChild(dropdown);

      // Close on outside click — deferred so this click doesn't immediately close it
      setTimeout(function () {
        document.addEventListener('click', function handler() {
          document.removeEventListener('click', handler);
          closeMenu();
        });
      }, 0);
    }

    function showHistory() {
      windowEl.classList.add('show-history');
      loadHistoryList();
    }

    function hideHistory() {
      windowEl.classList.remove('show-history');
    }

    function relativeTime(dateStr) {
      var diff = Date.now() - new Date(dateStr).getTime();
      var m = Math.floor(diff / 60000);
      if (m < 1) {
        return 'przed chwilą';
      }
      if (m < 60) {
        return m + ' min temu';
      }
      var h = Math.floor(m / 60);
      if (h < 24) {
        return h + ' godz. temu';
      }
      var d = Math.floor(h / 24);
      return d === 1 ? 'wczoraj' : d + ' dni temu';
    }

    function loadHistoryList() {
      histListEl.innerHTML = '<div class="hist-loading">Ładowanie...</div>';

      var sessions = getSessions();
      if (!sessions || sessions.length === 0) {
        histListEl.innerHTML =
          '<div class="hist-empty">Brak poprzednich rozmów</div>';
        return;
      }

      fetch(API_BASE + '/api/chatbot/' + token + '/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: sessions }),
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          if (!data || !data.conversations || data.conversations.length === 0) {
            histListEl.innerHTML =
              '<div class="hist-empty">Brak poprzednich rozmów</div>';
            return;
          }
          var convMap = {};
          for (var i = 0; i < data.conversations.length; i++) {
            convMap[data.conversations[i].sessionId] = data.conversations[i];
          }
          histListEl.innerHTML = '';
          var currentSid = getCurrentSessionId();
          var avatarLetter = (botName || 'A').charAt(0).toUpperCase();

          for (var j = 0; j < sessions.length; j++) {
            (function (sid) {
              var conv = convMap[sid];
              if (!conv) {
                return;
              }
              var firstMsg =
                conv.messages && conv.messages[0]
                  ? conv.messages[0].content
                  : null;
              var title = firstMsg
                ? firstMsg.slice(0, 60) + (firstMsg.length > 60 ? '…' : '')
                : 'Pusta rozmowa';
              var sub =
                conv.messages &&
                conv.messages[0] &&
                conv.messages[0].role === 'USER'
                  ? 'Ty: ' + title
                  : title;

              var item = document.createElement('div');
              item.className =
                'hist-item' + (sid === currentSid ? ' active' : '');
              item.innerHTML =
                '<div class="hist-avatar">' +
                avatarLetter +
                '</div>' +
                '<div class="hist-info">' +
                '<div class="hist-title">' +
                escapeHtml(title) +
                '</div>' +
                '<div class="hist-sub">' +
                escapeHtml(sub) +
                '</div>' +
                '</div>' +
                '<div class="hist-time">' +
                relativeTime(conv.createdAt) +
                '</div>';

              item.addEventListener('click', function () {
                switchSession(sid);
                hideHistory();
                startFreshChat();
              });
              histListEl.appendChild(item);
            })(sessions[j]);
          }

          if (histListEl.childElementCount === 0) {
            histListEl.innerHTML =
              '<div class="hist-empty">Brak poprzednich rozmów</div>';
          }
        })
        .catch(function () {
          histListEl.innerHTML =
            '<div class="hist-empty">Nie udało się załadować historii</div>';
        });
    }

    windowShadow
      .querySelector('#rc-menu-btn')
      .addEventListener('click', function (e) {
        e.stopPropagation();
        openMenu();
      });

    windowShadow
      .querySelector('#rc-hist-back')
      .addEventListener('click', hideHistory);

    windowShadow
      .querySelector('#rc-hist-new')
      .addEventListener('click', function () {
        hideHistory();
        createNewSession();
        startFreshChat();
      });

    inputEl.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      var len = this.value.length;
      var ratio = len / MSG_MAX_LENGTH;
      if (ratio >= 0.8) {
        charCountEl.textContent = len + ' / ' + MSG_MAX_LENGTH;
        charCountEl.style.display = '';
        var modifier = ratio > 1 ? ' over' : '';
        if (!modifier && ratio >= 0.9) {
          modifier = ' warn';
        }
        charCountEl.className = 'char-count' + modifier;
        inputWrapEl.classList.add('has-counter');
        sendEl.disabled = ratio > 1;
      } else {
        charCountEl.style.display = 'none';
        inputWrapEl.classList.remove('has-counter');
        sendEl.disabled = false;
      }
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    sendEl.addEventListener('click', doSend);

    function doSend() {
      if (sending) {
        return;
      }
      var text = inputEl.value.trim();
      if (!text || text.length > MSG_MAX_LENGTH) {
        return;
      }
      inputEl.value = '';
      inputEl.style.height = '36px';
      appendMessage(text, 'user');
      sendEl.disabled = true;
      sending = true;
      var botMsg = appendTypingIndicator();
      sendMessage(text, botMsg, function () {
        sending = false;
        sendEl.disabled = false;
        botMsg.classList.remove('typing');
        wrapBotMessage(botMsg);
      });
    }

    function appendMessage(text, cls) {
      var el = document.createElement('div');
      el.className = 'msg ' + cls;
      if (cls === 'bot') {
        el.innerHTML = renderMarkdown(text);
        var wrap = document.createElement('div');
        wrap.className = 'msg-wrap';
        wrap.appendChild(el);
        wrap.appendChild(buildCopyBtn(el));
        messagesEl.appendChild(wrap);
      } else {
        el.textContent = text;
        messagesEl.appendChild(el);
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function appendTypingIndicator() {
      var el = document.createElement('div');
      el.className = 'msg bot typing';
      el.innerHTML =
        '<span class="dots"><span></span><span></span><span></span></span>';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function wrapBotMessage(el) {
      var parent = el.parentElement;
      if (!parent || parent.classList.contains('msg-wrap')) {
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'msg-wrap';
      parent.insertBefore(wrap, el);
      wrap.appendChild(el);
      wrap.appendChild(buildCopyBtn(el));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function buildCopyBtn(el) {
    var copyIcon =
      '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var checkIcon =
      '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';

    var actions = document.createElement('div');
    actions.className = 'msg-actions';

    var btn = document.createElement('button');
    btn.className = 'act-btn';
    btn.title = 'Kopiuj';
    btn.innerHTML = copyIcon;
    btn.addEventListener('click', function () {
      navigator.clipboard
        .writeText(el.textContent || '')
        .then(function () {
          btn.classList.add('copied');
          btn.innerHTML = checkIcon;
          setTimeout(function () {
            btn.classList.remove('copied');
            btn.innerHTML = copyIcon;
          }, 1500);
        })
        .catch(function () {
          // clipboard write failed — silently ignore
        });
    });

    actions.appendChild(btn);
    return actions;
  }

  function sendMessage(text, botMsgEl, done) {
    var sessionId = getCurrentSessionId();
    var firstChunk = true;
    var accumulated = '';

    fetch(API_BASE + '/api/chatbot/' + token + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: sessionId }),
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function read() {
          reader
            .read()
            .then(function (r) {
              if (r.done) {
                done();
                return;
              }
              buffer += decoder.decode(r.value, { stream: true });
              var lines = buffer.split('\n\n');
              buffer = lines.pop();
              for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (!line.startsWith('data: ')) {
                  continue;
                }
                var data = line.slice(6);
                if (data === '[DONE]') {
                  continue;
                }
                try {
                  var parsed = JSON.parse(data);
                  if (parsed.text) {
                    if (firstChunk) {
                      firstChunk = false;
                      botMsgEl.classList.remove('typing');
                    }
                    accumulated += parsed.text;
                    botMsgEl.innerHTML = renderMarkdown(accumulated);
                    var msgs = botMsgEl.parentElement;
                    if (msgs) {
                      msgs.scrollTop = msgs.scrollHeight;
                    }
                  }
                } catch (e) {}
              }
              read();
            })
            .catch(function () {
              botMsgEl.textContent = 'Sorry, something went wrong.';
              done();
            });
        }
        read();
      })
      .catch(function () {
        botMsgEl.textContent = 'Sorry, something went wrong.';
        done();
      });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  loadConfig(function (config) {
    if (!config) {
      return;
    }
    loadScript(
      'https://unpkg.com/markdown-it@14.1.1/dist/markdown-it.min.js',
      'sha384-Er//LYl/BnB6JrXmMQocJS1s7s6Gf/FwvdeAwO8ownRBe+Am//lWQNalk+jwsuYW',
      function () {
        loadScript(
          'https://unpkg.com/dompurify@3.3.3/dist/purify.min.js',
          'sha384-vu2qbp+54yXbJ2L+jS61uwURGEYfROSgYSPVZ4XPCIuUwv1OTg5N/CeLe+WzNKj0',
          function () {
            if (window.markdownit) {
              md = window.markdownit({ linkify: true, breaks: true });
            }
            render(config);
          },
        );
      },
    );
  });
})();
