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
