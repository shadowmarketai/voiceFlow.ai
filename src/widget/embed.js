/**
 * VoiceFlow AI — Embeddable Voice + Chat Widget
 * ================================================
 * Drop-in script: one <script> tag, zero dependencies.
 *
 * Usage:
 *   <script
 *     src="https://api.voiceflow.ai/widget/embed.js"
 *     data-agent-id="sales-assistant-en"
 *     data-position="bottom-right"
 *     data-theme="dark"
 *     data-auto-open="false"
 *     data-language="en"
 *   ></script>
 *
 * Connects to:
 *   REST  — GET  /api/v1/widget/agent/{agent_id}
 *   WS    — /api/v1/voice/conversation/ws?agent_id=xxx
 *   REST  — POST /api/v1/voice/respond  (fallback when WS unavailable)
 */
(function () {
  'use strict';

  // Prevent double-init
  if (window.__vf_widget_loaded) return;
  window.__vf_widget_loaded = true;

  // ── Read config from script tag ────────────────────────────────────
  var scriptTag = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var CONFIG = {
    agentId: scriptTag.getAttribute('data-agent-id') || 'default',
    position: scriptTag.getAttribute('data-position') || 'bottom-right',
    theme: scriptTag.getAttribute('data-theme') || 'dark',
    autoOpen: scriptTag.getAttribute('data-auto-open') === 'true',
    language: scriptTag.getAttribute('data-language') || 'en',
    baseUrl: scriptTag.getAttribute('data-base-url') || _inferBaseUrl(),
  };

  function _inferBaseUrl() {
    if (scriptTag.src) {
      try {
        var u = new URL(scriptTag.src);
        return u.origin;
      } catch (_) { /* ignore */ }
    }
    return window.location.origin;
  }

  // ── Agent config (populated from API) ──────────────────────────────
  var AGENT = {
    name: 'AI Assistant',
    avatar: '',
    greeting: 'Hello! How can I help you today?',
    primaryColor: '#6366f1',
    accentColor: '#8b5cf6',
    theme: CONFIG.theme,
    language: CONFIG.language,
    voiceEnabled: true,
  };

  // ── State ──────────────────────────────────────────────────────────
  var state = {
    open: false,
    mode: 'text',          // 'text' | 'voice'
    recording: false,
    connected: false,
    connecting: false,
    messages: [],
    ws: null,
    mediaRecorder: null,
    audioChunks: [],
    recordingStartTime: 0,
    recordingTimer: null,
    sessionId: _uuid(),
    audioContext: null,
  };

  // ── SVG Icons (inlined for zero-dep) ───────────────────────────────
  var ICONS = {
    mic: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    minimize: '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>',
    headphones: '<svg viewBox="0 0 24 24"><path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24"><path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>',
    bubble: '<svg viewBox="0 0 24 24"><path d="M12 1C5.93 1 1 5.37 1 10.74c0 3.13 1.67 5.93 4.29 7.72L4 23l5.07-2.73c.94.18 1.93.27 2.93.27 6.07 0 11-4.37 11-9.74S18.07 1 12 1zm0 17.5c-.9 0-1.78-.12-2.63-.35l-.62-.17-3.12 1.68.73-2.7-.46-.35C4.07 15.16 3 13.04 3 10.74 3 6.48 7.04 3 12 3s9 3.48 9 7.74-4.04 7.76-9 7.76z"/><circle cx="8" cy="11" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/></svg>',
  };

  // ── CSS (embedded so we ship a single file) ────────────────────────
  var WIDGET_CSS = '' +
    ':host{all:initial;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;font-size:14px;line-height:1.5;color:#e2e8f0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
    '#vf-widget-root{' +
      '--vf-primary:#6366f1;--vf-primary-hover:#818cf8;--vf-accent:#8b5cf6;' +
      '--vf-bg:#0f172a;--vf-bg-panel:rgba(15,23,42,0.92);--vf-bg-input:rgba(30,41,59,0.8);' +
      '--vf-bg-msg-ai:rgba(30,41,59,0.7);--vf-bg-msg-user:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);' +
      '--vf-border:rgba(148,163,184,0.15);--vf-text:#e2e8f0;--vf-text-muted:#94a3b8;' +
      '--vf-shadow:0 25px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(148,163,184,0.08);' +
      '--vf-radius:16px;--vf-radius-sm:10px;--vf-radius-msg:18px;' +
      '--vf-transition:cubic-bezier(0.4,0,0.2,1);--vf-red:#ef4444;--vf-green:#22c55e;' +
      'position:fixed;z-index:2147483647;font-family:inherit}' +
    '#vf-widget-root.vf-light{' +
      '--vf-bg:#fff;--vf-bg-panel:rgba(255,255,255,0.95);--vf-bg-input:rgba(241,245,249,0.9);' +
      '--vf-bg-msg-ai:rgba(241,245,249,0.9);--vf-border:rgba(148,163,184,0.25);' +
      '--vf-text:#1e293b;--vf-text-muted:#64748b;' +
      '--vf-shadow:0 25px 60px rgba(0,0,0,0.15),0 0 0 1px rgba(148,163,184,0.12)}' +
    '#vf-widget-root.vf-bottom-right{bottom:20px;right:20px}' +
    '#vf-widget-root.vf-bottom-left{bottom:20px;left:20px}' +

    /* Bubble */
    '#vf-bubble{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--vf-primary) 0%,var(--vf-accent) 100%);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 32px rgba(99,102,241,0.4);transition:transform .3s var(--vf-transition),box-shadow .3s var(--vf-transition);position:relative;user-select:none;-webkit-tap-highlight-color:transparent}' +
    '#vf-bubble:hover{transform:scale(1.08);box-shadow:0 12px 40px rgba(99,102,241,0.5)}' +
    '#vf-bubble:active{transform:scale(0.95)}' +
    '#vf-bubble svg{width:28px;height:28px;fill:#fff;transition:transform .3s var(--vf-transition)}' +
    '#vf-bubble.vf-open svg{transform:rotate(90deg)}' +
    '#vf-bubble::before{content:"";position:absolute;width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,var(--vf-primary) 0%,var(--vf-accent) 100%);opacity:0;animation:vf-pulse 2.5s ease-out infinite;pointer-events:none}' +
    '#vf-bubble.vf-open::before{animation:none;opacity:0}' +
    '@keyframes vf-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.8);opacity:0}}' +

    /* Panel */
    '#vf-panel{position:absolute;bottom:76px;right:0;width:380px;height:560px;max-height:calc(100vh - 120px);background:var(--vf-bg-panel);backdrop-filter:blur(24px) saturate(1.8);-webkit-backdrop-filter:blur(24px) saturate(1.8);border-radius:var(--vf-radius);border:1px solid var(--vf-border);box-shadow:var(--vf-shadow);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(16px) scale(0.96);pointer-events:none;transition:opacity .35s var(--vf-transition),transform .35s var(--vf-transition)}' +
    '#vf-panel.vf-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}' +
    '.vf-bottom-left #vf-panel{right:auto;left:0}' +

    /* Header */
    '#vf-header{display:flex;align-items:center;gap:12px;padding:16px 16px 14px;border-bottom:1px solid var(--vf-border);background:linear-gradient(180deg,rgba(99,102,241,0.08) 0%,transparent 100%);flex-shrink:0}' +
    '#vf-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--vf-primary);flex-shrink:0;background:var(--vf-bg-input)}' +
    '#vf-agent-info{flex:1;min-width:0}' +
    '#vf-agent-name{display:block;font-weight:600;font-size:14px;color:var(--vf-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#vf-agent-status{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--vf-text-muted);margin-top:1px}' +
    '.vf-status-dot{width:7px;height:7px;border-radius:50%;background:var(--vf-green);flex-shrink:0}' +
    '#vf-controls{display:flex;gap:4px;flex-shrink:0}' +
    '#vf-controls button{width:30px;height:30px;border:none;background:transparent;color:var(--vf-text-muted);font-size:18px;cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:background .2s,color .2s}' +
    '#vf-controls button:hover{background:rgba(148,163,184,0.1);color:var(--vf-text)}' +
    '#vf-controls button svg{width:16px;height:16px;fill:currentColor}' +

    /* Messages */
    '#vf-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;overscroll-behavior:contain}' +
    '#vf-messages::-webkit-scrollbar{width:5px}#vf-messages::-webkit-scrollbar-track{background:transparent}#vf-messages::-webkit-scrollbar-thumb{background:rgba(148,163,184,0.2);border-radius:10px}' +
    '.vf-msg{max-width:82%;padding:10px 14px;border-radius:var(--vf-radius-msg);font-size:13.5px;line-height:1.55;word-wrap:break-word;animation:vf-msg-in .3s var(--vf-transition);position:relative}' +
    '@keyframes vf-msg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
    '.vf-msg-ai{align-self:flex-start;background:var(--vf-bg-msg-ai);color:var(--vf-text);border-bottom-left-radius:4px}' +
    '.vf-msg-user{align-self:flex-end;background:var(--vf-bg-msg-user);color:#fff;border-bottom-right-radius:4px}' +
    '.vf-msg-time{font-size:10px;color:var(--vf-text-muted);margin-top:4px;opacity:.7}' +
    '.vf-msg-user .vf-msg-time{color:rgba(255,255,255,0.6)}' +

    /* Audio play */
    '.vf-audio-play{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:5px 10px;border:1px solid var(--vf-border);border-radius:20px;background:transparent;color:var(--vf-primary-hover);font-size:12px;cursor:pointer;transition:background .2s,border-color .2s}' +
    '.vf-audio-play:hover{background:rgba(99,102,241,0.1);border-color:var(--vf-primary)}' +
    '.vf-audio-play svg{width:14px;height:14px;fill:currentColor}' +

    /* Typing */
    '.vf-typing{align-self:flex-start;display:flex;gap:5px;padding:12px 18px;background:var(--vf-bg-msg-ai);border-radius:var(--vf-radius-msg);border-bottom-left-radius:4px}' +
    '.vf-typing-dot{width:7px;height:7px;border-radius:50%;background:var(--vf-text-muted);animation:vf-bounce 1.4s ease-in-out infinite}' +
    '.vf-typing-dot:nth-child(2){animation-delay:.16s}.vf-typing-dot:nth-child(3){animation-delay:.32s}' +
    '@keyframes vf-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1}}' +

    /* Recording indicator */
    '.vf-recording-indicator{display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(239,68,68,0.1);border-radius:var(--vf-radius-sm);border:1px solid rgba(239,68,68,0.2);font-size:12px;color:var(--vf-red);animation:vf-msg-in .3s var(--vf-transition)}' +
    '.vf-rec-dot{width:10px;height:10px;border-radius:50%;background:var(--vf-red);animation:vf-rec-pulse 1s ease-in-out infinite;flex-shrink:0}' +
    '@keyframes vf-rec-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(0.8)}}' +
    '.vf-rec-timer{font-variant-numeric:tabular-nums}' +

    /* Live transcript */
    '.vf-live-transcript{align-self:flex-end;max-width:82%;padding:8px 14px;background:rgba(99,102,241,0.15);border:1px dashed rgba(99,102,241,0.3);border-radius:var(--vf-radius-msg);border-bottom-right-radius:4px;font-size:13px;color:var(--vf-text-muted);font-style:italic;animation:vf-msg-in .2s var(--vf-transition)}' +

    /* Input area */
    '#vf-input-area{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--vf-border);background:rgba(15,23,42,0.4);flex-shrink:0}' +
    '.vf-light #vf-input-area{background:rgba(241,245,249,0.5)}' +
    '#vf-text-input{flex:1;height:40px;padding:0 14px;background:var(--vf-bg-input);border:1px solid var(--vf-border);border-radius:20px;color:var(--vf-text);font-size:13.5px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s}' +
    '#vf-text-input::placeholder{color:var(--vf-text-muted)}' +
    '#vf-text-input:focus{border-color:var(--vf-primary);box-shadow:0 0 0 3px rgba(99,102,241,0.15)}' +

    /* Mic + Send buttons */
    '#vf-mic-btn,#vf-send-btn{width:40px;height:40px;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s,transform .15s;flex-shrink:0;-webkit-tap-highlight-color:transparent}' +
    '#vf-mic-btn{background:var(--vf-bg-input);border:1px solid var(--vf-border);color:var(--vf-text-muted)}' +
    '#vf-mic-btn:hover{background:rgba(99,102,241,0.15);color:var(--vf-primary-hover);border-color:var(--vf-primary)}' +
    '#vf-mic-btn.vf-recording{background:rgba(239,68,68,0.15);border-color:var(--vf-red);color:var(--vf-red);animation:vf-mic-glow 1.2s ease-in-out infinite}' +
    '@keyframes vf-mic-glow{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.3)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}' +
    '#vf-mic-btn svg,#vf-send-btn svg{width:18px;height:18px;fill:currentColor}' +
    '#vf-send-btn{background:linear-gradient(135deg,var(--vf-primary) 0%,var(--vf-accent) 100%);color:#fff}' +
    '#vf-send-btn:hover{filter:brightness(1.1);transform:scale(1.05)}' +
    '#vf-send-btn:active{transform:scale(0.95)}' +
    '#vf-send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;filter:none}' +

    /* Powered by */
    '#vf-powered-by{text-align:center;padding:6px 16px 8px;font-size:10px;color:var(--vf-text-muted);opacity:.6;letter-spacing:.3px;flex-shrink:0}' +
    '#vf-powered-by a{color:var(--vf-primary-hover);text-decoration:none}#vf-powered-by a:hover{text-decoration:underline}' +

    /* Welcome */
    '.vf-welcome{text-align:center;padding:24px 16px}' +
    '.vf-welcome-icon{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;background:linear-gradient(135deg,var(--vf-primary) 0%,var(--vf-accent) 100%);display:flex;align-items:center;justify-content:center}' +
    '.vf-welcome-icon svg{width:28px;height:28px;fill:#fff}' +
    '.vf-welcome h3{font-size:16px;font-weight:600;color:var(--vf-text);margin-bottom:6px}' +
    '.vf-welcome p{font-size:13px;color:var(--vf-text-muted);line-height:1.5}' +

    /* Connection status */
    '.vf-connection-status{padding:6px 12px;text-align:center;font-size:11px;background:rgba(234,179,8,0.1);color:#eab308;border-bottom:1px solid rgba(234,179,8,0.15);flex-shrink:0}' +
    '.vf-connection-status.vf-connected{display:none}' +
    '.vf-connection-status.vf-error{background:rgba(239,68,68,0.1);color:var(--vf-red);border-color:rgba(239,68,68,0.15)}' +

    /* Mode toggle */
    '.vf-mode-toggle{display:flex;align-items:center;gap:6px;padding:4px;background:var(--vf-bg-input);border-radius:20px;border:1px solid var(--vf-border);flex-shrink:0;margin:0 16px 4px}' +
    '.vf-mode-toggle button{flex:1;padding:5px 12px;border:none;border-radius:16px;background:transparent;color:var(--vf-text-muted);font-size:12px;font-family:inherit;cursor:pointer;transition:background .2s,color .2s;display:flex;align-items:center;justify-content:center;gap:5px}' +
    '.vf-mode-toggle button.vf-active{background:var(--vf-primary);color:#fff}' +
    '.vf-mode-toggle button svg{width:14px;height:14px;fill:currentColor}' +

    /* Error toast */
    '.vf-error-toast{position:absolute;bottom:80px;left:16px;right:16px;padding:10px 14px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:var(--vf-radius-sm);color:var(--vf-red);font-size:12px;text-align:center;animation:vf-msg-in .3s var(--vf-transition);z-index:10}' +

    /* Mobile */
    '@media(max-width:640px){' +
      '#vf-widget-root{bottom:0!important;right:0!important;left:0!important}' +
      '#vf-bubble{position:fixed;bottom:16px;right:16px}' +
      '.vf-bottom-left #vf-bubble{right:auto;left:16px}' +
      '#vf-panel{position:fixed;bottom:0;left:0;right:0;width:100%;height:100%;max-height:100vh;border-radius:0;border:none}' +
      '#vf-panel.vf-visible{transform:translateY(0)}' +
      '#vf-panel:not(.vf-visible){transform:translateY(100%)}' +
    '}' +
  '';

  // ── Utility helpers ────────────────────────────────────────────────
  function _uuid() {
    return 'vf-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function _timeStr() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function _formatDuration(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── Build the widget DOM inside Shadow DOM ─────────────────────────
  var hostEl = document.createElement('div');
  hostEl.id = 'voiceflow-widget-host';
  hostEl.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  document.body.appendChild(hostEl);

  var shadow = hostEl.attachShadow({ mode: 'open' });

  // Inject styles
  var styleEl = document.createElement('style');
  styleEl.textContent = WIDGET_CSS;
  shadow.appendChild(styleEl);

  // Root container
  var root = document.createElement('div');
  root.id = 'vf-widget-root';
  root.className = 'vf-' + CONFIG.position + (CONFIG.theme === 'light' ? ' vf-light' : '');
  shadow.appendChild(root);

  // Build the HTML structure
  root.innerHTML = '' +
    '<div id="vf-bubble">' + ICONS.bubble + '</div>' +
    '<div id="vf-panel">' +
      '<div id="vf-header">' +
        '<div id="vf-avatar-wrap"><img id="vf-avatar" src="" alt="Agent" /></div>' +
        '<div id="vf-agent-info">' +
          '<span id="vf-agent-name">AI Assistant</span>' +
          '<div id="vf-agent-status"><span class="vf-status-dot"></span> Online</div>' +
        '</div>' +
        '<div id="vf-controls">' +
          '<button id="vf-minimize" title="Minimize">' + ICONS.minimize + '</button>' +
          '<button id="vf-close" title="Close">' + ICONS.close + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="vf-connection-status vf-connected" id="vf-conn-status">Connecting...</div>' +
      '<div id="vf-messages"></div>' +
      '<div class="vf-mode-toggle" id="vf-mode-toggle">' +
        '<button class="vf-active" id="vf-mode-text">' + ICONS.keyboard + ' Text</button>' +
        '<button id="vf-mode-voice">' + ICONS.mic + ' Voice</button>' +
      '</div>' +
      '<div id="vf-input-area">' +
        '<input id="vf-text-input" placeholder="Type a message..." autocomplete="off" />' +
        '<button id="vf-mic-btn" title="Record voice">' + ICONS.mic + '</button>' +
        '<button id="vf-send-btn" title="Send">' + ICONS.send + '</button>' +
      '</div>' +
      '<div id="vf-powered-by">Powered by <a href="https://voiceflow.ai" target="_blank" rel="noopener">VoiceFlow AI</a></div>' +
    '</div>';

  // ── Element references (via Shadow DOM) ────────────────────────────
  var $ = function (sel) { return shadow.querySelector(sel); };
  var el = {
    root: root,
    bubble: $('#vf-bubble'),
    panel: $('#vf-panel'),
    header: $('#vf-header'),
    avatar: $('#vf-avatar'),
    agentName: $('#vf-agent-name'),
    connStatus: $('#vf-conn-status'),
    messages: $('#vf-messages'),
    modeToggle: $('#vf-mode-toggle'),
    modeText: $('#vf-mode-text'),
    modeVoice: $('#vf-mode-voice'),
    inputArea: $('#vf-input-area'),
    textInput: $('#vf-text-input'),
    micBtn: $('#vf-mic-btn'),
    sendBtn: $('#vf-send-btn'),
    minimize: $('#vf-minimize'),
    close: $('#vf-close'),
  };

  // ── Fetch agent config from API ────────────────────────────────────
  function fetchAgentConfig() {
    var url = CONFIG.baseUrl + '/api/v1/widget/agent/' + encodeURIComponent(CONFIG.agentId);
    fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        AGENT.name = data.name || AGENT.name;
        AGENT.avatar = data.avatar_url || data.avatar || '';
        AGENT.greeting = data.greeting || data.welcome_message || AGENT.greeting;
        AGENT.primaryColor = data.primary_color || data.branding?.primary_color || AGENT.primaryColor;
        AGENT.accentColor = data.accent_color || data.branding?.accent_color || AGENT.accentColor;
        AGENT.theme = data.theme || AGENT.theme;
        AGENT.language = data.language || AGENT.language;
        AGENT.voiceEnabled = data.voice_enabled !== false;
        applyAgentConfig();
      })
      .catch(function (err) {
        // Graceful fallback: use defaults
        _log('Agent config fetch failed, using defaults:', err.message);
        applyAgentConfig();
      });
  }

  function applyAgentConfig() {
    el.agentName.textContent = AGENT.name;
    if (AGENT.avatar) {
      el.avatar.src = AGENT.avatar;
      el.avatar.style.display = '';
    } else {
      // Generate a placeholder avatar
      el.avatar.style.display = 'none';
    }

    // Apply custom colors
    root.style.setProperty('--vf-primary', AGENT.primaryColor);
    root.style.setProperty('--vf-accent', AGENT.accentColor);

    // Theme
    if (AGENT.theme === 'light') {
      root.classList.add('vf-light');
    } else {
      root.classList.remove('vf-light');
    }

    // Hide mic button if voice not enabled
    if (!AGENT.voiceEnabled) {
      el.micBtn.style.display = 'none';
      el.modeToggle.style.display = 'none';
    }

    // Show welcome
    showWelcome();

    // Auto-open if configured
    if (CONFIG.autoOpen) {
      setTimeout(function () { togglePanel(true); }, 800);
    }
  }

  // ── Welcome message ────────────────────────────────────────────────
  function showWelcome() {
    el.messages.innerHTML = '' +
      '<div class="vf-welcome">' +
        '<div class="vf-welcome-icon">' + ICONS.headphones + '</div>' +
        '<h3>Hi! I\'m ' + _esc(AGENT.name) + '</h3>' +
        '<p>' + _esc(AGENT.greeting) + '</p>' +
      '</div>';
  }

  // ── Toggle panel ───────────────────────────────────────────────────
  function togglePanel(forceOpen) {
    state.open = typeof forceOpen === 'boolean' ? forceOpen : !state.open;

    if (state.open) {
      el.panel.classList.add('vf-visible');
      el.bubble.classList.add('vf-open');
      el.textInput.focus();
      connectWebSocket();
      _analytics('widget_opened');
    } else {
      el.panel.classList.remove('vf-visible');
      el.bubble.classList.remove('vf-open');
      stopRecording();
    }
  }

  // ── Messages ───────────────────────────────────────────────────────
  function addMessage(role, text, audioBase64, audioFormat) {
    // Remove welcome on first message
    var welcome = el.messages.querySelector('.vf-welcome');
    if (welcome) welcome.remove();

    // Remove typing indicator
    removeTyping();

    var msg = {
      id: _uuid(),
      role: role,   // 'ai' | 'user'
      text: text,
      time: _timeStr(),
      audioBase64: audioBase64 || null,
      audioFormat: audioFormat || 'wav',
    };
    state.messages.push(msg);

    var div = document.createElement('div');
    div.className = 'vf-msg vf-msg-' + role;
    div.id = msg.id;

    var html = '<div class="vf-msg-text">' + _esc(text) + '</div>';

    if (audioBase64 && role === 'ai') {
      html += '<button class="vf-audio-play" data-audio="' + msg.id + '">' +
        ICONS.play + ' Play audio</button>';
    }

    html += '<div class="vf-msg-time">' + msg.time + '</div>';
    div.innerHTML = html;

    el.messages.appendChild(div);
    el.messages.scrollTop = el.messages.scrollHeight;

    // Bind audio play
    if (audioBase64 && role === 'ai') {
      var btn = div.querySelector('.vf-audio-play');
      btn.addEventListener('click', function () {
        playAudio(audioBase64, audioFormat, btn);
      });
    }

    _analytics('message_' + role, { length: text.length });
    return msg;
  }

  function showTyping() {
    if (el.messages.querySelector('.vf-typing')) return;
    var div = document.createElement('div');
    div.className = 'vf-typing';
    div.innerHTML = '<span class="vf-typing-dot"></span><span class="vf-typing-dot"></span><span class="vf-typing-dot"></span>';
    el.messages.appendChild(div);
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function removeTyping() {
    var t = el.messages.querySelector('.vf-typing');
    if (t) t.remove();
  }

  function showRecordingIndicator() {
    if (el.messages.querySelector('.vf-recording-indicator')) return;
    var div = document.createElement('div');
    div.className = 'vf-recording-indicator';
    div.innerHTML = '<span class="vf-rec-dot"></span> Recording... <span class="vf-rec-timer" id="vf-rec-timer">00:00</span>';
    el.messages.appendChild(div);
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function removeRecordingIndicator() {
    var r = el.messages.querySelector('.vf-recording-indicator');
    if (r) r.remove();
  }

  function updateRecordingTimer() {
    var timerEl = el.messages.querySelector('#vf-rec-timer');
    if (timerEl && state.recording) {
      timerEl.textContent = _formatDuration(Date.now() - state.recordingStartTime);
    }
  }

  function showLiveTranscript(text) {
    var existing = el.messages.querySelector('.vf-live-transcript');
    if (existing) {
      existing.textContent = text;
    } else {
      var div = document.createElement('div');
      div.className = 'vf-live-transcript';
      div.textContent = text;
      el.messages.appendChild(div);
    }
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function removeLiveTranscript() {
    var t = el.messages.querySelector('.vf-live-transcript');
    if (t) t.remove();
  }

  function showError(msg) {
    // Remove existing error
    var existing = shadow.querySelector('.vf-error-toast');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.className = 'vf-error-toast';
    div.textContent = msg;
    el.panel.appendChild(div);
    setTimeout(function () { div.remove(); }, 4000);
  }

  // ── WebSocket connection ───────────────────────────────────────────
  var wsReconnectAttempts = 0;
  var wsMaxReconnects = 5;
  var wsReconnectTimer = null;

  function connectWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    state.connecting = true;
    updateConnectionStatus('connecting');

    var proto = CONFIG.baseUrl.startsWith('https') ? 'wss' : 'ws';
    var host = CONFIG.baseUrl.replace(/^https?:\/\//, '');
    var wsUrl = proto + '://' + host + '/api/v1/voice/conversation/ws?agent_id=' +
      encodeURIComponent(CONFIG.agentId) + '&session_id=' + encodeURIComponent(state.sessionId) +
      '&language=' + encodeURIComponent(AGENT.language);

    try {
      state.ws = new WebSocket(wsUrl);
    } catch (err) {
      _log('WebSocket creation failed:', err.message);
      state.connecting = false;
      updateConnectionStatus('error');
      return;
    }

    state.ws.binaryType = 'arraybuffer';

    state.ws.onopen = function () {
      state.connected = true;
      state.connecting = false;
      wsReconnectAttempts = 0;
      updateConnectionStatus('connected');
      _log('WebSocket connected');
    };

    state.ws.onmessage = function (event) {
      if (typeof event.data === 'string') {
        handleWSTextMessage(event.data);
      } else {
        // Binary audio data
        handleWSAudioData(event.data);
      }
    };

    state.ws.onerror = function () {
      _log('WebSocket error');
    };

    state.ws.onclose = function (event) {
      state.connected = false;
      state.connecting = false;
      _log('WebSocket closed:', event.code, event.reason);

      if (state.open && wsReconnectAttempts < wsMaxReconnects) {
        wsReconnectAttempts++;
        var delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 15000);
        updateConnectionStatus('reconnecting');
        wsReconnectTimer = setTimeout(connectWebSocket, delay);
      } else if (wsReconnectAttempts >= wsMaxReconnects) {
        updateConnectionStatus('error');
      }
    };
  }

  function handleWSTextMessage(raw) {
    try {
      var msg = JSON.parse(raw);
    } catch (_) {
      return;
    }

    switch (msg.type) {
      case 'response':
      case 'ai_response':
        removeTyping();
        removeLiveTranscript();
        addMessage('ai', msg.text || msg.payload?.text || '', msg.audio_base64 || msg.payload?.audio_base64, msg.audio_format || 'wav');
        // Auto-play audio if in voice mode
        if (state.mode === 'voice' && (msg.audio_base64 || msg.payload?.audio_base64)) {
          playAudio(msg.audio_base64 || msg.payload?.audio_base64, msg.audio_format || 'wav');
        }
        break;

      case 'transcription':
      case 'partial_transcript':
        showLiveTranscript(msg.text || msg.payload?.text || '...');
        break;

      case 'final_transcript':
        removeLiveTranscript();
        addMessage('user', msg.text || msg.payload?.text || '');
        showTyping();
        break;

      case 'processing':
      case 'thinking':
        showTyping();
        break;

      case 'error':
        removeTyping();
        showError(msg.message || msg.payload?.message || 'Something went wrong');
        break;

      case 'pong':
        break;

      default:
        _log('Unknown WS message type:', msg.type);
    }
  }

  var pendingAudioBuffer = [];

  function handleWSAudioData(arrayBuffer) {
    // AI is streaming audio back — play it
    playAudioBuffer(arrayBuffer);
  }

  function updateConnectionStatus(status) {
    var cs = el.connStatus;
    cs.className = 'vf-connection-status';

    switch (status) {
      case 'connected':
        cs.classList.add('vf-connected');
        cs.textContent = 'Connected';
        break;
      case 'connecting':
        cs.textContent = 'Connecting...';
        break;
      case 'reconnecting':
        cs.textContent = 'Reconnecting... (attempt ' + wsReconnectAttempts + ')';
        break;
      case 'error':
        cs.classList.add('vf-error');
        cs.textContent = 'Connection lost. Messages will be sent via REST.';
        break;
    }
  }

  // ── Send message (text) ────────────────────────────────────────────
  function sendTextMessage(text) {
    if (!text.trim()) return;
    addMessage('user', text.trim());
    showTyping();
    el.textInput.value = '';

    if (state.connected && state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'text_message',
        text: text.trim(),
        session_id: state.sessionId,
        language: AGENT.language,
      }));
    } else {
      // REST fallback
      sendTextViaREST(text.trim());
    }

    _analytics('message_sent', { mode: 'text' });
  }

  function sendTextViaREST(text) {
    var url = CONFIG.baseUrl + '/api/v1/widget/message';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: CONFIG.agentId,
        session_id: state.sessionId,
        text: text,
        language: AGENT.language,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        removeTyping();
        addMessage('ai', data.text || data.response || 'Sorry, I could not process that.', data.audio_base64, data.audio_format);
        if (state.mode === 'voice' && data.audio_base64) {
          playAudio(data.audio_base64, data.audio_format || 'wav');
        }
      })
      .catch(function (err) {
        removeTyping();
        showError('Failed to get response. Please try again.');
        _log('REST message failed:', err.message);
      });
  }

  // ── Voice recording ────────────────────────────────────────────────
  function startRecording() {
    if (state.recording) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('Microphone not supported in this browser.');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        state.recording = true;
        state.audioChunks = [];
        state.recordingStartTime = Date.now();

        el.micBtn.classList.add('vf-recording');
        showRecordingIndicator();

        // Start timer
        state.recordingTimer = setInterval(updateRecordingTimer, 1000);

        // Detect best supported mime type
        var mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/ogg;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = ''; // Let browser decide
            }
          }
        }

        var options = mimeType ? { mimeType: mimeType } : {};
        state.mediaRecorder = new MediaRecorder(stream, options);

        state.mediaRecorder.ondataavailable = function (event) {
          if (event.data.size > 0) {
            state.audioChunks.push(event.data);

            // If WS is connected, stream chunks in real-time
            if (state.connected && state.ws && state.ws.readyState === WebSocket.OPEN) {
              event.data.arrayBuffer().then(function (buf) {
                state.ws.send(buf);
              });
            }
          }
        };

        state.mediaRecorder.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          handleRecordingComplete();
        };

        // Collect data every 250ms for streaming
        state.mediaRecorder.start(250);

        _analytics('voice_recording_started');
      })
      .catch(function (err) {
        _log('Microphone access denied:', err.message);
        showError('Microphone access denied. Please allow microphone access.');
      });
  }

  function stopRecording() {
    if (!state.recording || !state.mediaRecorder) return;

    state.recording = false;
    clearInterval(state.recordingTimer);
    el.micBtn.classList.remove('vf-recording');
    removeRecordingIndicator();

    if (state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
  }

  function handleRecordingComplete() {
    if (state.audioChunks.length === 0) return;

    var audioBlob = new Blob(state.audioChunks, { type: state.audioChunks[0].type || 'audio/webm' });
    state.audioChunks = [];

    // If WS was streaming, signal end of audio
    if (state.connected && state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'audio_end',
        session_id: state.sessionId,
        language: AGENT.language,
      }));
      showTyping();
    } else {
      // REST fallback — upload the full audio blob
      sendAudioViaREST(audioBlob);
    }

    _analytics('voice_recording_completed', { duration_ms: Date.now() - state.recordingStartTime });
  }

  function sendAudioViaREST(audioBlob) {
    showTyping();
    addMessage('user', '(Voice message)');

    var formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('language', AGENT.language);
    formData.append('system_prompt', 'You are ' + AGENT.name + '. Keep responses concise and helpful.');

    var url = CONFIG.baseUrl + '/api/v1/voice/respond';
    fetch(url, { method: 'POST', body: formData })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        removeTyping();
        removeLiveTranscript();

        // Update the user message with real transcription if available
        var analysis = data.analysis || {};
        var transcription = analysis.transcription || data.transcription || '';
        if (transcription) {
          // Replace the "(Voice message)" with actual transcription
          var lastUserMsg = state.messages.filter(function (m) { return m.role === 'user'; }).pop();
          if (lastUserMsg) {
            var msgEl = shadow.getElementById(lastUserMsg.id);
            if (msgEl) {
              var textEl = msgEl.querySelector('.vf-msg-text');
              if (textEl) textEl.textContent = transcription;
              lastUserMsg.text = transcription;
            }
          }
        }

        var aiText = data.response_text || data.text || data.response || 'I understood your message.';
        var audioB64 = data.response_audio?.audio_base64 || data.audio_base64 || null;
        var audioFmt = data.response_audio?.audio_format || data.audio_format || 'wav';

        addMessage('ai', aiText, audioB64, audioFmt);

        if (state.mode === 'voice' && audioB64) {
          playAudio(audioB64, audioFmt);
        }
      })
      .catch(function (err) {
        removeTyping();
        showError('Voice processing failed. Please try again.');
        _log('REST voice failed:', err.message);
      });
  }

  // ── Audio playback ─────────────────────────────────────────────────
  function getAudioContext() {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (autoplay policy)
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    return state.audioContext;
  }

  function playAudio(base64, format, buttonEl) {
    try {
      var binaryStr = atob(base64);
      var bytes = new Uint8Array(binaryStr.length);
      for (var i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      var mimeType = 'audio/' + (format || 'wav');
      var blob = new Blob([bytes], { type: mimeType });
      var url = URL.createObjectURL(blob);

      var audio = new Audio(url);
      audio.onended = function () {
        URL.revokeObjectURL(url);
        if (buttonEl) {
          buttonEl.innerHTML = ICONS.play + ' Play audio';
        }
      };
      audio.onerror = function () {
        // Fallback to Web Audio API for raw PCM data
        playAudioViaWebAudio(bytes.buffer);
        URL.revokeObjectURL(url);
      };

      if (buttonEl) {
        buttonEl.innerHTML = ICONS.stop + ' Playing...';
      }
      audio.play().catch(function (err) {
        _log('Audio play failed:', err.message);
        // Try Web Audio API
        playAudioViaWebAudio(bytes.buffer);
      });

      _analytics('audio_played');
    } catch (err) {
      _log('Audio decode failed:', err.message);
    }
  }

  function playAudioViaWebAudio(arrayBuffer) {
    var ctx = getAudioContext();
    ctx.decodeAudioData(arrayBuffer.slice(0), function (audioBuffer) {
      var source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    }, function (err) {
      _log('Web Audio decode failed:', err);
    });
  }

  function playAudioBuffer(arrayBuffer) {
    var ctx = getAudioContext();
    ctx.decodeAudioData(arrayBuffer.slice(0), function (audioBuffer) {
      var source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    }, function () {
      // If decoding fails, try as raw PCM
      _log('Streamed audio decode failed');
    });
  }

  // ── Mode toggle ────────────────────────────────────────────────────
  function setMode(mode) {
    state.mode = mode;
    if (mode === 'text') {
      el.modeText.classList.add('vf-active');
      el.modeVoice.classList.remove('vf-active');
      el.textInput.style.display = '';
      el.sendBtn.style.display = '';
    } else {
      el.modeVoice.classList.add('vf-active');
      el.modeText.classList.remove('vf-active');
      el.textInput.style.display = '';
      el.sendBtn.style.display = '';
    }
  }

  // ── Analytics (via postMessage to parent) ──────────────────────────
  function _analytics(event, data) {
    try {
      window.parent.postMessage({
        type: 'voiceflow_analytics',
        event: event,
        agent_id: CONFIG.agentId,
        session_id: state.sessionId,
        data: data || {},
        timestamp: new Date().toISOString(),
      }, '*');
    } catch (_) { /* ignore */ }
  }

  function _log() {
    if (typeof console !== 'undefined' && console.debug) {
      var args = ['[VoiceFlow Widget]'].concat(Array.prototype.slice.call(arguments));
      console.debug.apply(console, args);
    }
  }

  // ── Event bindings ─────────────────────────────────────────────────
  el.bubble.addEventListener('click', function () {
    togglePanel();
  });

  el.minimize.addEventListener('click', function () {
    togglePanel(false);
  });

  el.close.addEventListener('click', function () {
    togglePanel(false);
    // Disconnect WS
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    clearTimeout(wsReconnectTimer);
  });

  el.sendBtn.addEventListener('click', function () {
    sendTextMessage(el.textInput.value);
  });

  el.textInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(el.textInput.value);
    }
  });

  el.micBtn.addEventListener('click', function () {
    if (state.recording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  el.modeText.addEventListener('click', function () {
    setMode('text');
  });

  el.modeVoice.addEventListener('click', function () {
    setMode('voice');
  });

  // ── Keep WS alive with pings ───────────────────────────────────────
  setInterval(function () {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);

  // ── Public API (optional for advanced integrations) ────────────────
  window.VoiceFlowWidget = {
    open: function () { togglePanel(true); },
    close: function () { togglePanel(false); },
    sendMessage: function (text) { sendTextMessage(text); },
    setTheme: function (theme) {
      if (theme === 'light') root.classList.add('vf-light');
      else root.classList.remove('vf-light');
    },
    destroy: function () {
      if (state.ws) state.ws.close();
      clearTimeout(wsReconnectTimer);
      hostEl.remove();
      window.__vf_widget_loaded = false;
    },
    getSessionId: function () { return state.sessionId; },
  };

  // ── Initialize ─────────────────────────────────────────────────────
  function init() {
    fetchAgentConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
