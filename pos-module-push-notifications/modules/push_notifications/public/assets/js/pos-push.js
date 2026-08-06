/*
  handles push notifications: registering the service worker, subscribing and
  unsubscribing the browser, reflecting subscription state on a toggle button,
  and highlighting the current browser's row in a subscriptions list

  usage:
    new pos.modules.push({ container });
    new pos.modules.pushSubscriptionsList({ container });
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
  // container element (dom node)
  module.settings.container = userSettings.container;
  // unique id for the module (string)
  module.settings.id = userSettings.id || module.settings.container.id || 'pos-push';
  // selector, relative to the container, for the subscribe/unsubscribe toggle button (string)
  module.settings.buttonSelector = userSettings.buttonSelector || '.pos-push-subscribe-btn';
  // toggle button (dom node)
  module.settings.button = module.settings.container.querySelector(module.settings.buttonSelector);
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
  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : false;

  // service worker scope (object)
  module.settings.serviceWorker = {};
  // path to the service worker file (string)
  module.settings.serviceWorker.path = userSettings.serviceWorkerPath || '/sw.js';
  // service worker registration object (object)
  module.settings.serviceWorker.registration = null;



  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing push module', module.settings.container);

    module.serviceWorker.register();

    if(module.settings.button){
      module.settings.button.addEventListener('click', module.handleButtonClick);

      module.refreshState();
    }
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


  // purpose:		asks the user for permission and subscribes the browser to push notifications
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

    if(!response.ok) return null;

    const result = await response.json();

    pos.modules.debug(module.settings.debug, module.settings.id, 'Subscribed to push notifications', result);
    document.dispatchEvent(new CustomEvent('pos-push-subscribed', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id, subscription: result } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-push-subscribed', { target: module.settings.container, id: module.settings.id, subscription: result });

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
    } catch(e) {}

    pos.modules.debug(module.settings.debug, module.settings.id, 'Unsubscribed from push notifications', id);
    document.dispatchEvent(new CustomEvent('pos-push-unsubscribed', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id, subscriptionId: id } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-push-unsubscribed', { target: module.settings.container, id: module.settings.id, subscriptionId: id });
  };


  // purpose:		reports the browser's notification permission state
  // returns:   'granted', 'denied' or 'default' (string)
  // ------------------------------------------------------------------------
  module.getPermissionState = () => {
    if(!('Notification' in window)) return 'denied';

    return Notification.permission;
  };


  // purpose:		syncs the toggle button with the browser permission and server subscriptions
  // ------------------------------------------------------------------------
  module.refreshState = async () => {
    if(module.getPermissionState() === 'denied'){
      module.button.setBlocked();

      return;
    }

    const registration = await pos.modules.push.readyRegistration();
    const localEndpoint = await pos.modules.push.localEndpoint(registration);
    const serverSubscriptions = await pos.modules.push.serverSubscriptions(module.settings.subscribeUrl);
    const match = serverSubscriptions.find(subscription => subscription.endpoint === localEndpoint);

    if(match){
      module.button.setSubscribed(match.id);
    } else {
      module.button.setUnsubscribed();
    }
  };


  // toggle button related
  // ------------------------------------------------------------------------
  module.button = {};


  // purpose:		reacts to the toggle button being clicked
  // ------------------------------------------------------------------------
  module.handleButtonClick = async () => {
    module.settings.button.disabled = true;

    if(module.settings.button.dataset.subscriptionId){
      await module.unsubscribe(module.settings.button.dataset.subscriptionId);

      module.button.setUnsubscribed();
    } else {
      const result = await module.subscribe();

      if(result){
        module.button.setSubscribed(result.id);
      } else {
        module.button.setUnsubscribed();
      }
    }
  };


  // purpose:		updates the button to reflect an active subscription
  // arguments: id of the active subscription (string)
  // ------------------------------------------------------------------------
  module.button.setSubscribed = (id) => {
    module.settings.button.textContent = 'Unsubscribe';
    module.settings.button.className = 'pos-button';
    module.settings.button.disabled = false;
    module.settings.button.dataset.subscriptionId = id;
  };


  // purpose:		updates the button to reflect no active subscription
  // ------------------------------------------------------------------------
  module.button.setUnsubscribed = () => {
    module.settings.button.textContent = 'Subscribe to Notifications';
    module.settings.button.className = 'pos-button pos-button-primary';
    module.settings.button.disabled = false;
    delete module.settings.button.dataset.subscriptionId;
  };


  // purpose:		updates the button to reflect notifications being blocked by the browser
  // ------------------------------------------------------------------------
  module.button.setBlocked = () => {
    module.settings.button.textContent = 'Notifications blocked';
    module.settings.button.className = 'pos-button';
    module.settings.button.disabled = true;
    delete module.settings.button.dataset.subscriptionId;
  };



  module.init();

};


// shared helpers, kept as static utilities on pos.modules.push rather than
// bare functions so pushSubscriptionsList below can reuse them without
// duplicating them or leaking them into the outer module scope
// ------------------------------------------------------------------------

// purpose:   waits for a service worker registration (if any) to become ready
// returns:   the ready registration, the existing registration, or null (promise)
// ------------------------------------------------------------------------
window.pos.modules.push.readyRegistration = async () => {
  let registration = null;

  try {
    registration = await navigator.serviceWorker.getRegistration();
  } catch(e) {}

  if(!registration) return null;

  try {
    return await navigator.serviceWorker.ready;
  } catch(e) {
    return registration;
  }
};


// purpose:   reads the endpoint of the subscription (if any) registered in this browser
// arguments: service worker registration (object)
// returns:   the subscription endpoint, or null (promise)
// ------------------------------------------------------------------------
window.pos.modules.push.localEndpoint = async (registration) => {
  if(!registration) return null;

  try {
    const subscription = await registration.pushManager.getSubscription();

    return subscription ? subscription.endpoint : null;
  } catch(e) {
    return null;
  }
};


// purpose:   fetches the subscriptions stored server side for the current user
// arguments: subscriptions list endpoint (string)
// returns:   list of subscription records (promise)
// ------------------------------------------------------------------------
window.pos.modules.push.serverSubscriptions = async (subscriptionsUrl) => {
  try {
    const response = await fetch(subscriptionsUrl);

    return response.ok ? await response.json() : [];
  } catch(e) {
    return [];
  }
};


// purpose:   converts a base64 VAPID key into the Uint8Array format the Push API expects
// arguments: base64 encoded string (string)
// returns:   decoded bytes (Uint8Array)
// ------------------------------------------------------------------------
window.pos.modules.push.urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);

  for(let i = 0; i < rawData.length; i++){
    output[i] = rawData.charCodeAt(i);
  }

  return output;
};



// purpose:   highlights the row of a subscriptions list that matches the browser it's viewed on
// usage:     new pos.modules.pushSubscriptionsList({ container: [dom node] });
// ************************************************************************
window.pos.modules.pushSubscriptionsList = function(userSettings){

  // cache 'this' value not to be overwritten later
  const module = this;


  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // container element (dom node)
  module.settings.container = userSettings.container;
  // unique id for the module (string)
  module.settings.id = userSettings.id || module.settings.container.id || 'pos-push-subscriptions-list';
  // selector, relative to a row, for the cell that marks "this browser" (string)
  module.settings.deviceSelector = userSettings.deviceSelector || '.pos-push-subscription-device';
  // api endpoint that handles listing subscriptions (string)
  module.settings.subscribeUrl = userSettings.subscribeUrl || '/push_notifications/subscriptions';
  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : false;



  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = async () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing push subscriptions list', module.settings.container);

    const registration = await pos.modules.push.readyRegistration();
    const localEndpoint = await pos.modules.push.localEndpoint(registration);

    if(!localEndpoint) return;

    const serverSubscriptions = await pos.modules.push.serverSubscriptions(module.settings.subscribeUrl);
    const match = serverSubscriptions.find(subscription => subscription.endpoint === localEndpoint);

    if(!match) return;

    module.highlightRow(match.id);
  };


  // purpose:		marks a row in the list as belonging to the current browser
  // arguments: id of the subscription to mark (string)
  // ------------------------------------------------------------------------
  module.highlightRow = (id) => {
    const row = module.settings.container.querySelector(`[data-pos-push-subscription-id="${id}"]`);
    const cell = row && row.querySelector(module.settings.deviceSelector);

    if(cell){
      cell.innerHTML = '<span class="pos-tag pos-tag-confirmation">This browser</span>';

      pos.modules.debug(module.settings.debug, module.settings.id, 'Marked row as this browser', row);
    }
  };



  module.init();

};
