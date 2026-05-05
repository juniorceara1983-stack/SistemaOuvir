/**
 * SistemaOuvir – Service Worker (background.js)
 *
 * Responsabilidades:
 *  - Sincronizar o estado ativo/inativo da extensão por aba
 *  - Atualizar o ícone da barra de ferramentas para refletir o estado
 *  - Repassar mensagens do popup para o content script
 *  - Agendamento automático diário via chrome.alarms para abrir a
 *    liturgia da Canção Nova e iniciar a leitura automaticamente
 */

'use strict';

// Mapa tabId → { enabled: bool }
const tabState = new Map();

const ALARM_NAME   = 'sistemaOuvir_liturgia_diaria';
const LITURGIA_URL = 'https://liturgia.cancaonova.com/';
/** Delay (ms) after page load before sending the readFullLiturgy message,
 *  to ensure the content script has fully initialised. */
const CONTENT_SCRIPT_READY_DELAY_MS = 2500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setIcon(tabId, enabled) {
  const suffix = enabled ? 'on' : 'off';
  chrome.action.setIcon({
    tabId,
    path: {
      16:  `icons/icon16_${suffix}.png`,
      48:  `icons/icon48_${suffix}.png`,
      128: `icons/icon128_${suffix}.png`
    }
  }).catch((err) => {
    // Tabs that are closed or restricted (e.g. chrome://) will throw; ignore those.
    if (err && err.message && !err.message.includes('No tab with id')) {
      console.warn('[SistemaOuvir] setIcon failed:', err);
    }
  });
}

function getTabEnabled(tabId) {
  const state = tabState.get(tabId);
  return state ? state.enabled : false;
}

// ─── Agendamento automático ───────────────────────────────────────────────────

/**
 * Agenda (ou reagenda) o alarme diário para o horário especificado.
 * @param {string} timeStr – Horário no formato "HH:MM" (ex: "08:00")
 */
function scheduleAlarm(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);

  const now    = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // Se o horário de hoje já passou, agenda para amanhã
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delayInMinutes = (target.getTime() - now.getTime()) / 60000;

  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes,
      periodInMinutes: 24 * 60  // repete diariamente
    });
    console.info(`[SistemaOuvir] Alarme agendado para ${timeStr} (em ${Math.round(delayInMinutes)} min).`);
  });
}

/** Abre a página da liturgia e dispara a leitura automática quando carregar */
function openAndReadLiturgy() {
  chrome.tabs.create({ url: LITURGIA_URL, active: true }, (tab) => {
    function onUpdated(tabId, changeInfo) {
      if (tabId !== tab.id || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      // Aguarda o content script estar pronto antes de enviar a mensagem
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'readFullLiturgy' }).catch((err) => {
          console.warn('[SistemaOuvir] Não foi possível iniciar a leitura automática:', err);
        });
      }, CONTENT_SCRIPT_READY_DELAY_MS);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// Escuta o disparo do alarme
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    openAndReadLiturgy();
  }
});

// ─── Eventos de ciclo de vida ─────────────────────────────────────────────────

/** Lê o storage e (re)agenda o alarme se estiver habilitado */
function restoreAlarmIfEnabled() {
  chrome.storage.sync.get(['alarmEnabled', 'alarmTime'], (stored) => {
    if (stored.alarmEnabled) {
      scheduleAlarm(stored.alarmTime || '08:00');
    }
  });
}

// Quando a extensão é instalada pela primeira vez, abre a página de boas-vindas
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
  // Restaura o alarme caso esteja habilitado após atualização
  restoreAlarmIfEnabled();
  console.info('[+Voz] Extensão instalada/atualizada. Motivo:', details.reason);
});

// Restaura o alarme quando o service worker é reiniciado pelo navegador
restoreAlarmIfEnabled();

// Limpa estado quando a aba é fechada
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

// ─── Mensagens recebidas do popup ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || (sender.tab && sender.tab.id);

  switch (message.type) {

    // Popup consulta ou altera o agendamento
    case 'setAlarm': {
      const { enabled, time } = message;
      chrome.storage.sync.set({ alarmEnabled: enabled, alarmTime: time || '08:00' });
      if (enabled) {
        scheduleAlarm(time || '08:00');
      } else {
        chrome.alarms.clear(ALARM_NAME);
        console.info('[SistemaOuvir] Alarme desativado.');
      }
      sendResponse({ ok: true });
      break;
    }

    case 'getAlarmState': {
      chrome.storage.sync.get(['alarmEnabled', 'alarmTime'], (stored) => {
        sendResponse({
          alarmEnabled: stored.alarmEnabled || false,
          alarmTime:    stored.alarmTime    || '08:00'
        });
      });
      return true; // async response
    }

    // Popup pede o estado atual da aba
    case 'getState': {
      if (!tabId) { sendResponse({ error: 'tabId ausente' }); break; }
      const enabled = getTabEnabled(tabId);
      sendResponse({ enabled });
      break;
    }

    // Popup quer alternar o estado
    case 'toggle': {
      if (!tabId) { sendResponse({ error: 'tabId ausente' }); break; }
      const current = getTabEnabled(tabId);
      const next    = !current;
      tabState.set(tabId, { enabled: next });
      setIcon(tabId, next);

      // Repassa para o content script da aba
      chrome.tabs.sendMessage(tabId, { type: next ? 'enable' : 'disable' }, (resp) => {
        if (chrome.runtime.lastError) {
          // Content script ainda não carregou; tenta injetar dinamicamente
          chrome.scripting.executeScript({
            target: { tabId },
            files:  ['content.js']
          }).then(() => {
            chrome.tabs.sendMessage(tabId, { type: next ? 'enable' : 'disable' });
          }).catch(console.warn);
        }
      });

      sendResponse({ enabled: next });
      break;
    }

    // Popup quer activar a busca por voz na aba activa
    case 'activateVoiceSearch': {
      if (!tabId) { sendResponse({ error: 'tabId ausente' }); break; }
      chrome.tabs.sendMessage(tabId, { type: 'activateVoiceSearch' }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[SistemaOuvir] Não foi possível ativar busca por voz:', chrome.runtime.lastError.message);
        }
      });
      sendResponse({ ok: true });
      break;
    }

    // Popup quer atualizar configurações (rate, pitch, lang, debounce)
    case 'updateConfig': {
      if (!tabId) { sendResponse({ error: 'tabId ausente' }); break; }
      const cfg = message.config || {};

      // Persiste no storage
      chrome.storage.sync.set(cfg);

      // Repassa para o content script da aba ativa
      chrome.tabs.sendMessage(tabId, { type: 'updateConfig', config: cfg });
      sendResponse({ ok: true });
      break;
    }
  }

  return true; // mantém o canal aberto para respostas assíncronas
});
