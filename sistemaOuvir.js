/**
 * SistemaOuvir - Interface Auditiva por Toque
 * Vanilla JS | Web Speech API | Sem dependências externas
 *
 * Como usar:
 *   <script src="sistemaOuvir.js"></script>
 *   ou cole diretamente no console do navegador para testar.
 *
 * API pública (opcional):
 *   window.SistemaOuvir.enable()   – ativa o sistema
 *   window.SistemaOuvir.disable()  – desativa o sistema
 *   window.SistemaOuvir.toggle()   – alterna ativo/inativo
 *   window.SistemaOuvir.config({ rate, pitch, lang, debounce }) – ajusta configurações
 */

(function () {
  'use strict';

  // ─── Configurações padrão ─────────────────────────────────────────────────
  var config = {
    debounceDelay:   100,          // ms que o dedo precisa ficar parado antes de ler
    outlineDuration: 1500,         // ms que o destaque visual fica visível
    outlineStyle:    '3px solid #FF6600',
    lang:            navigator.language || 'pt-BR',
    rate:            1.1,
    pitch:           1,
    enabled:         true
  };

  // ─── Estado interno ────────────────────────────────────────────────────────
  var lastSpokenElement    = null;
  var debounceTimer        = null;
  var outlineTimer         = null;
  var previousOutlineEl    = null;
  var previousOutlineStyle = '';

  // ─── Utilitários ──────────────────────────────────────────────────────────

  /**
   * Extrai o texto a ser lido de um elemento.
   * Prioridade: aria-label > aria-labelledby > aria-describedby >
   *             alt (img) > placeholder (input) > label associado >
   *             title > role semântico > texto interno
   */
  function getReadableText(element) {
    if (!element || element === document.body || element === document.documentElement) return null;

    // Elementos ocultos do leitor de tela devem ser ignorados
    if (element.getAttribute('aria-hidden') === 'true') return null;

    // 1. aria-label tem a maior prioridade
    var ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 2. aria-labelledby referencia outro elemento
    var labelledById = element.getAttribute('aria-labelledby');
    if (labelledById) {
      var labelledText = labelledById.split(/\s+/).map(function (id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
      }).filter(Boolean).join(' ');
      if (labelledText) return labelledText;
    }

    // 3. aria-describedby como descrição complementar (usado quando não há label)
    var describedById = element.getAttribute('aria-describedby');
    if (describedById) {
      var descText = describedById.split(/\s+/).map(function (id) {
        var el = document.getElementById(id);
        return el ? el.textContent.trim() : '';
      }).filter(Boolean).join(' ');
      if (descText) return descText;
    }

    var tag = element.tagName.toLowerCase();

    // 4. Imagens: atributo alt
    if (tag === 'img') {
      // Imagem decorativa (alt vazio + role presentation/none)
      var altAttr = element.getAttribute('alt');
      var role = element.getAttribute('role');
      if ((altAttr === '' || altAttr === null) && (role === 'presentation' || role === 'none')) {
        return null; // ignora imagens decorativas
      }
      if (altAttr && altAttr.trim()) return altAttr.trim();
      return 'imagem sem descrição';
    }

    // 5. SVG: title interno
    if (tag === 'svg') {
      var svgTitle = element.querySelector('title');
      if (svgTitle && svgTitle.textContent.trim()) return svgTitle.textContent.trim();
    }

    // 6. Inputs
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

    // 7. Select
    if (tag === 'select') {
      var selectLabel = getAssociatedLabelText(element);
      var selectedOpt = element.options[element.selectedIndex];
      var selectedTxt = selectedOpt ? selectedOpt.text : '';
      var base = selectLabel ? 'lista ' + selectLabel : 'lista de opções';
      return selectedTxt ? base + ': ' + selectedTxt : base;
    }

    // 8. Textarea
    if (tag === 'textarea') {
      var taLabel = getAssociatedLabelText(element);
      return taLabel ? 'área de texto: ' + taLabel : 'área de texto';
    }

    // 9. title como fallback antes do texto interno
    var title = element.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // 10. Texto interno para elementos semânticos e interativos
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

    // 11. Elementos com role ARIA interativo
    var roleAttr = element.getAttribute('role');
    if (roleAttr) {
      var roleText = getVisibleText(element);
      if (roleText) return roleText;
    }

    return null;
  }

  /**
   * Busca o texto do <label> associado a um input pelo atributo for/id ou parentesco.
   */
  function getAssociatedLabelText(input) {
    if (input.id) {
      var label = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
      if (label) return label.textContent.trim();
    }
    var parentLabel = input.closest('label');
    if (parentLabel) {
      // evita incluir o valor do próprio input no texto do label
      return parentLabel.querySelector('input,select,textarea') ?
        Array.from(parentLabel.childNodes)
          .filter(function (n) { return n.nodeType === Node.TEXT_NODE; })
          .map(function (n) { return n.textContent.trim(); })
          .filter(Boolean)
          .join(' ') :
        parentLabel.textContent.trim();
    }
    return null;
  }

  /**
   * Retorna o texto visível de um elemento (trim, colapsa espaços).
   * Limita a 200 caracteres para não gerar falas longas demais.
   */
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

  // ─── Confirmação de campos de formulário ──────────────────────────────────

  /**
   * Detecta o tipo semântico do campo com base em id, name, placeholder e label.
   * Retorna: 'cpf' | 'cnpj' | 'telefone' | 'cep' | 'email' | 'text'
   */
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
    if (/\bemail\b|e-mail/.test(attrs) || attrs.includes('type=email'))     return 'email';
    return 'text';
  }

  /**
   * Converte o valor digitado em texto otimizado para fala.
   * Campos de código numérico têm seus dígitos separados por espaço.
   */
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
    var input = event.target;
    if (!input) return;
    var tag = input.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return;

    var inputType = (input.getAttribute('type') || 'text').toLowerCase();
    if (inputType === 'submit' || inputType === 'button' ||
        inputType === 'reset'  || inputType === 'password') return;

    var value = input.value;
    if (!value || !value.trim()) return;

    var fieldType = detectFieldType(input);
    var label     = getFieldLabel(input);
    var formatted = formatValueForSpeech(value, fieldType);
    if (!formatted) return;

    speak(label + ': ' + formatted + '. Está correto?');
  }

  function handleSelectChange(event) {
    var select = event.target;
    if (!select || select.tagName.toLowerCase() !== 'select') return;
    var selectedOption = select.options[select.selectedIndex];
    var selectedText   = selectedOption ? selectedOption.text : '';
    if (!selectedText) return;
    var label = getAssociatedLabelText(select) ||
                select.getAttribute('aria-label') ||
                'opção selecionada';
    speak(label + ': ' + selectedText);
  }

  // ─── Síntese de voz ───────────────────────────────────────────────────────

  function speak(text) {
    if (!window.speechSynthesis) {
      console.warn('[SistemaOuvir] Web Speech API não disponível neste navegador.');
      return;
    }
    window.speechSynthesis.cancel();
    var utterance  = new SpeechSynthesisUtterance(text);
    utterance.lang  = config.lang;
    utterance.rate  = config.rate;
    utterance.pitch = config.pitch;
    window.speechSynthesis.speak(utterance);
  }

  // ─── Reconhecimento de Voz (Speech-to-Text) ──────────────────────────────

  var voiceRecognition = null;
  var isListening      = false;

  /**
   * Ativa a busca por voz: dá feedback auditivo e inicia o reconhecimento.
   * Compatível com SpeechRecognition e webkitSpeechRecognition.
   * Ao concluir, insere o texto no campo de busca e submete o formulário.
   */
  function ativarBuscaPorVoz() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speak('Reconhecimento de voz não disponível neste navegador.');
      return;
    }

    // Se já está a ouvir, cancela
    if (isListening) {
      if (voiceRecognition) voiceRecognition.abort();
      return;
    }

    // Feedback auditivo antes de iniciar o microfone
    window.speechSynthesis.cancel();
    var utterance   = new SpeechSynthesisUtterance('Pode falar o que deseja procurar');
    utterance.lang  = config.lang;
    utterance.rate  = config.rate;
    utterance.pitch = config.pitch;
    utterance.onend = _startRecognition;
    window.speechSynthesis.speak(utterance);
  }

  function _startRecognition() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceRecognition                 = new SpeechRecognition();
    voiceRecognition.lang            = config.lang || 'pt-BR';
    voiceRecognition.continuous      = false;
    voiceRecognition.interimResults  = false;
    voiceRecognition.maxAlternatives = 1;

    isListening = true;
    _updateVoiceIndicator(true);

    voiceRecognition.onresult = function (event) {
      isListening = false;
      _updateVoiceIndicator(false);
      var transcript = event.results[0][0].transcript.trim();

      // Procura o campo de busca pelos seletores mais comuns
      var searchInput =
        document.getElementById('search-input') ||
        document.querySelector('input[type="search"]') ||
        document.querySelector('input[name="search"]') ||
        document.querySelector('input[name="q"]') ||
        document.querySelector('input[placeholder*="busca" i]') ||
        document.querySelector('input[placeholder*="pesquisa" i]') ||
        document.querySelector('input[placeholder*="search" i]');

      if (searchInput) {
        searchInput.value = transcript;
        searchInput.dispatchEvent(new Event('input',  { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));

        var form = searchInput.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }

      speak('Procurando por: ' + transcript);
    };

    voiceRecognition.onerror = function (event) {
      isListening = false;
      _updateVoiceIndicator(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        speak('Microfone não autorizado. Por favor, permita o acesso ao microfone.');
      } else {
        speak('Não consegui ouvir, tente novamente.');
      }
    };

    voiceRecognition.onend = function () {
      isListening = false;
      _updateVoiceIndicator(false);
    };

    try {
      voiceRecognition.start();
    } catch (e) {
      isListening = false;
      _updateVoiceIndicator(false);
      speak('Não consegui ouvir, tente novamente.');
    }
  }

  /** Atualiza o indicador visual do botão de microfone, se injectado */
  function _updateVoiceIndicator(listening) {
    var btn = document.getElementById('sistemaOuvir-mic-btn');
    if (!btn) return;
    if (listening) {
      btn.textContent      = '🔴 A ouvir…';
      btn.style.background = 'linear-gradient(135deg,#d32f2f,#FF6600)';
      btn.style.animation  = 'sistemaOuvir-pulse 1.2s ease-in-out infinite';
    } else {
      btn.textContent      = '🎤 Busca por Voz';
      btn.style.background = 'linear-gradient(135deg,#1a73e8,#FF6600)';
      btn.style.animation  = 'none';
    }
  }

  // ─── Lógica principal ─────────────────────────────────────────────────────

  /**
   * Obtém o elemento "mais relevante" sob o ponto (x, y).
   * Sobe pelo DOM (até 8 níveis) procurando o primeiro ancestral com texto legível.
   */
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

  // ─── Suporte a teclado ────────────────────────────────────────────────────

  /**
   * Ao navegar por teclado (Tab / Shift+Tab / setas), anuncia o elemento focado.
   */
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

  // ─── Eventos ──────────────────────────────────────────────────────────────

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

  // Navegação por teclado
  document.addEventListener('focusin', handleFocusIn);

  // Confirmação de campo ao sair
  document.addEventListener('blur', handleInputBlur, true);

  // Confirmação de seleção em <select>
  document.addEventListener('change', handleSelectChange, true);

  // ─── API pública ──────────────────────────────────────────────────────────

  window.SistemaOuvir = {
    enable: function () {
      config.enabled = true;
      console.info('[SistemaOuvir] Ativado.');
    },
    disable: function () {
      config.enabled = false;
      window.speechSynthesis && window.speechSynthesis.cancel();
      removeOutline();
      console.info('[SistemaOuvir] Desativado.');
    },
    toggle: function () {
      config.enabled ? this.disable() : this.enable();
    },
    isEnabled: function () { return config.enabled; },
    /**
     * Ativa a busca por voz: anuncia "Pode falar o que deseja procurar",
     * ouve o utilizador e insere o texto no campo de pesquisa da página.
     */
    ativarBuscaPorVoz: function () {
      ativarBuscaPorVoz();
    },
    /**
     * Ajusta configurações em tempo de execução.
     * @param {Object} opts - { rate, pitch, lang, debounce, outlineDuration }
     */
    config: function (opts) {
      if (!opts) return;
      if (typeof opts.rate             === 'number') config.rate             = opts.rate;
      if (typeof opts.pitch            === 'number') config.pitch            = opts.pitch;
      if (typeof opts.lang             === 'string') config.lang             = opts.lang;
      if (typeof opts.debounce         === 'number') config.debounceDelay    = opts.debounce;
      if (typeof opts.outlineDuration  === 'number') config.outlineDuration  = opts.outlineDuration;
    }
  };

  console.info('[SistemaOuvir] Interface auditiva por toque ativada. Use window.SistemaOuvir.toggle() para alternar.');
})();
