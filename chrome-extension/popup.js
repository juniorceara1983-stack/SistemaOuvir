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
  const voiceSearchBtn = document.getElementById('voiceSearchBtn');

  // Agendamento
  const alarmToggle    = document.getElementById('alarmToggle');
  const alarmTime      = document.getElementById('alarmTime');
  const alarmTimeGroup = document.getElementById('alarmTimeGroup');
  const schedulerHint  = document.getElementById('schedulerHint');

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

  const MS_PER_MINUTE = 60000;

  /** Formata o horário local de disparo para exibição amigável */
  function formatNextAlarmHint(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const now    = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const diffMs  = target - now;
    const diffMin = Math.round(diffMs / MS_PER_MINUTE);
    const diffH   = Math.floor(diffMin / 60);
    const restMin = diffMin % 60;

    if (diffH > 0) return `Próximo disparo em ${diffH}h ${restMin}min`;
    return `Próximo disparo em ${diffMin} min`;
  }

  function updateAlarmUI(enabled, timeStr) {
    alarmToggle.checked = enabled;
    alarmTimeGroup.classList.toggle('disabled', !enabled);
    if (enabled && timeStr) {
      alarmTime.value    = timeStr;
      schedulerHint.textContent = formatNextAlarmHint(timeStr);
    } else {
      schedulerHint.textContent = '';
    }
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

    // Carrega o estado do agendamento
    try {
      const alarmResp = await sendToBackground({ type: 'getAlarmState' });
      updateAlarmUI(alarmResp.alarmEnabled, alarmResp.alarmTime);
    } catch {
      updateAlarmUI(false, '08:00');
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

  // ─── Busca por Voz ────────────────────────────────────────────────────────

  voiceSearchBtn.addEventListener('click', async () => {
    try {
      await sendToBackground({ type: 'activateVoiceSearch', tabId: currentTabId });
      // Fecha o popup para que o utilizador possa falar sem sobreposição
      window.close();
    } catch (err) {
      console.warn('[SistemaOuvir] Erro ao ativar busca por voz:', err);
    }
  });

  // ─── Controles de agendamento ─────────────────────────────────────────────

  alarmToggle.addEventListener('change', async () => {
    const enabled = alarmToggle.checked;
    const time    = alarmTime.value || '08:00';
    updateAlarmUI(enabled, time);
    try {
      await sendToBackground({ type: 'setAlarm', enabled, time });
    } catch (err) {
      console.warn('[SistemaOuvir] Erro ao configurar alarme:', err);
    }
  });

  alarmTime.addEventListener('change', async () => {
    if (!alarmToggle.checked) return;
    const time = alarmTime.value || '08:00';
    schedulerHint.textContent = formatNextAlarmHint(time);
    try {
      await sendToBackground({ type: 'setAlarm', enabled: true, time });
    } catch (err) {
      console.warn('[SistemaOuvir] Erro ao atualizar horário do alarme:', err);
    }
  });

  // ─── Kick-off ─────────────────────────────────────────────────────────────
  init().catch(console.error);

})();
