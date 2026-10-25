(() => {
  'use strict';

  let ysdk = null;
  let initialization = null;
  let sdkLoad = null;
  let handlers = { onPause: () => {}, onResume: () => {} };
  let listenersInstalled = false;
  let readyReported = false;
  let gameplayActive = false;
  let gameplayReported = false;
  let yandexPaused = false;
  let yandexWasActiveBeforePause = false;
  let documentHidden = document.visibilityState === 'hidden';
  let windowBlurred = false;
  let adPaused = false;
  let paused = false;

  function effectivePause() {
    return yandexPaused || documentHidden || windowBlurred || adPaused;
  }

  function reportGameplayStart() {
    const gameplayApi = ysdk?.features?.GameplayAPI;
    if (!gameplayApi || typeof gameplayApi.start !== 'function' || !gameplayActive || gameplayReported || paused) return;
    try {
      gameplayApi.start();
      gameplayReported = true;
    } catch (_) { /* Keep the browser game playable if a platform metric is unavailable. */ }
  }

  function reportGameplayStop() {
    const gameplayApi = ysdk?.features?.GameplayAPI;
    if (!gameplayReported) return;
    if (gameplayApi && typeof gameplayApi.stop === 'function') {
      try { gameplayApi.stop(); } catch (_) { /* SDK telemetry is optional at runtime. */ }
    }
    gameplayReported = false;
  }

  function syncPauseState() {
    const nextPaused = effectivePause();
    if (nextPaused === paused) return;
    paused = nextPaused;
    if (paused) handlers.onPause();
    else {
      handlers.onResume();
      reportGameplayStart();
    }
  }

  function loadSdk() {
    if (window.YaGames) return Promise.resolve(window.YaGames);
    if (window.location.protocol === 'file:') return Promise.resolve(null);
    if (sdkLoad) return sdkLoad;

    sdkLoad = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = '/sdk.js';
      script.async = true;
      script.dataset.yandexGamesSdk = 'true';
      script.addEventListener('load', () => resolve(window.YaGames || null), { once: true });
      script.addEventListener('error', () => resolve(null), { once: true });
      document.head.append(script);
    });
    return sdkLoad;
  }

  function onYandexPause() {
    yandexWasActiveBeforePause = gameplayReported;
    gameplayReported = false;
    yandexPaused = true;
    syncPauseState();
  }

  function onYandexResume() {
    yandexPaused = false;
    if (yandexWasActiveBeforePause && gameplayActive) gameplayReported = true;
    yandexWasActiveBeforePause = false;
    syncPauseState();
    reportGameplayStart();
  }

  function installPauseListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener('visibilitychange', () => {
      documentHidden = document.visibilityState === 'hidden';
      syncPauseState();
    });
    window.addEventListener('blur', () => {
      windowBlurred = true;
      syncPauseState();
    });
    window.addEventListener('focus', () => {
      windowBlurred = false;
      syncPauseState();
    });
  }

  function initialize(nextHandlers = {}) {
    handlers = {
      onPause: typeof nextHandlers.onPause === 'function' ? nextHandlers.onPause : () => {},
      onResume: typeof nextHandlers.onResume === 'function' ? nextHandlers.onResume : () => {}
    };
    installPauseListeners();
    syncPauseState();
    if (initialization) return initialization;

    initialization = (async () => {
      const api = await loadSdk();
      if (!api || typeof api.init !== 'function') return null;
      try {
        ysdk = await api.init();
        ysdk?.on?.('game_api_pause', onYandexPause);
        ysdk?.on?.('game_api_resume', onYandexResume);
        reportGameplayStart();
        return ysdk;
      } catch (_) {
        ysdk = null;
        return null;
      }
    })();
    return initialization;
  }

  function ready() {
    if (readyReported) return;
    readyReported = true;
    try { ysdk?.features?.LoadingAPI?.ready?.(); } catch (_) { /* Local browser preview has no Yandex SDK. */ }
  }

  function requestMobileFullscreen() {
    if (!ysdk || !window.matchMedia?.('(pointer: coarse)').matches) return;
    const fullscreen = ysdk.screen?.fullscreen;
    if (fullscreen?.status !== 'off' || typeof fullscreen.request !== 'function') return;
    try { Promise.resolve(fullscreen.request()).catch(() => {}); } catch (_) { /* Fullscreen can be unavailable in some webviews. */ }
  }

  function startGameplay() {
    gameplayActive = true;
    requestMobileFullscreen();
    reportGameplayStart();
  }

  function stopGameplay() {
    gameplayActive = false;
    reportGameplayStop();
  }

  function showInterstitial(onComplete) {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      adPaused = false;
      syncPauseState();
      if (typeof onComplete === 'function') onComplete();
    };

    if (!ysdk?.adv?.showFullscreenAdv) {
      finish();
      return false;
    }

    adPaused = true;
    syncPauseState();
    try {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => {
            adPaused = true;
            syncPauseState();
          },
          onClose: finish,
          onError: finish
        }
      });
      return true;
    } catch (_) {
      finish();
      return false;
    }
  }

  window.GamePlatform = {
    initialize,
    ready,
    startGameplay,
    stopGameplay,
    showInterstitial,
    isPaused: () => paused
  };
})();
