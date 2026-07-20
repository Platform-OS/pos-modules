/*
  simple tool to handle notifications about new chat messages
  that uses WebSockets and Action Cable library to handle them

  https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
  https://www.npmjs.com/package/actioncable

  This client only subscribes to the current user's own notifications room
  (notifications-<profile id>) to receive notifications; authorization is enforced
  server-side, so a user can only subscribe to their own room.

  Notifications are sent server-side when a message is created - never by a client
  broadcasting into another user's room.
*/



// imports
// ------------------------------------------------------------------------
import consumer from "./consumer";



const chatNotifications = function(){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // do you want to enable debug mode that logs to console (bool)
  module.settings.debug = false;
  // the container with the notifications (dom node)
  module.settings.notificationsContainer = document.querySelector('#notifications-chat');
  // the notification marker on the page to show when needed (dom element)
  module.settings.bell = document.querySelector('#notification-bell');
  // the main container with the chat inbox (dom node)
  module.settings.inbox = document.querySelector('#chat-inbox');

  // the channel to receive notifications through (Action Cable channel)
  module.listeningChannel = null;


  // purpose:		creates a subscription to a room between users
  // returns:		triggers a 'chatNotification' event on document when new notification
  //				is being received, passes the notification details
  // ------------------------------------------------------------------------
  module.createSubscription = () => {
    module.listeningChannel = consumer.subscriptions.create(
      {
        channel: 'notifications',
        room_id: 'notifications-' + module.settings.notificationsContainer.getAttribute('data-current-user-id')
      },
      {
        received: function(data){
          document.dispatchEvent(new CustomEvent('chatNotification', {detail: data}));

          if(module.settings.debug){
            console.log('[Notifications] Notification received');
            console.log(data);
          }
        },
        connected: function(data) {
          if(module.settings.debug){
            console.log(`[Notifications] Connected to channel and joined room notifications-${module.settings.notificationsContainer.getAttribute('data-current-user-id')}`);
          }
        }
      }
    );
  };


  // purpose:		handles the notification bell
  // arguments:	to show or to hide the bell (bool)
  // ------------------------------------------------------------------------
  module.bell = (show) => {
    if(show){
      module.settings.bell.style.display = 'block';
      localStorage.bell = 'visible';
    } else {
      module.settings.bell.style.display = 'none';
      localStorage.bell = 'hidden';
    }
  };


  // purpose:		initializes the module
  // ------------------------------------------------------------------------
  module.init = function(){
    // create subscription for receiving channel
    module.createSubscription();

    // react to receiving notification
    if(!module.settings.inbox){
      document.addEventListener('chatNotification', (data) => {
        module.bell(true);
      });
    }

    // show the bell when the notifications were not cleared
    if(localStorage.bell === 'visible'){
      module.bell(true);
    }

    // clear the notifications
    module.settings.notificationsContainer.addEventListener('click', () => {
      module.bell(false);
    });
  };

  module.init();

};

if(document.querySelector('#notifications-chat')){
  document.addEventListener('DOMContentLoaded', () => {
    document.chatNotifications = Object.freeze(new chatNotifications());
  });
}
