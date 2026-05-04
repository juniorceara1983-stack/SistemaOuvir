/**
 * +Voz – Widget Flutuante
 *
 * Injete este script em qualquer site para exibir um botão flutuante
 * que ativa/desativa o SistemaOuvir com um único clique.
 *
 * Dependência: sistemaOuvir.js deve ser carregado antes deste arquivo
 * (ou incluído no mesmo bundle).
 *
 * Uso:
 *   <script src="sistemaOuvir.js"></script>
 *   <script src="widget.js"></script>
 */

(function () {
  'use strict';

  // Evita duplicação se o script for carregado mais de uma vez
  if (document.getElementById('voz-widget')) return;

  /* ── Estilos inline ──────────────────────────────────────────────────── */
  var css = [
    '#voz-widget {',
    '  position: fixed;',
    '  bottom: 24px;',
    '  right: 24px;',
    '  z-index: 2147483647;',   /* max safe value – must float above any site overlay */
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: flex-end;',
    '  gap: 8px;',
    '}',

    '#voz-btn {',
    '  width: 56px;',
    '  height: 56px;',
    '  border-radius: 50%;',
    '  background: #FF6600;',
    '  border: none;',
    '  cursor: pointer;',
    '  box-shadow: 0 4px 14px rgba(255,102,0,0.45);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  transition: transform 0.2s, box-shadow 0.2s, width 0.25s, border-radius 0.25s;',
    '  overflow: hidden;',
    '  white-space: nowrap;',
    '  outline: none;',
    '}',

    '#voz-btn:focus-visible {',
    '  outline: 3px solid #1a73e8;',
    '  outline-offset: 3px;',
    '}',

    '#voz-btn svg { flex-shrink: 0; }',

    '#voz-btn-label {',
    '  font-family: Arial, sans-serif;',
    '  font-size: 13px;',
    '  font-weight: 700;',
    '  color: #fff;',
    '  max-width: 0;',
    '  overflow: hidden;',
    '  transition: max-width 0.25s, margin-left 0.25s;',
    '  margin-left: 0;',
    '}',

    '#voz-widget:hover #voz-btn,',
    '#voz-widget:focus-within #voz-btn {',
    '  width: auto;',
    '  border-radius: 28px;',
    '  padding: 0 18px 0 14px;',
    '  box-shadow: 0 6px 20px rgba(255,102,0,0.5);',
    '  transform: translateY(-2px);',
    '}',

    '#voz-widget:hover #voz-btn-label,',
    '#voz-widget:focus-within #voz-btn-label {',
    '  max-width: 160px;',
    '  margin-left: 8px;',
    '}',

    /* Active (enabled) state */
    '#voz-btn.voz-active {',
    '  background: #1a73e8;',
    '  box-shadow: 0 4px 14px rgba(26,115,232,0.45);',
    '}',

    /* Tooltip */
    '#voz-tooltip {',
    '  background: rgba(0,0,0,0.72);',
    '  color: #fff;',
    '  font-family: Arial, sans-serif;',
    '  font-size: 12px;',
    '  padding: 5px 10px;',
    '  border-radius: 6px;',
    '  pointer-events: none;',
    '  opacity: 0;',
    '  transition: opacity 0.2s;',
    '}',

    '#voz-widget:hover #voz-tooltip {',
    '  opacity: 1;',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.id  = 'voz-widget-style';
  style.textContent = css;
  document.head.appendChild(style);

  /* ── Markup ──────────────────────────────────────────────────────────── */
  var wrapper = document.createElement('div');
  wrapper.id = 'voz-widget';

  wrapper.innerHTML = [
    '<div id="voz-tooltip">+Voz: Acessibilidade Ativa</div>',
    '<button id="voz-btn" aria-label="Ativar ou desativar +Voz" aria-pressed="false">',
    '  <!-- +Voz icon: plus + sound waves -->',
    '  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">',
    '    <!-- Plus sign -->',
    '    <rect x="6"  y="28" width="18" height="8" rx="2" fill="#fff"/>',
    '    <rect x="24" y="28" width="8"  height="8" rx="2" fill="#fff"/>',
    '    <rect x="24" y="12" width="8"  height="24" rx="2" fill="#fff"/>',
    '    <!-- Sound waves -->',
    '    <path d="M34 38 A10 10 0 0 0 34 26" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
    '    <path d="M39 43 A18 18 0 0 0 39 21" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    '    <path d="M44 47 A25 25 0 0 0 44 17" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.75"/>',
    '  </svg>',
    '  <span id="voz-btn-label">Acessibilidade Ativa</span>',
    '</button>'
  ].join('');

  document.body.appendChild(wrapper);

  /* ── Lógica de toggle ────────────────────────────────────────────────── */
  var btn     = document.getElementById('voz-btn');
  var tooltip = document.getElementById('voz-tooltip');

  function updateState(enabled) {
    btn.classList.toggle('voz-active', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
    tooltip.textContent = enabled
      ? '+Voz: Acessibilidade Ativa'
      : '+Voz: Clique para ativar';
  }

  btn.addEventListener('click', function () {
    if (window.SistemaOuvir && typeof window.SistemaOuvir.toggle === 'function') {
      window.SistemaOuvir.toggle();
      updateState(window.SistemaOuvir.isEnabled());
    } else {
      console.warn('[+Voz Widget] window.SistemaOuvir não encontrado. Certifique-se de carregar sistemaOuvir.js (o núcleo do +Voz) antes de widget.js.');
    }
  });

  // Reflete o estado inicial (caso o SistemaOuvir já esteja ativo)
  if (window.SistemaOuvir && typeof window.SistemaOuvir.isEnabled === 'function') {
    updateState(window.SistemaOuvir.isEnabled());
  }

})();
