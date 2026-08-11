/*
  handles push notifications: registering the service worker, subscribing and
  unsubscribing the browser, reflecting subscription state on a toggle button,
  and highlighting the current browser's row in a subscriptions list

  usage:
    new pos.modules.push({ settings });
    new pos.modules.push.toggle({ settings });
    new pos.modules.push.list({ settings });

  helpers:
    readyRegistration
    localEndpoint
    serverSubscriptions
    urlBase64ToUint8Array

*/




// purpose:   registers the service worker and handles subscribing/unsubscribing
//            the browser to push notifications, keeping a toggle button in sync
// usage:     new pos.modules.push({ container: [dom node] });
// ************************************************************************
window.pos.modules.push = function(userSettings){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // unique id for the module instance (string)
  module.settings.id = userSettings.id || 'pos-push';
  // api endpoint that handles listing and creating subscriptions (string)
  module.settings.subscribeUrl = userSettings.subscribeUrl || '/push_notifications/subscriptions';
  // api endpoint that handles deleting a subscription (string)
  module.settings.destroyUrl = userSettings.destroyUrl || '/push_notifications/subscriptions/destroy';
  // api endpoint that handles rotating VAPID keys (string)
  module.settings.rotateUrl = userSettings.rotateUrl || '/push_notifications/subscriptions/rotate';
  // VAPID public key (string)
  module.settings.vapidPublicKey = userSettings.vapidPublicKey || '';
  // csrf token sent with subscribe/unsubscribe requests (string)
  module.settings.csrfToken = userSettings.csrfToken || window.pos.csrfToken || '';

  // service worker scope (object)
  module.settings.serviceWorker = {};
  // path to the service worker file (string)
  module.settings.serviceWorker.path = userSettings.serviceWorkerPath || '/sw.js';
  // service worker registration object (object)
  module.settings.serviceWorker.registration = null;

  // if there is an active subscription, this holds it's ID (string)
  module.settings.subscription = {
    id: null
  };

  // what operating system is the user on (string)
  module.settings.os = userSettings?.os || 'other';
  // what browser is the user on (string)
  module.settings.browser = userSettings?.browser || 'other';
  // are we already in standalone (PWA) mode (bool)
  module.settings.isStandalone = userSettings?.isStandalone || false;
  // does the current browser context support direct Web Push API (bool)
  module.settings.supportsPushDirectly = userSettings?.supportsPushDirectly || false;
  // does the current browser context require PWA installation to enable push (bool)
  module.settings.requiresInstallForPush = userSettings?.requiresInstallForPush || false;

  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : true;


  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = async () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing push api', module.settings.container);
    
    await module.serviceWorker.register();

    const registration = await pos.modules.push.readyRegistration();
    const localEndpoint = await pos.modules.push.localEndpoint(registration);
    const serverSubscriptions = await pos.modules.push.serverSubscriptions(module.settings.subscribeUrl);
    const match = serverSubscriptions.find(subscription => subscription.endpoint === localEndpoint);

    if(match){
      module.settings.subscription.id = match.id;
      pos.modules.debug(module.settings.debug, module.settings.id, 'Found an existing subscription for current browser', module.settings.subscription);
    } else {
      module.settings.subscription.id = null
      pos.modules.debug(module.settings.debug, module.settings.id, 'Current browser have no registered subscriptions');
      module.detectCapabilities();
    }

    document.dispatchEvent(new CustomEvent('pos-push-initialized', { bubbles: true, detail: module.settings }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-push-initialized', module.settings);

  };


  // service worker related
  // ------------------------------------------------------------------------
  module.serviceWorker = {};

  // purpose:		registers the service worker
  // returns:   registration object (promise)
  // ------------------------------------------------------------------------
  module.serviceWorker.register = async () => {
    if(!('serviceWorker' in navigator)){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Service Worker not supported, aborting', module.settings.container);

      return null;
    }

    const sep = module.settings.serviceWorker.path.indexOf('?') === -1 ? '?' : '&';
    const url = module.settings.serviceWorker.path + sep + new URLSearchParams({
      vapid: module.settings.vapidPublicKey,
      rotate_url: module.settings.rotateUrl
    }).toString();

    module.settings.serviceWorker.registration = await navigator.serviceWorker.register(url);

    pos.modules.debug(module.settings.debug, module.settings.id, 'Service worker registered', module.settings.serviceWorker.registration);

    return module.settings.serviceWorker.registration;
  };


  // purpose:		asks the user for permission and subscribes the browser to push notifications both on the front-end and stores the subscription in database
  // returns:   the created subscription record, or null if permission was refused (promise)
  // ------------------------------------------------------------------------
  module.subscribe = async () => {
    const registration = module.settings.serviceWorker.registration || await module.serviceWorker.register();

    if(!registration) return null;

    const permission = await Notification.requestPermission();

    if(permission !== 'granted'){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Permission to show notifications was not granted');

      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: pos.modules.push.urlBase64ToUint8Array(module.settings.vapidPublicKey)
    });
    const json = subscription.toJSON();
    pos.modules.debug(module.settings.debug, module.settings.id, 'Subscribtion in the browser activated', json);

    const response = await fetch(module.settings.subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'subscription[endpoint]': subscription.endpoint,
        'subscription[keys][p256dh]': json.keys.p256dh,
        'subscription[keys][auth]': json.keys.auth,
        'authenticity_token': module.settings.csrfToken
      }).toString()
    });

    if(!response.ok){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Error while saving the subscription details to database', response);

      return null;
    }

    const result = await response.json();

    pos.modules.debug(module.settings.debug, module.settings.id, 'Subscribtion saved to database', result);

    module.settings.subscription.id = result.id;

    document.dispatchEvent(new CustomEvent('pos-push-subscribed', { bubbles: true, detail: { id: module.settings.id, subscription: result } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-push-subscribed', { id: module.settings.id, subscription: result });

    return result;
  };


  // purpose:		removes a subscription from the server and from the browser
  // arguments: id of the subscription record to remove (string)
  // ------------------------------------------------------------------------
  module.unsubscribe = async (id) => {
    await fetch(module.settings.destroyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'id': id,
        'authenticity_token': module.settings.csrfToken
      }).toString()
    });

    try {
      const registration = await pos.modules.push.readyRegistration();
      const subscription = registration && await registration.pushManager.getSubscription();

      if(subscription) await subscription.unsubscribe();

      module.settings.subscription.id = null;
    } catch(e){}

    pos.modules.debug(module.settings.debug, module.settings.id, 'Unsubscribed from push notifications', id);
    document.dispatchEvent(new CustomEvent('pos-push-unsubscribed', { bubbles: true, detail: { id: module.settings.id, subscription: { id } } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-push-unsubscribed', { id: module.settings.id, subscription: { id } });
  };


  // purpose:		detects the capabilities of the current browser
  // ------------------------------------------------------------------------
  module.detectCapabilities = () => {
    const ua = navigator.userAgent;
    const platform = navigator.userAgentData?.platform || navigator.platform || '';

    // operating system detection
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isMacOS = /Macintosh|Mac OS X/.test(ua) && !isIOS;

    if(isIOS) module.settings.os = 'ios';
    else if(isAndroid) module.settings.os = 'android';
    else if(isMacOS) module.settings.os = 'macos';
    else module.settings.os = 'desktop';

    pos.modules.debug(module.settings.debug, module.settings.id, `Detected operating system to be ${module.settings.os}`);

    // browser engine detection
    const isFirefox = /Firefox|FxiOS/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|OPR/.test(ua);

    if(isFirefox) module.settings.browser = 'firefox';
    else if(isSafari) module.settings.browser = 'safari';
    else module.settings.browser = 'chromium';

    pos.modules.debug(module.settings.debug, module.settings.id, `Detected browser to be ${module.settings.browser}`);

    // pwa display mode check (are we running inside an installed PWA?)
    module.settings.isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    pos.modules.debug(module.settings.debug, module.settings.id, `Detected standalone mode to be ${module.settings.isStandalone}`);

    // push support check
    module.settings.supportsPushDirectly = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

    pos.modules.debug(module.settings.debug, module.settings.id, `Detected direct push support to be ${module.settings.supportsPushDirectly ? 'available' : 'unavailable'}`);

    /**
     * Decision Rule:
     * Installation is REQUIRED if:
     * 1. We are NOT already in standalone (PWA) mode AND
     * 2. The current browser context DOES NOT support direct Web Push API (e.g., iOS Safari/Chrome/Firefox in tab view)
     */
    module.settings.requiresInstallForPush = !module.settings.isStandalone && !module.settings.supportsPushDirectly;

    pos.modules.debug(module.settings.debug, module.settings.id, `Detected that the current browser context ${module.settings.requiresInstallForPush ? 'requires' : 'does not require'} PWA installation for push`);

    return {
      os: module.settings.os,
      browser: module.settings.browser,
      isStandalone: module.settings.isStandalone,
      supportsPushDirectly: module.settings.supportsPushDirectly,
      requiresInstallForPush: module.settings.requiresInstallForPush
    };
  };



  module.init();

};



// purpose:   handles the subscribe/unsubscribe toggle button
// usage:     new pos.modules.push.toggle({ container: [dom node] });
// ************************************************************************
window.pos.modules.push.toggle = function(userSettings){

  // cache 'this' value not to be overwritten later
  const module = this;


  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // container element (dom node)
  module.settings.container = userSettings.container;
  // unique id for the module (string)
  module.settings.id = userSettings.id || module.settings.container.id || 'pos-push-toggle';

  // container with the pwa instructions (dom nodes collection)
  module.settings.instructions = document.querySelectorAll('.pos-push-toggle-instruction');

  // class to add if the user already subscribed (string)
  module.settings.subscribedClass = 'pos-push-subscribed';
  // class to add after the component is ready to show the toggle buttons (string)
  module.settings.activeClass = 'pos-push-toggle-active';
  // class to add to the container when the permission were rejected (string)
  module.settings.blockedClass = 'pos-push-blocked';
  // class added to instruction element when instruction for given os/browser is needed (string)
  module.settings.instructionActiveClass = 'pos-push-toggle-instruction-active';

  // toggle subscription button scope (object)
  module.settings.toggle = {};
  // subscribe buttons (dom nodes collection)
  module.settings.toggle.subscribe = userSettings.toggle?.subscribe || module.settings.container.querySelectorAll('.pos-push-toggle-subscribe');
  // unsubscribe button (dom nodes collection)
  module.settings.toggle.unsubscribe = userSettings.toggle?.unsubscribe || module.settings.container.querySelectorAll('.pos-push-toggle-unsubscribe');

  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : true;



  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = async () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing push toggle button', module.settings.container);

    if(module.settings.toggle.subscribe){
      module.settings.toggle.subscribe.forEach(element => {
        element.addEventListener('click', () => pos.modules.active['pos-push'].subscribe());
      });
    }

    if(module.settings.toggle.unsubscribe){
      module.settings.toggle.unsubscribe.forEach(element => {
        element.addEventListener('click', () => pos.modules.active['pos-push'].unsubscribe(pos.modules.active['pos-push'].settings.subscription.id));
      });
    }

    document.addEventListener('pos-push-initialized', () => {
      module.setUIState();
    });

    document.addEventListener('pos-push-unsubscribed', module.setUIState);
    document.addEventListener('pos-push-subscribed', module.setUIState);

    pos.modules.debug(module.settings.debug, module.settings.id, 'Push toggle button activated', module.settings.container);
  };


  // purpose:		reports the browser's notification permission state
  // returns:   'granted', 'denied' or 'default' (string)
  // ------------------------------------------------------------------------
  module.getPermissionState = () => {
    if(!('Notification' in window)) return 'denied';

    return Notification.permission;
  };


  // purpose:		syncs the toggle button state with the browser permission and server subscriptions
  // ------------------------------------------------------------------------
  module.setUIState = async () => {
    if(pos.modules.active['pos-push'].settings.requiresInstallForPush){

      module.settings.container.classList.add(module.settings.requiresInstallClass);

      pos.modules.debug(module.settings.debug, module.settings.id, `Hidden the direct 'enable notifications' button as the browser requires PWA installation for push to work.`);

      let matchFound = false;
      module.settings.instructions.forEach(el => {
        const targetOS = el.getAttribute('data-os');
        const targetBrowser = el.getAttribute('data-browser');

        const osMatch = targetOS === pos.modules.active['pos-push'].settings.os;
        const browserMatch = targetBrowser === 'all' || targetBrowser === pos.modules.active['pos-push'].settings.browser;

        if (osMatch && browserMatch) {
          el.classList.add(module.settings.instructionActiveClass);
          matchFound = true;
          pos.modules.debug(module.settings.debug, module.settings.id, `Shown the PWA installation guide for ${targetOS} and ${targetBrowser}`);
        } else {
          el.classList.remove(module.settings.instructionActiveClass);
        }
      });
    } else {
      module.settings.container.classList.add(module.settings.activeClass);
    
      if(module.getPermissionState() === 'denied'){
        module.settings.container.classList.add(module.settings.blockedClass);

        return;
      }

      if(pos.modules.active['pos-push'].settings.subscription.id){
        module.settings.container.classList.add(module.settings.subscribedClass);
      } else {
        module.settings.container.classList.remove(module.settings.subscribedClass);
      }
    }

    return;
  };



  module.init();

};



// purpose:   highlights the row of a subscriptions list that matches the browser it's viewed on
// usage:     new pos.modules.pushSubscriptionsList({ container: [dom node] });
// ************************************************************************
window.pos.modules.push.list = function(userSettings){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // container element (dom node)
  module.settings.container = userSettings.container;
  // unique id for the module (string)
  module.settings.id = userSettings.id || module.settings.container.id || 'pos-push-subscriptions-list';
  // class name to mark the row as corresponding to the current browser that the user is viewing the page from
  module.settings.currentClass = userSettings.currentClass || 'pos-push-list-current';
  // api endpoint that handles listing subscriptions (string)
  module.settings.subscribeUrl = userSettings.subscribeUrl || '/push_notifications/subscriptions';

  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : true;



  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = async () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing push subscriptions list', module.settings.container);

    const registration = await pos.modules.push.readyRegistration();
    const localEndpoint = await pos.modules.push.localEndpoint(registration);

    if(!localEndpoint) return;

    const serverSubscriptions = await pos.modules.push.serverSubscriptions(pos.modules.active['pos-push'].settings.subscribeUrl);
    const match = serverSubscriptions.find(subscription => subscription.endpoint === localEndpoint);
    if(!match){
      pos.modules.debug(module.settings.debug, module.settings.id, `Couldn't find current os/browser subscription on the list`);
    } else {
      pos.modules.debug(module.settings.debug, module.settings.id, 'Found current os/browser subscription on the list, highlighting', match.id);
      module.highlightRow(match.id);
    };

  };


  // purpose:		marks a row in the list as belonging to the current browser
  // arguments: id of the subscription to mark (string)
  // ------------------------------------------------------------------------
  module.highlightRow = (id) => {
    const row = module.settings.container.querySelector(`[data-pos-push-subscription-id="${id}"]`);

    if(row){
      row.classList.add(module.settings.currentClass);

      pos.modules.debug(module.settings.debug, module.settings.id, 'Marked row as this browser', row);
    }
  }


  module.init();
  
};



// purpose:   waits for a service worker registration (if any) to become ready
// returns:   the ready registration, the existing registration, or null (promise)
// ************************************************************************
window.pos.modules.push.readyRegistration = async () => {
  let registration = null;

  try {
    registration = await navigator.serviceWorker.getRegistration();
  } catch(e){
    pos.modules.debug(pos.debug, 'pos-push-readyRegistration', 'Could not get service worker registration', e);
  }

  if(!registration){
    pos.modules.debug(pos.debug, 'pos-push-readyRegistration', 'There is no registered service worker available');

    return null;
  }

  try {
    return await navigator.serviceWorker.ready;
  } catch(e){
    return registration;
  }
};



// purpose:   reads the endpoint of the subscription (if any) registered in this browser
// arguments: service worker registration (object)
// returns:   the subscription endpoint, or null (promise)
// ************************************************************************
window.pos.modules.push.localEndpoint = async (registration) => {
  pos.modules.debug(pos.debug, 'pos-push-localEndpoint', 'Reading subscription endpoint registered in the browser');

  if(!registration){
    pos.modules.debug(pos.debug, 'pos-push-localEndpoint', 'No registration provided');

    return null;
  }

  try {
    const subscription = await registration.pushManager.getSubscription();

    pos.modules.debug(pos.debug, 'pos-push-localEndpoint', 'Subscription endpoint registered in the browser is:', subscription || null);

    return subscription ? subscription.endpoint : null;
  } catch(e){
    pos.modules.debug(pos.debug, 'pos-push-localEndpoint', 'Error during reading the subscription endpoint registered in the browser', e);

    return null;
  }
};



// purpose:   fetches the subscriptions stored server side for the current user
// arguments: subscriptions list endpoint (string)
// returns:   list of subscription records (promise)
// ************************************************************************
window.pos.modules.push.serverSubscriptions = async (subscriptionsUrl) => {
  pos.modules.debug(pos.debug, 'pos-push-serverSubscriptions', 'Fetching server side subscription records');

  try {
    const response = await fetch(subscriptionsUrl);

    pos.modules.debug(pos.debug, 'pos-push-localEndpoint', 'Fetched server side subscriptions', response);

    return response.ok ? await response.json() : [];
  } catch(e){
    pos.modules.debug(pos.debug, 'pos-push-localEndpoint', 'Error during fetching server side subscriptions', e);

    return [];
  }
};



// purpose:   converts a base64 VAPID key into the Uint8Array format the Push API expects
// arguments: base64 encoded string (string)
// returns:   decoded bytes (Uint8Array)
// ************************************************************************
window.pos.modules.push.urlBase64ToUint8Array = (base64String) => {
  pos.modules.debug(pos.debug, 'pos-push-serverSubscriptions', 'Converting base64 string to Uint8Array', base64String);

  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);

  for(let i = 0; i < rawData.length; i++){
    output[i] = rawData.charCodeAt(i);
  }

  pos.modules.debug(pos.debug, 'pos-push-serverSubscriptions', 'Converted base64 string to Uint8Array', output);

  return output;
};