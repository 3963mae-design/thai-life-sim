/**
 * js/ui/router.js
 * ตัวคุมการเปลี่ยนหน้าจอ (Lobby / Reborn / Gameplay 5 Tabs / Ending) และสลับเพลง BGM ตามฉาก
 */

import { getState, setState } from '../core/state.js';
import { initAudioSystem, setBgmTrack } from './audio.js';
import { renderBottomDockHtml, renderTopHeaderHtml, bindHeaderFooterEvents } from './header_footer_ui.js';
import {
  openAnnualSlipModal,
  openEmergencyDebtModal,
  renderEndingScreen
} from './modals_ending_ui.js';
import { renderLobbyScreen, renderRebornScreen } from './screen_lobby_reborn.js';
import { renderTab1LifeFeed } from './tab1_life_feed.js';
import { renderTab2WorkStudy } from './tab2_work_study.js';
import { renderTab3Relationships } from './tab3_relationships.js';
import { renderTab4AssetsDebt } from './tab4_assets_debt.js';
import { renderTab5LifestyleShop } from './tab5_lifestyle_shop.js';

let currentScreen = 'lobby';
let activeTab = 'tab1';
let lastAutoModalToken = null;

function getAppRoot() {
  return document.getElementById('app');
}

export function renderCurrentScreen() {
  const root = getAppRoot();
  if (!root) return;

  const state = getState();

  if (currentScreen === 'gameplay' && state && (!state.profile?.isAlive || state.turn?.phase === 'ENDED')) {
    currentScreen = 'ending';
  }

  // สลับเพลงตามหน้าจอปัจจุบัน
  if (currentScreen === 'lobby' || currentScreen === 'reborn') {
    setBgmTrack('chill');
  } else {
    setBgmTrack('main');
  }

  if (currentScreen === 'lobby') {
    lastAutoModalToken = null;
    const view = renderLobbyScreen({
      onGoReborn: () => {
        currentScreen = 'reborn';
        renderCurrentScreen();
      },
      onContinueGame: (savedState) => {
        setState(savedState);
        activeTab = 'tab1';
        currentScreen = !savedState.profile?.isAlive || savedState.turn?.phase === 'ENDED' ? 'ending' : 'gameplay';
        renderCurrentScreen();
      },
      onRefreshLobby: () => renderCurrentScreen()
    });
    root.innerHTML = view.html;
    view.bind(root);
    return;
  }

  if (currentScreen === 'reborn') {
    const view = renderRebornScreen({
      onBackToLobby: () => {
        currentScreen = 'lobby';
        renderCurrentScreen();
      },
      onStartLife: (freshState) => {
        setState(freshState);
        activeTab = 'tab1';
        currentScreen = 'gameplay';
        lastAutoModalToken = null;
        renderCurrentScreen();
      }
    });
    view.mount(root);
    return;
  }

  if (currentScreen === 'ending' && state) {
    lastAutoModalToken = null;
    const view = renderEndingScreen(state, {
      onContinueAsChild: (newState) => {
        setState(newState);
        activeTab = 'tab1';
        currentScreen = 'gameplay';
        renderCurrentScreen();
      },
      onReturnToLobby: () => {
        setState(null);
        currentScreen = 'lobby';
        renderCurrentScreen();
      }
    });
    root.innerHTML = view.html;
    view.bind(root);
    return;
  }

  if (!state) {
    currentScreen = 'lobby';
    renderCurrentScreen();
    return;
  }

  if (state.turn?.areTabsLocked) {
    activeTab = 'tab1';
  }

  const refreshCallback = () => renderCurrentScreen();
  let tabView;

  switch (activeTab) {
    case 'tab1':
      tabView = renderTab1LifeFeed(state, { onRefresh: refreshCallback });
      break;
    case 'tab2':
      tabView = renderTab2WorkStudy(state, { onRefresh: refreshCallback });
      break;
    case 'tab3':
      tabView = renderTab3Relationships(state, { onRefresh: refreshCallback });
      break;
    case 'tab4':
      tabView = renderTab4AssetsDebt(state, { onRefresh: refreshCallback });
      break;
    case 'tab5':
      tabView = renderTab5LifestyleShop(state, { onRefresh: refreshCallback });
      break;
    default:
      tabView = renderTab1LifeFeed(state, { onRefresh: refreshCallback });
  }

  root.innerHTML = `
    <div class="gameplay-shell">
      ${renderTopHeaderHtml(state)}
      <main id="tab-main-container" class="tab-content-area">
        ${tabView.html}
      </main>
      ${renderBottomDockHtml(state, activeTab)}
    </div>
  `;

  const mainContainer = root.querySelector('#tab-main-container');
  if (mainContainer && typeof tabView.bind === 'function') {
    tabView.bind(mainContainer);
  }

  bindHeaderFooterEvents(root, state, {
    onTabChange: (tabId) => {
      activeTab = tabId;
      renderCurrentScreen();
      window.scrollTo({ top: 0, behavior: 'instant' });
    },
    onAfterPrimaryAction: () => {
      renderCurrentScreen();
      window.scrollTo({ top: 0, behavior: 'instant' });
    },
    onReturnToLobby: () => {
      currentScreen = 'lobby';
      renderCurrentScreen();
    }
  });

  if (state.turn?.phase === 'YEAR_SUMMARY') {
    const token = `slip_${state.profile.age}_${state.meta?.runId}`;
    if (lastAutoModalToken !== token) {
      lastAutoModalToken = token;
      openAnnualSlipModal(state, () => renderCurrentScreen());
    }
  } else if (state.turn?.phase === 'EMERGENCY_DEBT') {
    const token = `debt_${state.profile.age}_${state.finance?.cash}`;
    if (lastAutoModalToken !== token) {
      lastAutoModalToken = token;
      openEmergencyDebtModal(state, () => renderCurrentScreen());
    }
  } else {
    lastAutoModalToken = null;
  }
}

export function refreshUI() {
  renderCurrentScreen();
}

export function initRouter() {
  initAudioSystem();

  window.addEventListener('game:ready', () => {
    currentScreen = 'lobby';
    activeTab = 'tab1';
    renderCurrentScreen();
  });

  window.addEventListener('game:stateChanged', () => {
    if (currentScreen === 'gameplay' || currentScreen === 'ending') {
      renderCurrentScreen();
    }
  });
}