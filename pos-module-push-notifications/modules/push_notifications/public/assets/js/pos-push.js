/*
  handles push notifications registration and subscription

  usage:
    new pos.modules.push({ settings });
*/


pos.modules.push = function(settings){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // container element (DOM element)
  module.settings.container = settings.container;
  // unique id for the module (string)
  module.settings.id = module.settings.container.id || 'pos-push';
  // api endpoint that handles creating new subscription (string)
  module.settings.subscribeUrl = settings.subscribeUrl || '/push_notifications/subscriptions';
  // api endpoint that handles deleting subscription (string)
  module.settings.destroyUrl = settings.destroyUrl || '/push_notifications/subscriptions/destroy';
  // api endpoint that handles rotating VAPID keys (string)
  module.settings.rotateUrl = settings.rotateUrl || '/push_notifications/subscriptions/rotate';
  // path to the service worker file (string)
  module.settings.serviceWorkerPath = settings.serviceWorkerPath || '/sw.js';
  // VAPID public key (string)
  module.settings.vapidPublicKey = settings.vapidPublicKey || '';
  // service worker registration object (object)
  module.settings.serviceWorkerRegistration = null;

  // debug mode enabled (bool)
  module.settings.debug = typeof settings.debug === 'boolean' ? settings.debug : true;




  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = () => {

    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing push module', module.settings.container);
  };


  // purpose:		registers service worker
  // returns:   registration object (promise)
  // ------------------------------------------------------------------------
  module.register = async () => {
    if(!('serviceWorker' in navigator)){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Service Worker not supported, aborting', module.settings.container);

      return null;
    }

    let sep = module.settings.serviceWorkerPath.indexOf('?') === -1 ? '?' : '&';
    let url = module.settings.serviceWorkerPath + sep + new URLSearchParams({
      vapid: module.settings.vapidPublicKey,
      rotate_url: module.settings.rotateUrl
    }).toString();
    
    module.settings.serviceWorkerRegistration = await navigator.serviceWorker.register(url);

    pos.modules.debug(module.settings.debug, module.settings.id, 'Service worker registered', module.settings.serviceWorkerRegistration);

    return module.settings.serviceWorkerRegistration;
  };



  module.init();

};