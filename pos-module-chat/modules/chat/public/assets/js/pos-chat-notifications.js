/*
  live notifications about new chat messages, for any page of the host app - not only the inbox

  listens on the user's own `notifications` room (`notifications-<profile id>`, authorized by
  views/partials/channels/notifications/subscribed) and turns what the server pushes there into
  DOM events, so the host app never has to touch Action Cable itself

  usage:
    window.pos.modules.chat.notifications.start({ consumer: actionCableConsumer, unread_conversations: 3 });

    document.addEventListener('pos-chat:message', event => {
      // event.detail: { message_id, conversation_id, sender_id, sender_name, message, created_at, url, active }
      // active - the inbox on this page has that conversation open and the tab is visible
      // fired in one of the user's open tabs only, see 'one tab per message' below
    });
    document.addEventListener('pos-chat:unread', event => {
      // event.detail: { unread_conversations }
    });

    window.pos.modules.chat.notifications.unread_conversations   // the number of unread conversations, null until known

    <span data-pos-chat-unread-conversations></span>   // shows the number, hidden when it's 0

  what the server pushes to the room (data):
    { type: 'message_created', message_id, conversation_id, sender_id, sender_name, message, created_at, unread_conversations, unread_at }
    { type: 'conversation_read', conversation_id, unread_conversations, unread_at }
  a payload without type is a new message (what the server sent before the type was added),
  unread_conversations and unread_at are optional - the counter is only updated when the payload carries it

  each time it connects (and again after the connection was lost) it asks GET /api/chat/notifications.json
  for the counters, as Action Cable doesn't replay what was sent while it wasn't connected - the
  messages sent meanwhile don't fire 'pos-chat:message' then, only the counter is brought up to date

  one tab per message: every open tab gets the message over its own WebSocket, but only one fires
  'pos-chat:message', so a toast or a sound isn't repeated in each of them. The tabs agree over a
  BroadcastChannel: each one that got the message claims it, and after a short wait the best claim
  handles it - the tab with that conversation open and visible, then the one with focus, then a
  visible one, then the one focused last. Without BroadcastChannel every tab fires it. The counters
  are updated in every tab, and module.onMessage() callbacks run in every tab (the inbox sidebar uses it)

  pos-chat.js sets window.pos.modules.chat to the inbox constructor and keeps what is already on
  it, so the two files can load in any order
*/



window.pos ??= {};
window.pos.modules ??= {};
window.pos.modules.chat ??= {};



// purpose:		subscribes to the notifications room and dispatches the events
// ************************************************************************
window.pos.modules.chat.notifications ??= (() => {

  const module = {};

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // unique id for the module (string)
  module.settings.id = 'pos-chat-notifications';
  // how many of the latest message ids are remembered to skip a notification delivered twice -
  // they are sent by a background job that retries on failure (int)
  module.settings.recentLimit = 100;
  // where the current counters are read from after connecting (string)
  module.settings.unreadUrl = '/api/chat/notifications.json';
  // elements showing the number of unread conversations, hidden when there are none (string)
  module.settings.unreadConversationsSelector = '[data-pos-chat-unread-conversations]';
  // how long (ms) the number counted with a message in the conversation open on this page waits for
  // the number counted once the inbox marked it read - shown if that doesn't come (int)
  module.settings.activeUnreadDelay = 5000;
  // how long (ms) a tab waits for the other tabs' claims to a message before the best one fires
  // 'pos-chat:message' - they get it over their own connections, a moment apart (int)
  module.settings.claimDelay = 200;
  // to enable debug mode (bool)
  module.settings.debug = false;

  // the Action Cable consumer the channel is created on, from pos-chat-consumer.js (object)
  module.consumer = null;
  // the subscription to the notifications room (Action Cable subscription)
  module.channel = null;
  // the number of unread conversations, null until it is known (int)
  module.unread_conversations = null;
  // when the server counted the current number of unread conversations - notifications come from background
  // jobs in no particular order, so an older count arriving late is ignored (ms since epoch)
  module.unreadAt = null;
  // ids of the latest messages notified about (Set)
  module.recent = new Set();
  // the number held back while the inbox marks the open conversation read, see module.holdUnreadConversations
  // ({ count, at, timeout } or null)
  module.heldUnread = null;
  // callbacks run with each new message in every tab, unlike 'pos-chat:message' (Set of functions)
  module.listeners = new Set();
  // talking to the user's other tabs (BroadcastChannel, null when not supported)
  module.tabs = null;
  // unique id of this tab (string)
  module.tabId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  // when this tab last got focus, the tab focused last is preferred (ms since epoch)
  module.focusedAt = document.hasFocus() ? Date.now() : 0;
  // claims to the messages, from this tab and the others, keyed by message id
  // (Map of id => { best: claim, handled: bool, cleanup: timeout id })
  module.claims = new Map();


  const debug = (...args) => {
    window.pos.modules.debug?.(module.settings.debug, module.settings.id, ...args);
  };



  // purpose:		starts listening, only the first call does anything
  // arguments:	consumer - the Action Cable consumer (object)
  //				    unread_conversations - the number of unread conversations when the page was rendered (int, optional)
  //				    debug - to enable debug mode (bool, optional)
  // returns:		the module (object)
  // ------------------------------------------------------------------------
  module.start = (userSettings = {}) => {
    if(module.channel){
      return module;
    }

    module.settings.debug = userSettings.debug ?? module.settings.debug;
    module.consumer = userSettings.consumer;

    if(Number.isInteger(userSettings.unread_conversations)){
      module.setUnreadConversations(userSettings.unread_conversations);
    }
    module.showUnreadConversations();

    const profileId = window.pos.profile?.id;

    if(!module.consumer || !profileId){
      debug('Not started, the consumer or window.pos.profile.id is missing');
      return module;
    }

    // the user's other tabs - named after the profile, so tabs of someone else who signs in here don't mix in
    if('BroadcastChannel' in window){
      module.tabs = new BroadcastChannel(`pos-chat-notifications-${profileId}`);
      module.tabs.addEventListener('message', event => module.receiveFromTab(event.data));
    }
    window.addEventListener('focus', () => {
      module.focusedAt = Date.now();
    });

    module.channel = module.consumer.subscriptions.create(
      {
        channel: 'notifications',
        room_id: `notifications-${profileId}`,
        authenticity_token: window.pos.csrfToken
      },
      {
        received: data => module.receive(data),

        connected: () => {
          debug(`Connected to the room notifications-${profileId}`);

          // what changed before connecting - since the page was rendered, or while disconnected
          module.refresh();
        },

        rejected: () => {
          debug('The subscription was rejected by the server');
        },

        disconnected: () => {
          debug('Disconnected');
        }
      }
    );

    return module;
  };



  // purpose:		reads the current counters from the server
  // returns:		resolves once they are applied, a failed request is only logged in debug mode (promise)
  // ------------------------------------------------------------------------
  module.refresh = async () => {
    try {
      const response = await fetch(module.settings.unreadUrl, { headers: { 'Accept': 'application/json' } });

      if(!response.ok){
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if(Number.isInteger(data?.unread_conversations)){
        module.setUnreadConversations(data.unread_conversations, data.unread_at);
      }
    } catch(error) {
      debug('Could not read the number of unread conversations', error);
    }
  };



  // purpose:		stops listening
  // ------------------------------------------------------------------------
  module.stop = () => {
    module.channel?.unsubscribe();
    module.channel = null;
    module.tabs?.close();
    module.tabs = null;
  };



  // purpose:		runs the callback with each new message, in every tab - unlike 'pos-chat:message', which
  //				    only one tab fires
  // arguments:	callback, gets the same detail as 'pos-chat:message' (function)
  // returns:		a function that removes the callback (function)
  // ------------------------------------------------------------------------
  module.onMessage = (callback) => {
    module.listeners.add(callback);

    return () => module.listeners.delete(callback);
  };



  // purpose:		handles a notification pushed by the server
  // arguments:	the notification (object)
  // ------------------------------------------------------------------------
  module.receive = (data) => {
    if(!data || typeof data !== 'object'){
      return;
    }

    const type = data.type ?? 'message_created';

    if(type === 'message_created'){
      if(module.seen(data.message_id)){
        debug('Skipping a notification delivered twice', data);
        return;
      }
    }

    // the counter first, so a 'pos-chat:message' listener already reads the new one - except for a
    // message in the conversation open on this page: the inbox marks it read right away, and the
    // number would go up and back down a moment later
    if(Number.isInteger(data.unread_conversations)){
      if(type === 'message_created' && module.isActive(data.conversation_id)){
        module.holdUnreadConversations(data.unread_conversations, data.unread_at);
      } else {
        module.setUnreadConversations(data.unread_conversations, data.unread_at);
      }
    }

    if(type === 'message_created'){
      module.notify(data);
    }
  };



  // purpose:		how good this tab is at handling the message, see module.claim
  // arguments:	conversation id of the message (string)
  // returns:		the claim (object)
  // ------------------------------------------------------------------------
  module.ownClaim = (conversationId) => {
    let priority = 0;

    if(module.isActive(conversationId)){
      priority = 3;
    } else if(document.visibilityState === 'visible' && document.hasFocus()){
      priority = 2;
    } else if(document.visibilityState === 'visible'){
      priority = 1;
    }

    return { priority: priority, focusedAt: module.focusedAt, tab: module.tabId };
  };


  // purpose:		compares two claims
  // returns:		if the first one is better (bool)
  // ------------------------------------------------------------------------
  const betterClaim = (a, b) => {
    if(!b){
      return true;
    }
    if(a.priority !== b.priority){
      return a.priority > b.priority;
    }
    if(a.focusedAt !== b.focusedAt){
      return a.focusedAt > b.focusedAt;
    }
    return a.tab > b.tab;
  };


  // purpose:		remembers a claim to the message, from this tab or another one
  // arguments:	message id (string), the claim (object)
  // returns:		what is known about the message (object)
  // ------------------------------------------------------------------------
  module.recordClaim = (messageId, claim) => {
    let entry = module.claims.get(messageId);

    if(!entry){
      entry = { best: null, handled: false };
      module.claims.set(messageId, entry);
      // claims to messages this tab doesn't get (its connection was down) mustn't pile up
      entry.cleanup = setTimeout(() => module.claims.delete(messageId), 60_000);
    }

    if(claim && betterClaim(claim, entry.best)){
      entry.best = claim;
    }

    return entry;
  };


  // purpose:		handles what the other tabs say
  // arguments:	{ type: 'claim', message_id, claim } or { type: 'handled', message_id } (object)
  // ------------------------------------------------------------------------
  module.receiveFromTab = (data) => {
    if(!data || data.message_id == null){
      return;
    }

    const messageId = String(data.message_id);

    if(data.type === 'claim' && data.claim){
      module.recordClaim(messageId, data.claim);
    } else if(data.type === 'handled'){
      module.recordClaim(messageId, null).handled = true;
    }
  };


  // purpose:		decides if this tab handles the message - claims it, waits for the other tabs'
  //				    claims and handles it if its own is the best one
  // arguments:	message id (string), conversation id (string)
  // returns:		resolves with true when this tab handles it (promise)
  // ------------------------------------------------------------------------
  module.claim = (messageId, conversationId) => {
    if(!module.tabs || messageId == null){
      return Promise.resolve(true);
    }

    const id = String(messageId);
    const claim = module.ownClaim(conversationId);

    module.recordClaim(id, claim);
    module.tabs.postMessage({ type: 'claim', message_id: id, claim: claim });

    return new Promise(resolve => {
      setTimeout(() => {
        const entry = module.recordClaim(id, null);
        // another tab that got it earlier has handled it already
        const handles = !entry.handled && entry.best?.tab === module.tabId;

        if(handles){
          entry.handled = true;
          module.tabs?.postMessage({ type: 'handled', message_id: id });
        }

        resolve(handles);
      }, module.settings.claimDelay);
    });
  };



  // purpose:		remembers the message id
  // arguments:	message id (string or int)
  // returns:		if it was notified about already (bool)
  // ------------------------------------------------------------------------
  module.seen = (messageId) => {
    if(messageId == null){
      return false;
    }

    const id = String(messageId);

    if(module.recent.has(id)){
      return true;
    }

    module.recent.add(id);

    // a Set keeps the insertion order, the first one is the oldest
    if(module.recent.size > module.settings.recentLimit){
      module.recent.delete(module.recent.values().next().value);
    }

    return false;
  };



  // purpose:		dispatches 'pos-chat:message' on document
  // arguments:	the notification about the new message (object)
  // ------------------------------------------------------------------------
  module.notify = (data) => {
    const conversationId = data.conversation_id != null ? String(data.conversation_id) : null;

    const detail = {
      message_id: data.message_id,
      conversation_id: conversationId,
      sender_id: data.sender_id,
      sender_name: data.sender_name,
      message: data.message,
      created_at: data.created_at,
      url: conversationId ? `/inbox?conversation_id=${encodeURIComponent(conversationId)}` : '/inbox',
      active: module.isActive(conversationId)
    };

    debug('New message', detail);

    module.listeners.forEach(listener => {
      try {
        listener(detail);
      } catch(error) {
        debug('A message listener failed', error);
      }
    });

    // only in one of the user's tabs
    module.claim(detail.message_id, conversationId).then(handles => {
      if(handles){
        document.dispatchEvent(new CustomEvent('pos-chat:message', { detail: detail }));
      } else {
        debug('Another tab handles the message', detail.message_id);
      }
    });
  };



  // purpose:		tells if the inbox on this page has the conversation open, with the tab visible -
  //				    a message there is read as soon as it's shown
  // arguments:	conversation id (string or int)
  // returns:		bool
  // ------------------------------------------------------------------------
  module.isActive = (conversationId) => {
    const inbox = window.pos.modules.active?.chat;

    return Boolean(conversationId != null && inbox?.conversationId && String(inbox.conversationId) === String(conversationId) && document.visibilityState === 'visible');
  };



  // purpose:		holds back the number counted with a new message in the conversation open on this page -
  //				    the number counted after the inbox marked it read replaces it; if that doesn't come
  //				    (the inbox lost its connection), it's shown after a while
  // arguments:	count - the number of unread conversations (int)
  //				    at - when the server counted it (ISO date string, optional)
  // ------------------------------------------------------------------------
  module.holdUnreadConversations = (count, at = null) => {
    clearTimeout(module.heldUnread?.timeout);

    module.heldUnread = {
      count: count,
      at: at,
      timeout: setTimeout(() => {
        const held = module.heldUnread;
        module.heldUnread = null;

        debug('Showing the number of unread conversations held back, the conversation wasn\'t marked read', held.count);
        module.setUnreadConversations(held.count, held.at);
      }, module.settings.activeUnreadDelay)
    };

    debug('Holding back the number of unread conversations while the open conversation is marked read', count);
  };



  // purpose:		updates the number of unread conversations, dispatches 'pos-chat:unread' on document when it changed
  // arguments:	count - the number of unread conversations (int)
  //				    at - when the server counted it (ISO date string, optional)
  // ------------------------------------------------------------------------
  module.setUnreadConversations = (count, at = null) => {
    if(!Number.isInteger(count) || count < 0){
      return;
    }

    const time = at ? Date.parse(at) : NaN;

    // a number counted after the one held back replaces it
    if(module.heldUnread){
      const heldTime = module.heldUnread.at ? Date.parse(module.heldUnread.at) : NaN;

      if(Number.isNaN(time) || Number.isNaN(heldTime) || time >= heldTime){
        clearTimeout(module.heldUnread.timeout);
        module.heldUnread = null;
      }
    }

    if(!Number.isNaN(time)){
      if(module.unreadAt !== null && time < module.unreadAt){
        debug('Skipping an older number of unread conversations', { count: count, at: at });
        return;
      }

      module.unreadAt = time;
    }

    if(count === module.unread_conversations){
      return;
    }

    module.unread_conversations = count;
    module.showUnreadConversations();

    debug('Number of unread conversations', count);

    document.dispatchEvent(new CustomEvent('pos-chat:unread', { detail: { unread_conversations: count } }));
  };


  // purpose:		shows the number of unread conversations in the elements marked for it
  // ------------------------------------------------------------------------
  module.showUnreadConversations = () => {
    if(module.unread_conversations === null){
      return;
    }

    document.querySelectorAll(module.settings.unreadConversationsSelector).forEach(element => {
      element.textContent = module.unread_conversations;
      element.hidden = module.unread_conversations === 0;
    });
  };


  return module;

})();
