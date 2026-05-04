'use strict';

/**
 * SistemaOuvir – Popup Script
 *
 * Carrega o estado da aba ativa, sincroniza os controles e
 * envia mensagens para o background service worker.
 */

(function () {

  const toggleSwitch  = document.getElementById('toggleSwitch');
  const statusLabel   = document.getElementById('statusLabel');
  const langSelect    = document.getElementById('langSelect');
  const rateRange     = document.getElementById('rateRange');
  const rateValue     = document.getElementById('rateValue');
  const pitchRange    = document.getElementById('pitchRange');
  const pitchValue    = document.getElementById('pitchValue');
  const debounceRange = document.getElementById('debounceRange');
  const debounceValue = document.getElementById('debounceValue');

  // ─── Estado local do popup ────────────────────────────────────────────────

  let currentTabId = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function updateStatusUI(enabled) {
    toggleSwitch.checked = enabled;
    statusLabel.textContent = enabled ? 'Ativado' : 'Desativado';
    statusLabel.classList.toggle('active', enabled);
  }

  function sendToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ─── Inicialização ────────────────────────────────────────────────────────

  async function init() {
    // Obtém a aba ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    currentTabId = tab.id;

    // Carrega configurações salvas
    const stored = await chrome.storage.sync.get(['enabled', 'lang', 'rate', 'pitch', 'debounce']);
    if (stored.lang     !== undefined) langSelect.value    = stored.lang;
    if (stored.rate     !== undefined) {
      rateRange.value   = stored.rate;
      rateValue.textContent = Number(stored.rate).toFixed(1);
    }
    if (stored.pitch    !== undefined) {
      pitchRange.value  = stored.pitch;
      pitchValue.textContent = Number(stored.pitch).toFixed(1);
    }
    if (stored.debounce !== undefined) {
      debounceRange.value   = stored.debounce;
      debounceValue.textContent = stored.debounce;
    }

    // Consulta o estado atual da aba no background
    try {
      const resp = await sendToBackground({ type: 'getState', tabId: currentTabId });
      updateStatusUI(resp.enabled);
    } catch {
      updateStatusUI(stored.enabled || false);
    }
  }

  // ─── Eventos ──────────────────────────────────────────────────────────────

  toggleSwitch.addEventListener('change', async () => {
    try {
      const resp = await sendToBackground({ type: 'toggle', tabId: currentTabId });
      updateStatusUI(resp.enabled);
      chrome.storage.sync.set({ enabled: resp.enabled });
    } catch (err) {
      console.error('[SistemaOuvir popup] Erro ao alternar:', err);
    }
  });

  langSelect.addEventListener('change', () => {
    const lang = langSelect.value;
    chrome.storage.sync.set({ lang });
    sendToBackground({ type: 'updateConfig', tabId: currentTabId, config: { lang } }).catch((err) => console.warn('[SistemaOuvir] Config update failed:', err));
  });

  rateRange.addEventListener('input', () => {
    const rate = parseFloat(rateRange.value);
    rateValue.textContent = rate.toFixed(1);
    chrome.storage.sync.set({ rate });
    sendToBackground({ type: 'updateConfig', tabId: currentTabId, config: { rate } }).catch((err) => console.warn('[SistemaOuvir] Config update failed:', err));
  });

  pitchRange.addEventListener('input', () => {
    const pitch = parseFloat(pitchRange.value);
    pitchValue.textContent = pitch.toFixed(1);
    chrome.storage.sync.set({ pitch });
    sendToBackground({ type: 'updateConfig', tabId: currentTabId, config: { pitch } }).catch((err) => console.warn('[SistemaOuvir] Config update failed:', err));
  });

  debounceRange.addEventListener('input', () => {
    const debounce = parseInt(debounceRange.value, 10);
    debounceValue.textContent = debounce;
    chrome.storage.sync.set({ debounce });
    sendToBackground({ type: 'updateConfig', tabId: currentTabId, config: { debounce } }).catch((err) => console.warn('[SistemaOuvir] Config update failed:', err));
  });

  // ─── Kick-off ─────────────────────────────────────────────────────────────
  init().catch(console.error);

})();
