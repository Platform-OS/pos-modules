/*
  a very simple implementation of bi-directional chat module for platformOS
  that uses WebSockets and Action Cable library to handle them

  https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
  https://www.npmjs.com/package/actioncable
*/



// imports
// ------------------------------------------------------------------------
import consumer from 'pos-chat-consumer.js';



// purpose:		handles sending and receiving messages as well as the inbox page
// ************************************************************************
window.pos.modules.chat = function(userSettings = {}){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // unique id for the modules (string)
  module.settings.id = 'pos-module-chat';

  // the main container with the chat inbox (dom node)
  module.settings.inbox = userSettings.inbox || document.querySelector('#pos-chat-inbox');
  // the input for typing new message (dom node)
  module.settings.messageInput = document.querySelector('#chat-messageInput');
  // the send button for new message (dom node)
  module.settings.sendButton = document.querySelector('#chat-sendButton');
  // the box that contains the messages list and that can scroll (dom node)
  module.settings.messagesListContainer = document.querySelector('#chat-messagesList-container');
  // the box with all the messages stored (dom node)
  module.settings.messagesList = document.querySelector('#chat-messagesList');
  // tries to parse the date with toLocaleString (function that gets Date object and returns parsed date or empty string if fails)
  module.settings.timezonedDate = date => {
    let timezonedDate;

    try {
      // the back-end returns the timezone formatted not according to tz identifier, so I'm going to risk the 'replace' here to make it work with .toLocaleString automatically
      timezonedDate = date.toLocaleString('en-US', { day: 'numeric', weekday: 'short', year: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric', hour12: true, timeZone: window.pos.profile.timezone.friendly_name_with_region.replace(' - ', '/') });
    } catch {
      if(typeof Intl == 'object' && typeof Intl.NumberFormat == 'function'){
        timezonedDate = date.toLocaleString('en-US', { day: 'numeric', weekday: 'short', year: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'Etc/UTC' });
      } else {
        timezonedDate = '';
      }
    }

    return timezonedDate;
  }
  // html template for the single message
  module.settings.messageTemplate = {
    // whole html template for sent message (dom node)
    sent: document.querySelector('#pos-chat-template-message-sent'),
    // whole html template for received message (dom node)
    received: document.querySelector('#pos-chat-template-message-received'),
    // selector for date field in the template (string)
    dateSelector: 'time',
    // selector for the message container (string)
    messageSelector: '.pos-chat-message-content'
  };
  // the id of the currently logged user (string)
  module.settings.currentUserId = window.pos.profile.id;
  // current user name
  module.settings.currentUserName = window.pos.profile.name;
  // the loading indicator when loading messages (dom node)
  module.settings.loadingIndicator = document.querySelector('#pos-chat-loadingIndicator');
  // current page of messages (int)
  module.settings.currentPage = 1;
  // are there more pages (bool)
  module.settings.morePages = true;

  // stores all the conversation list related stuff (object)
  module.settings.conversations = {};
  // container for the conversations list (dom node)
  module.settings.conversations.container = document.querySelector('#pos-chat-conversations');
  // selctor for the button to load more conversations (string)
  module.settings.conversations.loadMoreButtonSelector = '.pos-chat-conversations-more';
  // current page of conversations (int)
  module.settings.conversations.currentPage = 1;
  // are there more pages of conversations (bool)
  module.settings.conversations.morePages = document.querySelector(module.settings.conversations.loadMoreButtonSelector) ? true : false;

  // stores all the search related stuff (object)
  module.settings.search = {};
  // search input for searching users (dom node)
  module.settings.search.input = document.querySelector('.pos-chat-search-input');
  // search results container (dom node)
  module.settings.search.results = document.querySelector('.pos-chat-search-results');
  // clearing the search results button (dom node)
  module.settings.search.clear = document.querySelector('.pos-chat-search-clear');

  // the message that will appear when the connection is lost
  module.settings.lostConnection = pos.translations.connectionError;

  // the channel to send messages through (Action Cable channel)
  module.channel = null;
  // the id for the conversation (string)
  module.conversationId = module.settings.inbox.getAttribute('data-conversation-id');
  // instance of the toast notification shown when something fails
  module.errorNotification = null;

  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : false;



  // purpose:		initializes the module
  // ------------------------------------------------------------------------
  module.init = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing chat', module.settings.inbox);

    // create subscription for the channel
    if(module.conversationId){
      module.createSubscription();
    }

    // scroll to bottom after loading the messages
    if(module.conversationId){
      scrollBottom();
    }

    // parse dates from BE to be in the same format as browser locale
    if(module.conversationId){
      module.parseDates();
    }

    let is_desktop = true;

    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      is_desktop = false;
    }

    // handling what will happen on pressing enter in the input
    module.settings.messageInput?.addEventListener('keypress', (event) => {
      if(event.which == 13 && is_desktop && !event.shiftKey && module.settings.messageInput.value.trim()){
        event.preventDefault();

        module.sendMessage(module.settings.messageInput.value.trim());
        setTimeout(() => {
          module.settings.messageInput.value = '';
        }, 100);
      }
    });

    module.settings.messageInput?.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      document.execCommand("insertHTML", false, text);
    });

    // handling send button click
    module.settings.sendButton?.addEventListener('click', () => {
      if(module.settings.messageInput.value.trim()) {
        module.sendMessage(module.settings.messageInput.value.trim());
        setTimeout(() => {
          module.settings.messageInput.value = '';
        }, 100);
      }
    });

    // load previous messages when user scrolls to top
    let messagesListTimeout = '';
    module.settings.messagesListContainer?.addEventListener('scroll', () => {
      if(module.settings.morePages === true){
        clearTimeout(messagesListTimeout);
        messagesListTimeout = setTimeout(() => {
          if(module.settings.messagesListContainer.scrollTop === 0){
            module.settings.currentPage = module.settings.currentPage + 1;
            module.loadPage(module.settings.currentPage);
          }
        }, 300);
      }
    });

    // load nex page of conversations when user scrolls to bottom
    let conversationsListTimeout = '';
    module.settings.conversations.container.addEventListener('scroll', () => {
      if(module.settings.conversations.morePages === true){
        clearTimeout(conversationsListTimeout);
        conversationsListTimeout = setTimeout(() => {
          if(module.settings.conversations.container.scrollTop === module.settings.conversations.container.scrollHeight - module.settings.conversations.container.clientHeight){
            module.settings.conversations.currentPage = module.settings.conversations.currentPage + 1;
            module.conversations.load(module.settings.conversations.currentPage);
          }
        }, 300);
      }
    });

    if(module.settings.conversations.morePages){
      pos.modules.debug(module.settings.debug, module.settings.id, 'More conversations available');
    } else {
      pos.modules.debug(module.settings.debug, module.settings.id, 'Showing all conversations, no more pages available');
    }

    // search for users
    let searchTimeout = '';
    module.settings.search.input?.addEventListener('input', event => {
      searchTimeout = setTimeout(() => {
        clearTimeout(searchTimeout);
        if(event.target.value.trim().length > 0){
          module.search.run(event.target.value.trim());
        } else {
          module.search.clear();
        }
      }, 300);
    });

    // clear search results
    module.settings.search.clear?.addEventListener('click', () => {
      module.search.clear();
      module.settings.search.input?.focus();
    });

    // keyboard navigation between the search input and its results
    module.settings.search.input?.addEventListener('keydown', module.search.keyboard);
    module.settings.search.results?.addEventListener('keydown', module.search.keyboard);


    pos.modules.debug(module.settings.debug, module.settings.id, 'Chat initialized', module.settings.inbox);

  };



  // purpose:		escapes the html to a browser-safe string
  // arguments:	a html string to be escaped (string/html)
  // returns:		a browser-safe string
  // ------------------------------------------------------------------------
  function encodeHtml(string){
    const element = document.createElement('div');
    element.textContent = string;
    string = element.textContent;
    return string;
  };


  // purpose:		scrolls the chat window to the bottom
  // arguments:	scroll behavior - 'auto' (instant) or 'smooth' (string, default: 'auto')
  // ------------------------------------------------------------------------
  const scrollBottom = (behavior = 'auto') => {
    const container = module.settings.messagesListContainer;

    // When the tab is hidden (the usual case for the *recipient* of a message - the sender
    // is focused on their own tab) the browser pauses requestAnimationFrame and won't run
    // smooth-scroll animations, so a deferred/smooth scroll silently never happens. Jump
    // instantly instead, so the latest message is already in view once the tab is focused.
    if(document.hidden){
      container.scrollTop = container.scrollHeight - container.clientHeight;
      return;
    }

    // Visible tab: defer to the next frame so the scroll runs after the newly inserted
    // message has been laid out. This also lets the browser's scroll anchoring settle
    // first - when a message is inserted above the bottom (e.g. an out-of-order burst),
    // anchoring would otherwise fight a scroll issued in the same frame.
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight - container.clientHeight,
        left: 0,
        behavior: behavior
      });
    });
  };


  // purpose:		creates a subscription to a room between users
  // returns:		triggers a 'message' event on document when new    message
  //				    appears on the channel (send or received), passess the message details
  // ------------------------------------------------------------------------
  module.createSubscription = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Creating subscription');

    module.channel = consumer.subscriptions.create(
      {
        channel: 'conversate',
        room_id: module.conversationId,
        sender_name: module.settings.messageInput.getAttribute('data-from-name'),
        autor_id: module.settings.messageInput.getAttribute('data-current-profile-id'),
        authenticity_token: window.pos.csrfToken
      },
      {
        received: function(data){
          module.showMessage(
            Object.assign(data, {
              status: (module.settings.currentUserId == data.autor_id) ? 'sent' : 'received'
            })
          );

          if(module.settings.debug){
            if(data.status === 'received'){
              pos.modules.debug(module.settings.debug, module.settings.id, 'Message received', data);
            }
          }
        },

        initialized: function(){
          if(module.settings.debug){
            pos.modules.debug(module.settings.debug, module.settings.id, 'Subscription initialized');
          }
        },  

        connected: function(){
          pos.modules.debug(module.settings.debug, module.settings.id, `Connected to channel and joined the room ${module.conversationId}`);

          module.settings.messageInput.disabled = false;
          module.settings.messageInput.focus();
          pos.modules.debug(module.settings.debug, module.settings.id, 'Unlocked message input');

          // remove the error notification when connected
          if(module.errorNotification){
            module.errorNotification.hide();
          }
        },

        rejected: function(){
          module.blocked();

          pos.modules.debug(module.settings.debug, module.settings.id, `The connection was rejected by the server`);
        },

        disconnected: function(){
          module.blocked();

          pos.modules.debug(module.settings.debug, module.settings.id, `Disconnected from the server`);
        }
      }
    );
  };


  // purpose:		sends the message through the Action Cable
  // arguments:	the message to send (string)
  // ------------------------------------------------------------------------
  module.sendMessage = (message) => {
    let messageData = {
      message: encodeHtml(message),
      autor_id: module.settings.currentUserId,
      sender_name: module.settings.currentUserName,
      created_at: new Date()
    };

    module.channel.send(Object.assign(messageData, { create: true }));

    pos.modules.debug(module.settings.debug, module.settings.id, 'Message sent', messageData);
  };


  // purpose:		appends a message to the chat box
  // arguments:	all the message data that needs to be shown
  //				    according to the template in messageTemplate (object)
  // ------------------------------------------------------------------------
  module.showMessage = (messageData) => {

    // clone message template
    const messageHtml = messageData.status === 'received' ? module.settings.messageTemplate.received.content.cloneNode(true) : module.settings.messageTemplate.sent.content.cloneNode(true);
    // fill template with data
    messageHtml.querySelector(module.settings.messageTemplate.dateSelector).textContent = module.settings.timezonedDate(new Date(messageData.created_at));
    messageHtml.querySelector(module.settings.messageTemplate.dateSelector).dateTime = messageData.created_at;
    messageHtml.querySelector(module.settings.messageTemplate.messageSelector).innerHTML = encodeHtml(messageData.message).replace(/(\r\n|\r|\n)/g, '<br>');

    // Insert in chronological order (by created_at) rather than by arrival order, so a
    // burst of messages renders correctly even if channel delivery arrives out of order.
    // Falls back to appending at the end (the common case: the newest message).
    const messageDate = new Date(messageData.created_at);
    let appendedAtEnd = true;
    for(const li of module.settings.messagesList.querySelectorAll(':scope > li')){
      const time = li.querySelector(module.settings.messageTemplate.dateSelector);
      const liDate = (time && time.dateTime) ? new Date(time.dateTime) : null;
      if(liDate && liDate > messageDate){
        module.settings.messagesList.insertBefore(messageHtml, li);
        appendedAtEnd = false;
        break;
      }
    }

    if(appendedAtEnd){
      // append the message to the chat
      module.settings.messagesList.append(messageHtml);
    }

    scrollBottom('smooth');

    pos.modules.debug(module.settings.debug, module.settings.id, 'Message shown on page', messageData);
  };


  // purpose:		loads messages from given page
  // arguments:	the page number (int, default: 1)
  //            items per page to get (int, default: 30)
  // ------------------------------------------------------------------------
  module.loadPage = (page = 1, perPage = 30) => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Trying to load previous messages');

    let secondOldestMessage = module.settings.messagesList.querySelector('li:nth-of-type(2)');

    // show the loading indicator at start
    module.settings.loadingIndicator.classList.add('active');

    // get the data
    fetch(`/api/chat/messages.json?conversation_id=${module.conversationId}&page=${page}&per_page=${perPage}`)
    .then(response => {
      // parse it to JSON if valid
      if(response.ok){
        return response.json();
      } else {
        return Promise.reject(response);
      }
    })
    .then((data) => {
      // construct HTML elements for messages
      let html = document.createDocumentFragment();

      Object.entries(data.results).reverse().forEach(([key, messageData]) => {
        messageData = Object.assign(messageData, { status: (module.settings.currentUserId == messageData.autor_id) ? 'sent' : 'received'});

        // clone message template
        const messageHtml = messageData.status === 'received' ? module.settings.messageTemplate.received.content.cloneNode(true) : module.settings.messageTemplate.sent.content.cloneNode(true);
        // fill template with data
        messageHtml.querySelector(module.settings.messageTemplate.dateSelector).textContent = module.settings.timezonedDate(new Date(messageData.created_at));
        messageHtml.querySelector(module.settings.messageTemplate.dateSelector).dateTime = messageData.created_at;
        messageHtml.querySelector(module.settings.messageTemplate.messageSelector).innerHTML = encodeHtml(messageData.message).replace(/(\r\n|\r|\n)/g, '<br>');

        html.append(messageHtml);
      });


      // put the messages on top
      module.settings.messagesList.prepend(html);

      // disable loading next pages if there is nothing left
      if(!data.has_next_page){
        module.settings.morePages = false;
      }

      pos.modules.debug(module.settings.debug, module.settings.id, 'Previous messages loaded');
    })
    .catch((error) => {
      console.log(error);
      error.json().then(data => console.log(data));
    })
    .finally(() => {
      // remove the loading indicator
      module.settings.loadingIndicator.classList.remove('active');
      // scroll to the last seen message
      if(secondOldestMessage) {
        module.settings.messagesListContainer.scrollTop = secondOldestMessage.offsetTop - module.settings.messagesListContainer.clientHeight;
      }

      pos.modules.debug(module.settings.debug, module.settings.id, 'Finished loading previous messages');
    });
  };


  // purpose:		blocks the chat when there is a critical error
  // ------------------------------------------------------------------------
  module.blocked = () => {
    module.settings.messageInput.disabled = true;
    module.errorNotification = new window.pos.modules.toast(
      'error',
      window.pos.translations.chat.connectionError
    );

    pos.modules.debug(module.settings.debug, module.settings.id, 'Blocked the chat due to error');
  };


  // purpose:		parses the dates outputted from BE with JS so that everyting uses browser locale
  // ------------------------------------------------------------------------
  module.parseDates = () => {
    document.querySelectorAll('.pos-chat-message time').forEach(date => {
      let currentDate = new Date(date.dateTime);
      date.innerText = module.settings.timezonedDate(currentDate);
    });
  };


  // conversations
  // ------------------------------------------------------------------------
  module.conversations = {};


  // purpose:   loads next page of conversations
  // ------------------------------------------------------------------------
  module.conversations.load = (page = 1) => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Trying to load next page of conversations');

    // get the data
    fetch(`/conversations.frame?page=${page}`)
    .then(response => {
      if(response.ok){
        return response.text();
      } else {
        return Promise.reject(response);
      }
    })
    .then(data => {
      // remove the 'load more' button for previous page
      document.querySelector(module.settings.conversations.loadMoreButtonSelector)?.remove();

      module.settings.conversations.container.insertAdjacentHTML('beforeend', data);

      pos.modules.debug(module.settings.debug, module.settings.id, `Conversations page ${page} loaded`, { data });

      // disable loading next pages if there is nothing left
      if(!document.querySelector(module.settings.conversations.loadMoreButtonSelector)){
        module.settings.conversations.morePages = false;
        pos.modules.debug(module.settings.debug, module.settings.id, 'There are no more conversations to load, disabling infinite scroll');
      }
    })
    .catch((error) => {
      console.log(error);
      error.json().then(data => console.log(data));
    })
    .finally(() => {
      pos.modules.debug(module.settings.debug, module.settings.id, 'Finished loading previous conversations');
    });
  };



  // search
  // ------------------------------------------------------------------------
  module.search = {};


  // purpose:		loads people search results
  // arguments:	the search query (string)
  // ------------------------------------------------------------------------
  module.search.run = (query) => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Running search query', query);
    // get the data
    fetch(`/search.frame?q=${query}`)
    .then(response => {
      if(response.ok){
        pos.modules.debug(module.settings.debug, module.settings.id, 'Query run successfull', response);

        return response.text();
      } else {
        pos.modules.debug(module.settings.debug, module.settings.id, 'Query run failed', response);

        return Promise.reject(response);
      }
    })
    .then(data => {
      module.settings.search.results.innerHTML = data;
      
      pos.modules.debug(module.settings.debug, module.settings.id, 'Applied serach results HTML to the page', data);
    })
  };


  // purpose:		clears search results
  // ------------------------------------------------------------------------
  module.search.clear = () => {
    module.settings.search.input.value = '';
    module.settings.search.results.innerHTML = '';
  };


  // purpose:		gets the currently rendered search result links
  // returns:		the result links, in DOM order (array of dom nodes)
  // ------------------------------------------------------------------------
  module.search.focusableResults = () => Array.from(module.settings.search.results.querySelectorAll('a'));


  // purpose:		moves focus between the search input and its results with the keyboard,
  //				    wrapping from the last link back to the first and vice versa
  // arguments:	the keydown event fired on the search input or the results list (event)
  // ------------------------------------------------------------------------
  module.search.keyboard = (event) => {
    const links = module.search.focusableResults();

    // handles the input
    if(event.target === module.settings.search.input){
      if(event.key === 'Escape'){
        event.preventDefault();

        pos.modules.debug(module.settings.debug, module.settings.id, 'Clearing search results');
        
        module.search.clear();
      }
    }

    if(!links.length){
      return;
    }

    const currentIndex = links.indexOf(event.target);

    // handles the results list
    switch(event.key){
      case 'Escape':
        pos.modules.debug(module.settings.debug, module.settings.id, 'Clearing search results');

        if(currentIndex !== -1){
          event.preventDefault();
          module.search.clear();
          module.settings.search.input?.focus();
        }
        break;
      case 'ArrowDown':
        if(event.target === module.settings.search.input){
          pos.modules.debug(module.settings.debug, module.settings.id, 'Focusing first search result');

          event.preventDefault();
          links[0].focus();
        } else if(currentIndex !== -1){
          event.preventDefault();

          pos.modules.debug(module.settings.debug, module.settings.id, 'Focusing next search result');
          
          links[(currentIndex + 1) % links.length].focus();
        }
        break;

      case 'ArrowUp':
        if(currentIndex !== -1){
          event.preventDefault();

          pos.modules.debug(module.settings.debug, module.settings.id, 'Focusing previous search result');

          links[(currentIndex - 1 + links.length) % links.length].focus();
        }
        break;

      case 'Home':
        if(currentIndex !== -1){
          event.preventDefault();

          pos.modules.debug(module.settings.debug, module.settings.id, 'Focusing first search result');

          links[0].focus();
        }
        break;

      case 'End':
        if(currentIndex !== -1){
          event.preventDefault();

          pos.modules.debug(module.settings.debug, module.settings.id, 'Focusing last search result');

          links[links.length - 1].focus();
        }
        break;
    }
  };



  module.init();

};

document.addEventListener('DOMContentLoaded', () => {
  if(document.querySelector('#pos-chat-inbox')){
    window.pos.modules.active.chat = new window.pos.modules.chat({
      inbox: document.querySelector('#pos-chat-inbox'),
    });
  }
});