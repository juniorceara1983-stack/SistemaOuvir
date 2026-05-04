/**
 * SistemaOuvir – Content Script
 *
 * Injetado automaticamente em todas as abas pelo manifest.json.
 * Aguarda a mensagem "toggle" ou "updateConfig" vinda do popup/background.
 *
 * O script de lógica principal (sistemaOuvir.js) é inserido aqui de forma
 * auto-contida para não depender de importação de módulo em contexto de
 * content script.
 */

(function () {
  'use strict';

  // ─── Evita injeção dupla ──────────────────────────────────────────────────
  if (window.__sistemaOuvir) return;
  window.__sistemaOuvir = true;

  // ─── Configurações (sincronizadas com chrome.storage.sync) ────────────────
  var config = {
    enabled:         false,   // começa desativado; o usuário ativa pelo popup
    debounceDelay:   100,
    outlineDuration: 1500,
    outlineStyle:    '3px solid #FF6600',
    lang:            navigator.language || 'pt-BR',
    rate:            1.1,
    pitch:           1
  };

  // ─── Estado interno ────────────────────────────────────────────────────────
  var lastSpokenElement    = null;
  var debounceTimer        = null;
  var outlineTimer         = null;
  var previousOutlineEl    = null;
  var previousOutlineStyle = '';

  // ─── Utilitários ──────────────────────────────────────────────────────────

  function getReadableText(element) {
    if (!element || element === document.body || element === document.documentElement) return null;
    if (element.getAttribute('aria-hidden') === 'true') return null;

    var ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    var labelledById = element.getAttribute('aria-labelledby');
    if (labelledById) {
      var labelledText = labelledById.split(/\s+/).map(function (id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
      }).filter(Boolean).join(' ');
      if (labelledText) return labelledText;
    }

    var describedById = element.getAttribute('aria-describedby');
    if (describedById) {
      var descText = describedById.split(/\s+/).map(function (id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
      }).filter(Boolean).join(' ');
      if (descText) return descText;
    }

    var tag = element.tagName.toLowerCase();

    if (tag === 'img') {
      var altAttr = element.getAttribute('alt');
      var role    = element.getAttribute('role');
      if ((altAttr === '' || altAttr === null) && (role === 'presentation' || role === 'none')) return null;
      if (altAttr && altAttr.trim()) return altAttr.trim();
      return 'imagem sem descrição';
    }

    if (tag === 'svg') {
      var svgTitle = element.querySelector('title');
      if (svgTitle && svgTitle.textContent.trim()) return svgTitle.textContent.trim();
    }

    if (tag === 'input') {
      var inputType = (element.getAttribute('type') || 'text').toLowerCase();
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
        return element.value || inputType;
      }
      if (inputType === 'checkbox' || inputType === 'radio') {
        var cbLabel = getAssociatedLabelText(element);
        var checked = element.checked ? 'marcado' : 'desmarcado';
        return (cbLabel ? cbLabel + ', ' : '') + checked;
      }
      var placeholder = element.getAttribute('placeholder');
      var inputLabel  = getAssociatedLabelText(element);
      if (inputLabel) return 'campo ' + inputLabel + (placeholder ? ' – ' + placeholder : '');
      if (placeholder && placeholder.trim()) return 'campo: ' + placeholder.trim();
      return 'campo de entrada';
    }

    if (tag === 'select') {
      var selectLabel = getAssociatedLabelText(element);
      var selectedOpt = element.options[element.selectedIndex];
      var selectedTxt = selectedOpt ? selectedOpt.text : '';
      var base = selectLabel ? 'lista ' + selectLabel : 'lista de opções';
      return selectedTxt ? base + ': ' + selectedTxt : base;
    }

    if (tag === 'textarea') {
      var taLabel = getAssociatedLabelText(element);
      return taLabel ? 'área de texto: ' + taLabel : 'área de texto';
    }

    var title = element.getAttribute('title');
    if (title && title.trim()) return title.trim();

    var semanticTags = [
      'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'label', 'span', 'li', 'td', 'th', 'caption',
      'summary', 'figcaption', 'nav', 'article', 'section',
      'header', 'footer', 'main', 'aside', 'details', 'blockquote',
      'dt', 'dd', 'abbr', 'code', 'kbd', 'mark', 'time'
    ];
    if (semanticTags.indexOf(tag) !== -1) {
      var text = getVisibleText(element);
      if (text) return text;
    }

    var roleAttr = element.getAttribute('role');
    if (roleAttr) {
      var roleText = getVisibleText(element);
      if (roleText) return roleText;
    }

    return null;
  }

  function getAssociatedLabelText(input) {
    if (input.id) {
      var label = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
      if (label) return label.textContent.trim();
    }
    var parentLabel = input.closest('label');
    if (parentLabel) {
      return Array.from(parentLabel.childNodes)
        .filter(function (n) { return n.nodeType === Node.TEXT_NODE; })
        .map(function (n) { return n.textContent.trim(); })
        .filter(Boolean)
        .join(' ') || parentLabel.textContent.trim();
    }
    return null;
  }

  function getVisibleText(element) {
    var text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 200 ? text.slice(0, 197) + '…' : text;
  }

  // ─── Feedback visual ──────────────────────────────────────────────────────

  function applyOutline(element) {
    removeOutline();
    previousOutlineEl    = element;
    previousOutlineStyle = element.style.outline;
    element.style.outline       = config.outlineStyle;
    element.style.outlineOffset = '2px';
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(removeOutline, config.outlineDuration);
  }

  function removeOutline() {
    if (previousOutlineEl) {
      previousOutlineEl.style.outline       = previousOutlineStyle;
      previousOutlineEl.style.outlineOffset = '';
      previousOutlineEl    = null;
      previousOutlineStyle = '';
    }
  }

  // ─── Confirmação de campos ─────────────────────────────────────────────────

  function detectFieldType(input) {
    var attrs = [
      input.id || '',
      input.name || '',
      (input.getAttribute('placeholder') || ''),
      (input.getAttribute('aria-label') || ''),
      (getAssociatedLabelText(input) || ''),
      (input.getAttribute('type') || '')
    ].join(' ').toLowerCase();
    if (/\bcpf\b/.test(attrs))                                              return 'cpf';
    if (/\bcnpj\b/.test(attrs))                                             return 'cnpj';
    if (/telefone|celular|whatsapp|\bfone\b|\btel\b|\bphone\b/.test(attrs)) return 'telefone';
    if (/\bcep\b/.test(attrs))                                              return 'cep';
    if (/\bemail\b|e-mail/.test(attrs))                                     return 'email';
    return 'text';
  }

  function formatValueForSpeech(value, fieldType) {
    if (!value || !value.trim()) return null;
    if (fieldType === 'text' || fieldType === 'email') return value.trim();
    var digits = value.replace(/\D/g, '');
    if (!digits) return value.trim();
    return digits.split('').join(' ');
  }

  function getFieldLabel(input) {
    return getAssociatedLabelText(input) ||
           input.getAttribute('aria-label') ||
           input.getAttribute('placeholder') ||
           'campo';
  }

  function handleInputBlur(event) {
    if (!config.enabled) return;
    var input = event.target;
    if (!input) return;
    var tag = input.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return;
    var inputType = (input.getAttribute('type') || 'text').toLowerCase();
    if (['submit', 'button', 'reset', 'password'].indexOf(inputType) !== -1) return;
    var value = input.value;
    if (!value || !value.trim()) return;
    var fieldType = detectFieldType(input);
    var label     = getFieldLabel(input);
    var formatted = formatValueForSpeech(value, fieldType);
    if (!formatted) return;
    speak(label + ': ' + formatted + '. Está correto?');
  }

  function handleSelectChange(event) {
    if (!config.enabled) return;
    var select = event.target;
    if (!select || select.tagName.toLowerCase() !== 'select') return;
    var selectedOption = select.options[select.selectedIndex];
    var selectedText   = selectedOption ? selectedOption.text : '';
    if (!selectedText) return;
    var label = getAssociatedLabelText(select) || select.getAttribute('aria-label') || 'opção selecionada';
    speak(label + ': ' + selectedText);
  }

  // ─── Síntese de voz ───────────────────────────────────────────────────────

  function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var utterance   = new SpeechSynthesisUtterance(text);
    utterance.lang  = config.lang;
    utterance.rate  = config.rate;
    utterance.pitch = config.pitch;
    window.speechSynthesis.speak(utterance);
  }

  // ─── Limpeza de texto (remove números de versículos) ─────────────────────

  /**
   * Remove números isolados (versículos) do texto para uma leitura fluida.
   * Aplica a regex solicitada e normaliza espaços extras.
   */
  function cleanText(text) {
    return text
      .replace(/\s\d+\s/g, ' ')   // remove versículos no meio do texto
      .replace(/^\d+\s/,    '')   // remove versículo no início
      .replace(/\s\d+$/,    '')   // remove versículo no final
      .replace(/\s+/g,      ' ')  // normaliza espaços múltiplos
      .trim();
  }

  // ─── Canção Nova: leitura integral da Liturgia ────────────────────────────

  var CANCAO_NOVA_HOST = 'cancaonova.com';

  /** Verifica se a página atual é do domínio da Canção Nova */
  function isCancaoNovaPage() {
    var h = window.location.hostname;
    return h === CANCAO_NOVA_HOST || h.endsWith('.' + CANCAO_NOVA_HOST);
  }

  /** Seletores da área principal de leitura, do mais específico ao mais geral */
  var CONTENT_SELECTORS = [
    '.liturgy-content',
    '.post-content',
    '.entry-content',
    '.td-post-content',
    'article .content',
    'article',
    '[role="main"]',
    'main',
    '#content',
    '#main'
  ];

  function getMainContentArea() {
    for (var i = 0; i < CONTENT_SELECTORS.length; i++) {
      var el = document.querySelector(CONTENT_SELECTORS[i]);
      if (el) return el;
    }
    return document.body;
  }

  /** Coleta e une todos os parágrafos da área principal, removendo versículos */
  function collectLiturgyText() {
    var area = getMainContentArea();
    var paragraphs = Array.from(area.querySelectorAll('p'));
    if (paragraphs.length === 0) return '';

    var raw = paragraphs
      .map(function (p) { return (p.innerText || p.textContent || '').trim(); })
      .filter(function (t) { return t.length > 0; })
      .join(' ');

    return cleanText(raw);
  }

  /**
   * Divide o texto em segmentos menores, respeitando pausas naturais,
   * para evitar o limite de tamanho da Web Speech API.
   */
  function splitIntoChunks(text, maxLength) {
    var chunks   = [];
    var segments = text.match(/[^.!?;]+[.!?;]*/g) || [text];
    var current  = '';

    for (var i = 0; i < segments.length; i++) {
      var seg       = segments[i].trim();
      if (!seg) continue;
      var candidate = current ? current + ' ' + seg : seg;
      if (candidate.length <= maxLength || !current) {
        current = candidate;
      } else {
        chunks.push(current);
        current = seg;
      }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [text];
  }

  /** Maximum character length per speech chunk (avoids Web Speech API buffer limits) */
  var MAX_CHUNK_LENGTH = 200;

  var isPlayingLiturgy = false;

  /** Inicia ou interrompe a narração integral da liturgia */
  function speakLiturgy() {
    if (!window.speechSynthesis) return;

    if (isPlayingLiturgy) {
      window.speechSynthesis.cancel();
      isPlayingLiturgy = false;
      updateLiturgyButton(false);
      return;
    }

    var text = collectLiturgyText();
    if (!text) {
      speak('Nenhum texto de liturgia encontrado nesta página.');
      return;
    }

    isPlayingLiturgy = true;
    updateLiturgyButton(true);
    window.speechSynthesis.cancel();

    var chunks = splitIntoChunks(text, MAX_CHUNK_LENGTH);
    var index  = 0;

    function speakNext() {
      if (!isPlayingLiturgy || index >= chunks.length) {
        isPlayingLiturgy = false;
        updateLiturgyButton(false);
        return;
      }
      var utterance   = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang  = config.lang;
      utterance.rate  = config.rate;
      utterance.pitch = config.pitch;
      utterance.onend = speakNext;
      utterance.onerror = function () {
        isPlayingLiturgy = false;
        updateLiturgyButton(false);
      };
      window.speechSynthesis.speak(utterance);
    }

    speakNext();
  }

  function updateLiturgyButton(playing) {
    var btn = document.getElementById('sistemaOuvir-liturgy-btn');
    if (!btn) return;
    if (playing) {
      btn.textContent         = '⏹ Parar Leitura';
      btn.style.background    = '#333';
      btn.style.boxShadow     = '0 4px 16px rgba(0,0,0,0.35)';
    } else {
      btn.textContent         = '🔊 Ouvir Liturgia Completa';
      btn.style.background    = '#FF6600';
      btn.style.boxShadow     = '0 4px 16px rgba(0,0,0,0.25)';
    }
  }

  /** Injeta o botão flutuante "Ouvir Liturgia Completa" na página */
  function injectLiturgyButton() {
    if (document.getElementById('sistemaOuvir-liturgy-btn')) return;

    var btn = document.createElement('button');
    btn.id  = 'sistemaOuvir-liturgy-btn';
    btn.textContent = '🔊 Ouvir Liturgia Completa';
    btn.setAttribute('aria-label', 'Ouvir a liturgia completa em voz alta');
    btn.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:2147483647',
      'background:#FF6600',
      'color:#fff',
      'border:none',
      'border-radius:50px',
      'padding:12px 22px',
      'font-size:15px',
      'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
      'transition:background 0.2s,transform 0.1s',
      'font-family:Arial,sans-serif',
      'line-height:1.4',
      'letter-spacing:0.01em'
    ].join(';');

    btn.addEventListener('mouseenter', function () {
      if (!isPlayingLiturgy) btn.style.background = '#e55a00';
      btn.style.transform = 'scale(1.05)';
    });
    btn.addEventListener('mouseleave', function () {
      if (!isPlayingLiturgy) btn.style.background = '#FF6600';
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('click', speakLiturgy);

    document.body.appendChild(btn);
  }

  // Injeta o botão apenas no site da Canção Nova
  if (isCancaoNovaPage()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectLiturgyButton);
    } else {
      injectLiturgyButton();
    }
  }

  // ─── Lógica principal ─────────────────────────────────────────────────────

  function getRelevantElement(x, y) {
    var element = document.elementFromPoint(x, y);
    if (!element) return null;
    var candidate = element;
    for (var i = 0; i < 8; i++) {
      if (getReadableText(candidate)) return candidate;
      var parent = candidate.parentElement;
      if (!parent || candidate === document.body || candidate === document.documentElement) break;
      candidate = parent;
    }
    return element;
  }

  function handlePointerMove(x, y) {
    if (!config.enabled) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      var element = getRelevantElement(x, y);
      if (!element) return;
      if (element === lastSpokenElement) return;
      lastSpokenElement = element;
      var text = getReadableText(element);
      if (!text) return;
      applyOutline(element);
      speak(text);
    }, config.debounceDelay);
  }

  function handleFocusIn(event) {
    if (!config.enabled) return;
    var el = event.target;
    if (!el || el === document.body) return;
    var text = getReadableText(el);
    if (text) {
      applyOutline(el);
      speak(text);
      lastSpokenElement = el;
    }
  }

  // ─── Eventos DOM ──────────────────────────────────────────────────────────

  document.addEventListener('touchmove', function (event) {
    var touch = event.touches[0];
    if (touch) handlePointerMove(touch.clientX, touch.clientY);
  }, { passive: true });

  document.addEventListener('mousemove', function (event) {
    handlePointerMove(event.clientX, event.clientY);
  });

  document.addEventListener('touchend', function () {
    lastSpokenElement = null;
    clearTimeout(debounceTimer);
    removeOutline();
  });

  document.addEventListener('mouseup', function () {
    lastSpokenElement = null;
  });

  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('blur',    handleInputBlur,    true);
  document.addEventListener('change',  handleSelectChange, true);

  // ─── Mensagens vindas do popup / background ───────────────────────────────

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    switch (message.type) {
      case 'toggle':
        config.enabled = !config.enabled;
        if (!config.enabled) {
          window.speechSynthesis && window.speechSynthesis.cancel();
          removeOutline();
        }
        sendResponse({ enabled: config.enabled });
        break;

      case 'enable':
        config.enabled = true;
        sendResponse({ enabled: true });
        break;

      case 'disable':
        config.enabled = false;
        window.speechSynthesis && window.speechSynthesis.cancel();
        removeOutline();
        sendResponse({ enabled: false });
        break;

      case 'updateConfig':
        if (message.config) {
          Object.assign(config, message.config);
        }
        sendResponse({ ok: true });
        break;

      case 'getState':
        sendResponse({ enabled: config.enabled, config: config });
        break;

      case 'readFullLiturgy':
        speakLiturgy();
        sendResponse({ ok: true });
        break;
    }
    return true; // keep channel open for async responses
  });

  // ─── Inicialização: carrega estado salvo ──────────────────────────────────

  chrome.storage.sync.get(['enabled', 'rate', 'pitch', 'lang', 'debounce'], function (stored) {
    if (stored.enabled  !== undefined) config.enabled         = stored.enabled;
    if (stored.rate     !== undefined) config.rate            = stored.rate;
    if (stored.pitch    !== undefined) config.pitch           = stored.pitch;
    if (stored.lang     !== undefined) config.lang            = stored.lang;
    if (stored.debounce !== undefined) config.debounceDelay   = stored.debounce;
  });

})();
