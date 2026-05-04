/**
 * SistemaOuvir - Interface Auditiva por Toque
 * Vanilla JS | Web Speech API | Sem dependências externas
 *
 * Como usar:
 *   <script src="sistemaOuvir.js"></script>
 *   ou cole diretamente no console do navegador para testar.
 */

(function () {
  'use strict';

  // ─── Configurações ────────────────────────────────────────────────────────
  var DEBOUNCE_DELAY = 100;   // ms que o dedo precisa ficar parado antes de ler
  var OUTLINE_DURATION = 1500; // ms que o destaque visual fica visível
  var OUTLINE_STYLE = '3px solid #FF6600';
  var LANG = navigator.language || 'pt-BR'; // idioma da voz

  // ─── Estado interno ────────────────────────────────────────────────────────
  var lastSpokenElement = null;
  var debounceTimer = null;
  var outlineTimer = null;
  var previousOutlineElement = null;
  var previousOutlineStyle = '';

  // ─── Utilitários ──────────────────────────────────────────────────────────

  /**
   * Extrai o texto a ser lido de um elemento.
   * Prioridade: aria-label > aria-labelledby > alt (img) > title > texto interno
   */
  function getReadableText(element) {
    if (!element) return null;

    // 1. aria-label tem a maior prioridade
    var ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    // 2. aria-labelledby referencia outro elemento
    var labelledById = element.getAttribute('aria-labelledby');
    if (labelledById) {
      var labelEl = document.getElementById(labelledById);
      if (labelEl && labelEl.textContent.trim()) {
        return labelEl.textContent.trim();
      }
    }

    var tag = element.tagName.toLowerCase();

    // 3. Imagens: atributo alt
    if (tag === 'img') {
      var alt = element.getAttribute('alt');
      if (alt && alt.trim()) return alt.trim();
      return 'imagem sem descrição';
    }

    // 4. Inputs: value, placeholder ou type
    if (tag === 'input') {
      var inputType = (element.getAttribute('type') || 'text').toLowerCase();
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
        return element.value || inputType;
      }
      var placeholder = element.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) {
        return 'campo: ' + placeholder.trim();
      }
      var inputLabel = getAssociatedLabelText(element);
      if (inputLabel) return 'campo: ' + inputLabel;
      return 'campo de entrada';
    }

    // 5. Select
    if (tag === 'select') {
      var selectLabel = getAssociatedLabelText(element);
      return selectLabel ? 'lista: ' + selectLabel : 'lista de opções';
    }

    // 6. title como fallback
    var title = element.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // 7. Texto interno para botões, links e elementos interativos
    var interactiveTags = ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                           'p', 'label', 'span', 'li', 'td', 'th', 'caption',
                           'summary', 'figcaption'];
    if (interactiveTags.indexOf(tag) !== -1) {
      var text = getVisibleText(element);
      if (text) return text;
    }

    // 8. Elementos com role interativo
    var role = element.getAttribute('role');
    if (role) {
      var roleText = getVisibleText(element);
      if (roleText) return roleText;
    }

    return null;
  }

  /**
   * Busca o texto do <label> associado a um input pelo atributo for/id.
   */
  function getAssociatedLabelText(input) {
    var id = input.id;
    if (id) {
      var label = document.querySelector('label[for="' + id + '"]');
      if (label) return label.textContent.trim();
    }
    // Label pai
    var parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    return null;
  }

  /**
   * Retorna o texto visível de um elemento (trim, colapsa espaços).
   */
  function getVisibleText(element) {
    var text = element.innerText || element.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  // ─── Feedback visual ──────────────────────────────────────────────────────

  function applyOutline(element) {
    // Remove destaque do elemento anterior
    removeOutline();

    previousOutlineElement = element;
    previousOutlineStyle = element.style.outline;

    element.style.outline = OUTLINE_STYLE;
    element.style.outlineOffset = '2px';

    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(removeOutline, OUTLINE_DURATION);
  }

  function removeOutline() {
    if (previousOutlineElement) {
      previousOutlineElement.style.outline = previousOutlineStyle;
      previousOutlineElement.style.outlineOffset = '';
      previousOutlineElement = null;
      previousOutlineStyle = '';
    }
  }

  // ─── Confirmação de campos de formulário ──────────────────────────────────

  /**
   * Detecta o tipo semântico do campo com base em id, name, placeholder e label.
   * Retorna: 'cpf' | 'cnpj' | 'telefone' | 'cep' | 'text'
   */
  function detectFieldType(input) {
    var attrs = [
      input.id || '',
      input.name || '',
      (input.getAttribute('placeholder') || ''),
      (input.getAttribute('aria-label') || ''),
      (getAssociatedLabelText(input) || '')
    ].join(' ').toLowerCase();

    if (/\bcpf\b/.test(attrs)) return 'cpf';
    if (/\bcnpj\b/.test(attrs)) return 'cnpj';
    if (/telefone|celular|whatsapp|\bfone\b|\btel\b|\bphone\b/.test(attrs)) return 'telefone';
    if (/\bcep\b/.test(attrs)) return 'cep';
    return 'text';
  }

  /**
   * Converte o valor digitado em texto otimizado para fala.
   * Campos de código numérico têm seus dígitos separados por espaço
   * para que a síntese leia cada algarismo individualmente.
   */
  function formatValueForSpeech(value, fieldType) {
    if (!value || !value.trim()) return null;

    if (fieldType === 'text') return value.trim();

    // Para CPF, CNPJ, telefone e CEP: lê apenas os dígitos um a um
    var digits = value.replace(/\D/g, '');
    if (!digits) return value.trim();
    return digits.split('').join(' ');
  }

  /**
   * Retorna o rótulo humano de um input (label > aria-label > placeholder > 'campo').
   */
  function getFieldLabel(input) {
    return getAssociatedLabelText(input) ||
           input.getAttribute('aria-label') ||
           input.getAttribute('placeholder') ||
           'campo';
  }

  /**
   * Chamado quando o usuário sai de um campo de texto preenchido.
   * Lê em voz alta: "<rótulo>: <valor>. Está correto?"
   */
  function handleInputBlur(event) {
    var input = event.target;
    if (!input || (input.tagName.toLowerCase() !== 'input' && input.tagName.toLowerCase() !== 'textarea')) return;

    var inputType = (input.getAttribute('type') || 'text').toLowerCase();
    // Não lê botões nem campos de senha
    if (inputType === 'submit' || inputType === 'button' || inputType === 'reset' || inputType === 'password') return;

    var value = input.value;
    if (!value || !value.trim()) return;

    var fieldType = detectFieldType(input);
    var label = getFieldLabel(input);
    var formatted = formatValueForSpeech(value, fieldType);
    if (!formatted) return;

    speak(label + ': ' + formatted + '. Está correto?');
  }

  /**
   * Chamado quando o usuário altera a opção de um <select>.
   * Lê em voz alta: "<rótulo>: <opção selecionada>"
   */
  function handleSelectChange(event) {
    var select = event.target;
    if (!select || select.tagName.toLowerCase() !== 'select') return;

    var selectedOption = select.options[select.selectedIndex];
    var selectedText = selectedOption ? selectedOption.text : '';
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
    // Cancela qualquer fala em andamento para não acumular fila
    window.speechSynthesis.cancel();

    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG;
    utterance.rate = 1.1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  // ─── Lógica principal ─────────────────────────────────────────────────────

  /**
   * Obtém o elemento "mais relevante" sob o ponto (x, y).
   * Sobe pelo DOM buscando o primeiro ancestral com texto legível,
   * para evitar capturar elementos genéricos como <body> ou <div> vazios.
   */
  function getRelevantElement(x, y) {
    var element = document.elementFromPoint(x, y);
    if (!element) return null;

    // Sobe até 5 níveis procurando texto legível
    var candidate = element;
    for (var i = 0; i < 5; i++) {
      if (getReadableText(candidate)) return candidate;
      var parent = candidate.parentElement;
      if (!parent || candidate === document.body || candidate === document.documentElement) break;
      candidate = parent;
    }

    // Retorna o elemento original mesmo sem texto (para evitar null)
    return element;
  }

  function handlePointerMove(x, y) {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(function () {
      var element = getRelevantElement(x, y);
      if (!element) return;

      // Só fala se o elemento mudou
      if (element === lastSpokenElement) return;
      lastSpokenElement = element;

      var text = getReadableText(element);
      if (!text) return;

      applyOutline(element);
      speak(text);
    }, DEBOUNCE_DELAY);
  }

  // ─── Eventos ──────────────────────────────────────────────────────────────

  // Touch (mobile)
  document.addEventListener('touchmove', function (event) {
    var touch = event.touches[0];
    if (touch) {
      handlePointerMove(touch.clientX, touch.clientY);
    }
  }, { passive: true });

  // Mouse (desktop / testes)
  document.addEventListener('mousemove', function (event) {
    handlePointerMove(event.clientX, event.clientY);
  });

  // Reseta o último elemento ao levantar o dedo / soltar o mouse,
  // para que o próximo toque no mesmo elemento seja relido.
  document.addEventListener('touchend', function () {
    lastSpokenElement = null;
    clearTimeout(debounceTimer);
    removeOutline();
  });

  document.addEventListener('mouseup', function () {
    lastSpokenElement = null;
  });

  // Confirmação de campo ao sair (focus-out usa captura para pegar todos os inputs)
  document.addEventListener('blur', handleInputBlur, true);

  // Confirmação de seleção em <select>
  document.addEventListener('change', handleSelectChange, true);

  console.info('[SistemaOuvir] Interface auditiva por toque ativada.');
})();
