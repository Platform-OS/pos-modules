// PWA helpers for the desk (07 §4.3): registers the desk service worker with
// scope /support-desk/, offers "Install Support app" where the browser
// supports it, and shows Add-to-Home-Screen steps on iOS outside the app.
(function () {
  // Same URL as the push module builds, so both register one worker.
  const workerUrl = document.body.dataset.supportSw;
  if ('serviceWorker' in navigator && workerUrl) {
    navigator.serviceWorker.register(workerUrl, { scope: '/support-desk' }).catch(() => {});
  }

  let deferredPrompt = null;
  const installButtons = () => document.querySelectorAll('[data-support-install]');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButtons().forEach((button) => { button.hidden = false; });
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-support-install]');
    if (!button || !deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButtons().forEach((el) => { el.hidden = true; });
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isIos && !standalone) {
    document.querySelectorAll('[data-support-ios-hint]').forEach((el) => { el.hidden = false; });
  }
})();
