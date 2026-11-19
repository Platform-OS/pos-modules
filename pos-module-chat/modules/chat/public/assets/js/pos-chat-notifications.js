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

    // the counter first, so a 'pos-chat:message' listener already reads the new one
    if(Number.isInteger(data.unread_conversations)){
      module.setUnreadConversations(data.unread_conversations, data.unread_at);
    }

    if(type === 'message_created'){
      module.notify(data);
    }
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
    const inbox = window.pos.modules.active?.chat;

    const detail = {
      message_id: data.message_id,
      conversation_id: conversationId,
      sender_id: data.sender_id,
      sender_name: data.sender_name,
      message: data.message,
      created_at: data.created_at,
      url: conversationId ? `/inbox?conversation_id=${encodeURIComponent(conversationId)}` : '/inbox',
      active: Boolean(conversationId && inbox?.conversationId && String(inbox.conversationId) === conversationId && document.visibilityState === 'visible')
    };

    debug('New message', detail);

    document.dispatchEvent(new CustomEvent('pos-chat:message', { detail: detail }));
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
