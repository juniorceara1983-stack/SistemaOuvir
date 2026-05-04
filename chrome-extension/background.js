/**
 * SistemaOuvir – Service Worker (background.js)
 *
 * Responsabilidades:
 *  - Sincronizar o estado ativo/inativo da extensão por aba
 *  - Atualizar o ícone da barra de ferramentas para refletir o estado
 *  - Repassar mensagens do popup para o content script
 */

'use strict';

// Mapa tabId → { enabled: bool }
const tabState = new Map();

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
  }).catch(() => {
    // Ignora erros quando a aba não existe mais
  });
}

function getTabEnabled(tabId) {
  const state = tabState.get(tabId);
  return state ? state.enabled : false;
}

// ─── Eventos de ciclo de vida ─────────────────────────────────────────────────

// Quando a extensão é instalada ou atualizada, lê as configurações salvas
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['enabled'], (stored) => {
    // O padrão global é "desativado"; cada aba começa desligada
    console.info('[SistemaOuvir background] Extensão instalada/atualizada.');
  });
});

// Limpa estado quando a aba é fechada
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

// ─── Mensagens recebidas do popup ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || (sender.tab && sender.tab.id);

  if (!tabId) {
    sendResponse({ error: 'tabId ausente' });
    return;
  }

  switch (message.type) {

    // Popup pede o estado atual da aba
    case 'getState': {
      const enabled = getTabEnabled(tabId);
      sendResponse({ enabled });
      break;
    }

    // Popup quer alternar o estado
    case 'toggle': {
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

    // Popup quer atualizar configurações (rate, pitch, lang, debounce)
    case 'updateConfig': {
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
