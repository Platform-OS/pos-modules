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
const chat = function(){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // do you want to enable debug mode that logs to console (bool)
  module.settings.debug = false;
  // the main container with the chat inbox (dom node)
  module.settings.inbox = document.querySelector('#pos-chat-inbox');
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
  module.settings.morePages = true
  // the message that will appear when the connection is lost
  module.settings.lostConnection = pos.translations.connectionError;

  // the channel to send messages through (Action Cable channel)
  module.channel = null;
  // the id for the conversation (string)
  module.conversationId = module.settings.inbox.getAttribute('data-conversation-id');
  // instance of the toast notification shown when something fails
  module.errorNotification = null;


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
  // ------------------------------------------------------------------------
  const scrollBottom = () => {
    module.settings.messagesListContainer.scrollTo(0, module.settings.messagesList.scrollHeight);
  };


  // purpose:		creates a subscription to a room between users
  // returns:		triggers a 'message' event on document when new message
  //				    appears on the channel (send or received), passess the message details
  // ------------------------------------------------------------------------
  module.createSubscription = () => {
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
          //document.dispatchEvent(new CustomEvent('message', {detail: Object.assign(data, { status: (module.settings.currentUserId == data.autor_id) ? 'sent' : 'received'})}));

          if(module.settings.debug){
            if(data.status === 'received'){
              console.log('[pos-module-chat] Message received', data);
            }
          }
        },

        initialized: function(){
          if(module.settings.debug){
            console.log('[pos-module-chat] Initialized');
          }
        },  

        connected: function(){
          if(module.settings.debug){
            console.log('[pos-module-chat] Connected')
          }

          module.settings.messageInput.disabled = false;
          module.settings.messageInput.focus();

          // remove the error notification when connected
          if(module.errorNotification){
            module.errorNotification.hide();
          }

          if(module.settings.debug){
            console.log(`[pos-module-chat] Connected to channel and joined room ${module.conversationId}`);
          }
        },

        rejected: function(){
          console.log('rejected');
          module.blocked();

          if(module.settings.debug){
            console.log('[pos-module-chat] The connection was rejected by the server');
          }
        },

        disconnected: function(){
          console.log('disconnected')
          module.blocked();

          if(module.settings.debug){
            console.log(`[pos-module-chat] You've been disconnected from the server`);
          }
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

    if(module.settings.debug){
      console.log('[pos-module-chat] Message sent', messageData);
    }
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
    // append the message to the chat
    module.settings.messagesList.append(messageHtml);
    // scroll into the view
    module.settings.messagesListContainer.scrollTo({
      top: module.settings.messagesListContainer.scrollHeight - module.settings.messagesListContainer.clientHeight,
      left: 0,
      behavior: 'smooth'
    });

    if(module.settings.debug){
      console.log('[pos-module-chat] Message shown in chat');
    }
  };


  // purpose:		loads messages from given page
  // arguments:	the page number (int, default: 1)
  //            items per page to get (int, default: 30)
  // ------------------------------------------------------------------------
  module.loadPage = (page = 1, perPage = 30) => {
    if(module.settings.debug){
      console.log('[pos-module-chat] Trying to load previous messages');
    }

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

      if(module.settings.debug){
        console.log('[pos-module-chat] Previous messages loaded');
      }
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

      if(module.settings.debug){
        console.log('[pos-module-chat] Finished trying to load previous messages');
      }
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
  };


  // purpose:		parses the dates outputted from BE with JS so that everyting uses browser locale
  // ------------------------------------------------------------------------
  module.parseDates = () => {
    document.querySelectorAll('.pos-chat-message time').forEach(date => {
      let currentDate = new Date(date.dateTime);
      date.innerText = module.settings.timezonedDate(currentDate);
    });
  };


  // purpose:		initializes the module
  // ------------------------------------------------------------------------
  module.init = () => {
    // create subscription for the channel
    module.createSubscription();

    // scroll to bottom after loading the messages
    scrollBottom();

    // parse dates from BE to be in the same format as browser locale
    module.parseDates();

    let is_desktop = true;

    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      is_desktop = false;
    }

    // handling what will happen on pressing enter in the input
    module.settings.messageInput.addEventListener('keypress', (event) => {
      if(event.which == 13 && is_desktop && !event.shiftKey && module.settings.messageInput.value.trim()){
        event.preventDefault();

        module.sendMessage(module.settings.messageInput.value.trim());
        setTimeout(() => {
          module.settings.messageInput.value = '';
        }, 100);
      }
    });

    module.settings.messageInput.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      document.execCommand("insertHTML", false, text);
    });

    // handling send button click
    module.settings.sendButton.addEventListener('click', () => {
      if(module.settings.messageInput.value.trim()) {
        module.sendMessage(module.settings.messageInput.value.trim());
        setTimeout(() => {
          module.settings.messageInput.value = '';
        }, 100);
      }
    });

    // what will happen when new message appears in channel
    document.addEventListener('message', event => {
      module.showMessage(event.detail);
      scrollBottom();

      // if(event.detail.status === 'sent'){
      //   document.chatNotifications.send(event.detail.to_id, event.detail);
      // }
    });

    // load previous messages when user scrolls to top
    let messagesListTimeout = '';
    module.settings.messagesListContainer.addEventListener('scroll', () => {
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

  };

  module.init();

};

document.addEventListener('DOMContentLoaded', () => {
  if(document.querySelector('#chat-messagesList-container')){
    window.pos.modules.chat = new chat();
  }
});



// purpose:		handles the behavior of 'send message' button
// argumenst: configurable settings (object)
// ************************************************************************
const sendMessageButton = function(userSettings){

	// cache 'this' value not to be overwritten later
	const module = this;


  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
	module.settings = {};
	// the 'send message' button (dom node)
  module.sendMessageButton = userSettings.sendMessageButton ? userSettings.sendMessageButton : document.querySelector('.chat-sendMessage');


  // purpose:		blocks the button after first click to prevent
  //            cloning the conversations to a single user
  // ------------------------------------------------------------------------
  module.preventDoubleClick = () => {
    module.sendMessageButton.addEventListener('click', () => {
      module.sendMessageButton.setAttribute('disabled', 'disabled');
    });
  };


  // purpose:		initializes the module
  // ------------------------------------------------------------------------
  module.init = () => {
    module.preventDoubleClick();
  };

  module.init();

};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.chat-sendMessage').forEach((item) => {
    new sendMessageButton({
      sendMessageButton: item
    });
  });
});
