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
      timezonedDate = date.toLocaleString('en-US', { day: 'numeric', weekday: 'short', year: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric', hour12: true });
    } catch {
      if(typeof Intl == 'object' && typeof Intl.NumberFormat == 'function'){
        timezonedDate = date.toLocaleString('en-US', { day: 'numeric', weekday: 'short', year: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric', hour12: true });
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
    // selector for the message text container (string)
    messageSelector: '.pos-chat-message-text',
    // selector for the image container (string)
    imageSelector: '.pos-chat-message-image',
    // selector for the file container (string)
    fileSelector: '.pos-chat-message-file'
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

  // gap (ms) since the previous message after which a timestamp is shown again (number)
  module.settings.timeGroupThreshold = 7 * 60 * 1000;

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

  // stores all the upload related stuff (object)
  module.settings.upload = {};
  // url to create the uploaded file record in the database (string)
  module.settings.upload.createUrl = '/api/chat/uploads';
  // media info staged from finished uploads, sent as message(s) on the next Send, keyed by
  // the uppy file id so removing a file from the uploader unstages it (array of { fileId, media: { type, name, size, url } })
  module.settings.upload.pending = [];
  // in-flight promises from module.upload.save() - saving an upload record (and getting
  // back its id + signed URL) is a round-trip, so a Send triggered before it resolves has
  // to wait for these rather than silently going out without the attachment
  module.settings.upload.pendingSaves = [];
  // button that clears the staged uploads (dom node)
  module.settings.upload.clear = document.querySelector('#chat-uploaderToggle');
  // id of the uploader module instance (string)
  module.settings.upload.uploaderId = 'chat-upload';
  // list showing the files added to the uploader (dom node)
  module.settings.upload.list = document.querySelector('#chat-uploaderList');
  // html template for a single item on the files list (dom node)
  module.settings.upload.listItemTemplate = document.querySelector('#pos-chat-template-uploader-list-item');
  // class added to the files list items that are images (string)
  module.settings.upload.listItemImageClass = 'pos-chat-uploader-list-item-image';
  // css custom property on the files list item holding its upload progress, 0-100 (string)
  module.settings.upload.progressProperty = '--pos-chat-upload-progress';
  // class added to the files list item once its file is uploaded, fades the progress border away (string)
  module.settings.upload.listItemUploadedClass = 'pos-chat-uploader-list-item-uploaded';
  // class added to the files list item when its file failed to upload, shows the progress border as an error (string)
  module.settings.upload.listItemFailedClass = 'pos-chat-uploader-list-item-failed';
  // the uppy instance the upload progress is already being listened to on (object)
  module.settings.upload.watchedUppy = null;
  // errors for the files currently being picked or dropped, waiting to be shown, keyed by
  // the kind of error (Map of kind => { message, fileNames })
  module.settings.upload.errors = new Map();
  // the longest file name shown in an error message, longer ones are cut with an ellipsis (int)
  module.settings.upload.maxFileNameLength = 15;
  // object URLs created for image previews, keyed by the uppy file id, so they can be revoked (Map)
  module.settings.upload.previews = new Map();
  // button that opens the system file picker (dom node)
  module.settings.upload.button = document.querySelector('#chat-uploadButton');
  // hidden file input behind the upload button, the picked files are added to the uploader (dom node)
  module.settings.upload.input = document.querySelector('#chat-uploadInput');
  // overlay shown when dragging files over the page, files dropped on it are added to the uploader (dom node)
  module.settings.upload.overlay = document.querySelector('.pos-chat-conversation-upload-overlay');
  // counts nested dragenter/dragleave events so the overlay doesn't flicker when dragging over child elements (int)
  module.settings.upload.dragCounter = 0;

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
      if(event.which == 13 && is_desktop && !event.shiftKey && (module.settings.messageInput.value.trim() || module.settings.upload.pending.length || module.settings.upload.pendingSaves.length)){
        event.preventDefault();

        module.triggerSend();
      }
    });

    // handling send button click
    module.settings.sendButton?.addEventListener('click', () => {
      if(module.settings.messageInput.value.trim() || module.settings.upload.pending.length || module.settings.upload.pendingSaves.length) {
        module.triggerSend();
      }
    });

    // scroll to bottom after a new image loads in the chat
    module.settings.messagesList?.addEventListener('load', (event) => {
      if(event.target.tagName === 'IMG'){
        scrollBottom('smooth');
      }
    }, true);

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
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
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

    // store record for uploaded file, and stage its media info to go out with the next sent message
    document.addEventListener('pos-upload-file-uploaded', event => {
      const fileId = event.detail.file.id;
      const metadata = {
        type: event.detail.file.type,
        name: event.detail.file.name,
        size: event.detail.file.size
      };

      // width/height are read from the image and set on file.meta by pos-upload.js's
      // 'file-added' handler before the upload finishes - only present for images
      if(event.detail.file.type && event.detail.file.type.startsWith('image/')){
        metadata.width = event.detail.file.meta.width;
        metadata.height = event.detail.file.meta.height;
      }

      // Saving the upload record (module.upload.save) is a round-trip - it's what gets us
      // the id and signed URL a Send needs (see receive.liquid/with_media, the upload's
      // ACL is private). Tracked in pendingSaves so triggerSend can wait for it instead of
      // sending before this attachment has actually landed in `pending`.
      const savePromise = module.upload.save({ conversationId: module.conversationId, uploadUrl: event.detail.url, metadata: metadata })
        .then(media => {
          if(!media){
            return;
          }

          // the file could have been removed from the uploader while its record was being saved
          if(!pos.modules.active['chat-upload']?.settings.uppy.getFile(fileId)){
            pos.modules.debug(module.settings.debug, module.settings.id, 'Skipped staging a file removed from the uploader before its record was saved', media);
            return;
          }

          module.settings.upload.pending.push({ fileId: fileId, media: media });

          pos.modules.debug(module.settings.debug, module.settings.id, 'Added file to pending uploads', media);
        })
        .finally(() => {
          const index = module.settings.upload.pendingSaves.indexOf(savePromise);
          if(index !== -1){
            module.settings.upload.pendingSaves.splice(index, 1);
          }
        });

      module.settings.upload.pendingSaves.push(savePromise);
    });

    // unstage a file removed from the uploader so it doesn't go out with the next sent message
    document.addEventListener('pos-upload-file-removed', event => {
      module.settings.upload.pending = module.settings.upload.pending.filter(item => item.fileId !== event.detail.file.id);

      pos.modules.debug(module.settings.debug, module.settings.id, 'Removed file from pending uploads', event.detail.file.id);
    });

    // clear all staged uploads
    module.settings.upload.clear?.addEventListener('change', () => {
      module.settings.upload.pending = [];
      pos.modules.active['chat-upload']?.settings.uppy.cancelAll();

      pos.modules.debug(module.settings.debug, module.settings.id, 'Cleared all pending uploads');
    });

    // keep the files list in sync with the files in the uploader
    ['pos-upload-file-added', 'pos-upload-file-removed', 'pos-upload-cancel-all'].forEach(eventName => {
      document.addEventListener(eventName, event => {
        if(event.detail.id === module.settings.upload.uploaderId){
          // the uploader can be initialized after the chat, so start listening to the progress once a file shows up
          module.upload.watchProgress();
          module.upload.renderList();
        }
      });
    });

    // let the user know when a file breaks the uploader's limits, as the dashboard
    // showing uppy's own error is hidden
    document.addEventListener('pos-upload-restriction-failed', event => {
      const uploader = pos.modules.active[module.settings.upload.uploaderId];

      if(event.detail.id !== module.settings.upload.uploaderId || !uploader){
        return;
      }

      // uppy checks the number of files before the file size
      if(uploader.settings.maxNumberOfFiles && uploader.settings.uppy.getFiles().length >= uploader.settings.maxNumberOfFiles){
        module.upload.showError('tooManyFiles', window.pos.translations.chat.tooManyFiles, event.detail.file?.name);
      } else if(event.detail.file?.size > uploader.settings.maxFileSize){
        module.upload.showError('fileTooLarge', window.pos.translations.chat.fileTooLarge, event.detail.file?.name);
      }
    });

    // remove the file from the uploader when clicking the remove button on the files list
    module.settings.upload.list?.addEventListener('click', event => {
      const button = event.target.closest('.pos-chat-uploader-list-item-remove');

      if(button){
        pos.modules.active[module.settings.upload.uploaderId]?.settings.uppy.removeFile(button.closest('li').dataset.fileId);
      }
    });

    // open the system file picker instead of showing the uploader's dashboard
    module.settings.upload.button?.addEventListener('click', () => {
      module.settings.upload.input?.click();
    });

    // add the picked files to the uploader
    module.settings.upload.input?.addEventListener('change', () => {
      module.upload.addFiles(Array.from(module.settings.upload.input.files));

      // reset so picking the same file again still fires 'change'
      module.settings.upload.input.value = '';
    });

    // drag & drop files anywhere on the page to add them to the uploader
    if(module.settings.upload.overlay){
      document.addEventListener('dragenter', module.upload.dragEnter);
      document.addEventListener('dragleave', module.upload.dragLeave);
      document.addEventListener('dragover', module.upload.dragOver);
      document.addEventListener('drop', module.upload.drop);
    }



    pos.modules.debug(module.settings.debug, module.settings.id, 'Chat initialized', module.settings.inbox);

  };



  // purpose:		escapes the html to a browser-safe string
  // arguments:	a html string to be escaped (string/html)
  // returns:		a browser-safe string
  // ------------------------------------------------------------------------
  function encodeHtml(string){
    const element = document.createElement('div');
    element.textContent = string;
    return element.innerHTML;
  };


  // purpose:		decides whether a message's timestamp should be shown, given the
  //				    timestamp of the message right before it in chronological order
  // arguments:	the current message's date (Date), the previous message's date (Date/null)
  // returns:		true if there is no previous message or the gap exceeds the threshold (bool)
  // ------------------------------------------------------------------------
  module.settings.shouldShowTime = (currentDate, previousDate) => {
    if(!previousDate){
      return true;
    }

    return (currentDate - previousDate) > module.settings.timeGroupThreshold;
  };


  // purpose:		reads the date of a rendered message from its time element
  // arguments:	the message's <li> (dom node/null)
  // returns:		the message's created_at as a Date, or null if unavailable
  // ------------------------------------------------------------------------
  module.settings.dateOf = (li) => {
    const time = li ? li.querySelector(module.settings.messageTemplate.dateSelector) : null;
    return (time && time.dateTime) ? new Date(time.dateTime) : null;
  };


  // purpose:		fills in a message's time element, hiding the text (but keeping
  //				    datetime, used for ordering/gap comparisons) when it shouldn't show
  // arguments:	the time element (dom node), the message's date (Date), whether to show it (bool)
  // ------------------------------------------------------------------------
  module.settings.setMessageTime = (timeEl, date, show) => {
    timeEl.dateTime = date.toISOString();
    timeEl.textContent = show ? module.settings.timezonedDate(date) : '';
  };


  // purpose:		formats a byte size the same way message.liquid does server-side
  //				    (KB below 1MB, MB at/above), for the file attachment size label
  // arguments:	the size in bytes (number)
  // returns:		the formatted size, e.g. '12.3 KB' / '1.4 MB' (string)
  // ------------------------------------------------------------------------
  module.settings.formatFileSize = (size) => {
    if(size >= 1048576){
      return `${(size / 1048576).toFixed(1)} MB`;
    }

    return `${(size / 1024).toFixed(1)} KB`;
  };


  // purpose:		builds a fully-populated message <li> (text + attachments) from message
  //				    data, shared by showMessage() (live receive) and loadPage() (pagination)
  //				    so both stay in sync instead of duplicating/diverging this logic
  // arguments:	the message data - message, media, status ('sent'/'received') (object)
  // returns:		the message's <li> element, detached from any list (dom node)
  // ------------------------------------------------------------------------
  module.settings.buildMessageElement = (messageData) => {
    const fragment = messageData.status === 'received' ? module.settings.messageTemplate.received.content.cloneNode(true) : module.settings.messageTemplate.sent.content.cloneNode(true);
    const li = fragment.querySelector('li');

    // the template always carries one image and one file placeholder (baked in via
    // as_template) - keep them as clone sources for real attachments below, then strip
    // them from the base <li> so a message without that kind of attachment doesn't show
    // a leftover blank placeholder
    const imageTemplate = li.querySelector(module.settings.messageTemplate.imageSelector);
    const fileTemplate = li.querySelector(module.settings.messageTemplate.fileSelector);
    imageTemplate?.remove();
    fileTemplate?.remove();

    // like the media placeholders, the template always carries the text div too (baked in
    // via as_template) - message.liquid only renders it server-side when there's actually
    // a message, so mirror that here rather than leaving an empty bubble for a media-only message
    let textEl = li.querySelector(module.settings.messageTemplate.messageSelector);
    if(messageData.message && messageData.message.trim().length){
      textEl.innerHTML = encodeHtml(messageData.message).replace(/(\r\n|\r|\n)/g, '<br>');
    } else {
      textEl.remove();
      textEl = null;
    }

    if(messageData.media && messageData.media.length){
      messageData.media.forEach(item => {
        let mediaElement;

        if(item.type && item.type.startsWith('image/')){
          mediaElement = imageTemplate.cloneNode(true);
          const img = mediaElement.querySelector('img');
          img.src = item.url;
          img.width = item.width;
          img.height = item.height;
        } else {
          mediaElement = fileTemplate.cloneNode(true);
          mediaElement.querySelector('a').href = item.url;
          mediaElement.querySelector('.pos-chat-message-file-name').textContent = item.name;
          mediaElement.querySelector('small').textContent = `(${module.settings.formatFileSize(item.size)})`;
        }

        // attachments render before the text bubble, same order as message.liquid, and
        // are inserted into the <li> itself (not appended to the fragment root) - falls
        // back to appending at the end when there's no text bubble to insert before
        if(textEl){
          li.insertBefore(mediaElement, textEl);
        } else {
          li.appendChild(mediaElement);
        }
      });
    }

    return li;
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

          // We're actively rendering this message on screen right now - tell the
          // server so it doesn't count as unread and trigger a push notification.
          // Skipped while the tab is hidden/backgrounded, since the message isn't
          // actually being seen in that case. Uses .send (-> the `receive` action,
          // the only one ActionCable dispatches to here), not .perform - a custom
          // action name would be silently dropped server-side.
          if(data.status === 'received' && document.visibilityState === 'visible'){
            module.channel.send({ mark_read: true });
          }

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


  // purpose:		waits for any attachments still being saved (see the
  //				    pos-upload-file-uploaded listener/pendingSaves) before actually
  //				    sending, so a Send that follows an attach too quickly doesn't go
  //				    out with an empty/incomplete media list
  // ------------------------------------------------------------------------
  module.triggerSend = async () => {
    if(module.settings.upload.pendingSaves.length){
      await Promise.allSettled(module.settings.upload.pendingSaves);
    }

    module.sendMessage(module.settings.messageInput.value.trim(), module.settings.upload.pending.map(item => item.media));
    setTimeout(() => {
      module.settings.messageInput.value = '';
    }, 100);

    module.settings.upload.clear.checked = false;
  };


  // purpose:		sends the message through the Action Cable
  // arguments:	the message to send (string)
  //            media items to attach - array of { type, name, size, url } (array, optional)
  // ------------------------------------------------------------------------
  module.sendMessage = (message, media = null) => {
    let messageData = {
      // stored as typed - escaping happens at render time (encodeHtml in buildMessageElement),
      // not here, so the raw text round-trips correctly through the server (raw_escape_string)
      // and the markdown filter used by the server-rendered message.liquid partial
      message: message,
      autor_id: module.settings.currentUserId,
      sender_name: module.settings.currentUserName,
      created_at: new Date()
    };

    if(media){
      messageData.media = media;
    }

    module.channel.send(Object.assign(messageData, { create: true }));

    // clear all pending uploads after sending the message
    module.settings.upload.pending = [];
    pos.modules.active['chat-upload']?.settings.uppy.cancelAll();

    pos.modules.debug(module.settings.debug, module.settings.id, 'Message sent', messageData);
  };


  // purpose:		appends a message to the chat box
  // arguments:	all the message data that needs to be shown
  //				    according to the template in messageTemplate (object)
  // ------------------------------------------------------------------------
  module.showMessage = (messageData) => {
    // build the message's <li> (text + attachments)
    const li = module.settings.buildMessageElement(messageData);

    // Insert in chronological order (by created_at) rather than by arrival order, so a
    // burst of messages renders correctly even if channel delivery arrives out of order.
    // Falls back to appending at the end (the common case: the newest message).
    const messageDate = new Date(messageData.created_at);
    let insertBeforeLi = null;
    for(const existingLi of module.settings.messagesList.querySelectorAll(':scope > li')){
      const liDate = module.settings.dateOf(existingLi);
      if(liDate && liDate > messageDate){
        insertBeforeLi = existingLi;
        break;
      }
    }

    // the timestamp is only shown when it's been more than 7 minutes since the message
    // that precedes this one chronologically (not necessarily the previous sibling in the DOM,
    // though in the common append-at-the-end case it is the same thing)
    const previousLi = insertBeforeLi ? insertBeforeLi.previousElementSibling : module.settings.messagesList.lastElementChild;
    const timeEl = li.querySelector(module.settings.messageTemplate.dateSelector);
    module.settings.setMessageTime(timeEl, messageDate, module.settings.shouldShowTime(messageDate, module.settings.dateOf(previousLi)));

    if(insertBeforeLi){
      module.settings.messagesList.insertBefore(li, insertBeforeLi);

      // this message now sits between the old previous message and insertBeforeLi, so
      // insertBeforeLi's own timestamp visibility (based on the gap to its predecessor) may
      // need to be rechecked - the gap to its new, closer predecessor can only have shrunk
      const nextTimeEl = insertBeforeLi.querySelector(module.settings.messageTemplate.dateSelector);
      const nextDate = module.settings.dateOf(insertBeforeLi);
      if(nextDate){
        module.settings.setMessageTime(nextTimeEl, nextDate, module.settings.shouldShowTime(nextDate, messageDate));
      }
    } else {
      // append the message to the chat
      module.settings.messagesList.append(li);
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
      // tracks the chronologically previous message within this (older) batch, oldest first -
      // the very first message of a batch has no known predecessor yet, so it always shows its time
      let previousDate = null;

      Object.entries(data.results).reverse().forEach(([key, messageData]) => {
        messageData = Object.assign(messageData, { status: (module.settings.currentUserId == messageData.autor_id) ? 'sent' : 'received'});

        // build the message's <li> (text + attachments) - shared with showMessage()
        const li = module.settings.buildMessageElement(messageData);
        const messageDate = new Date(messageData.created_at);
        module.settings.setMessageTime(li.querySelector(module.settings.messageTemplate.dateSelector), messageDate, module.settings.shouldShowTime(messageDate, previousDate));

        html.append(li);

        previousDate = messageDate;
      });

      // the message that used to be the oldest one visible now follows the newest message of
      // this freshly-loaded (older) batch instead of having no predecessor - recheck its timestamp
      const oldFirstLi = module.settings.messagesList.firstElementChild;
      const oldFirstDate = module.settings.dateOf(oldFirstLi);
      if(oldFirstDate && previousDate){
        module.settings.setMessageTime(oldFirstLi.querySelector(module.settings.messageTemplate.dateSelector), oldFirstDate, module.settings.shouldShowTime(oldFirstDate, previousDate));
      }

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
    document.querySelectorAll('.pos-chat-message time').forEach(time => {
      // the back-end already decided whether this timestamp should be visible (grouping
      // messages less than 7 minutes apart) - an empty one means it decided to hide it,
      // so leave it alone instead of reinstating it here
      if(!time.dateTime || !time.textContent.trim()){
        return;
      }

      let currentDate = new Date(time.dateTime);
      time.innerText = module.settings.timezonedDate(currentDate);
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
    fetch(`/search.frame?q=${encodeURIComponent(query)}`)
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
      // the input changed (or was cleared) while the request was in flight, a newer search owns the results
      if(module.settings.search.input.value.trim() !== query){
        pos.modules.debug(module.settings.debug, module.settings.id, 'Ignoring stale search results for', query);

        return;
      }

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



  // purpose:		handles file uploading
  // ------------------------------------------------------------------------
  module.upload = {};


  // purpose:		stores uploaded file record in the database in a separate table
  //            (modules/chat/uploads), and returns the attachment info to stage for
  //            the next sent message - including the freshly-signed, time-limited
  //            URL the server hands back (the upload's ACL is private, so a client
  //            can't just keep using the URL it uploaded to)
  // returns:		{ id, type, name, size, width, height, url } (object), or null on failure
  // ------------------------------------------------------------------------
  module.upload.save = async ({ conversationId, uploadUrl, metadata }) => {
    const response = await fetch(module.settings.upload.createUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.pos.csrfToken
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        upload: uploadUrl,
        metadata: metadata
      })
    });

    const data = await response.json();

    if(!response.ok){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Failed to save uploaded file record in the database', data);
      return null;
    }

    pos.modules.debug(module.settings.debug, module.settings.id, 'Successfully saved uploaded file record in the database', data);

    return {
      id: data.id,
      type: metadata.type,
      name: metadata.name,
      size: metadata.size,
      width: metadata.width,
      height: metadata.height,
      url: data.upload && data.upload.url
    };
  };


  // purpose:		builds a single item for the files list from the uppy file
  // arguments:	the file from the uppy uploader (object)
  // returns:		the file's <li> element, detached from any list (dom node)
  // ------------------------------------------------------------------------
  module.upload.buildListItem = (file) => {
    const li = module.settings.upload.listItemTemplate.content.cloneNode(true).querySelector('li');
    const img = li.querySelector('img');
    const icon = li.querySelector('.pos-chat-uploader-list-file-type');

    li.dataset.fileId = file.id;
    li.querySelector('.pos-chat-uploader-list-item-name').textContent = file.name;

    // the template carries both the image preview and the generic file icon, keep only the one that fits
    if(file.type && file.type.startsWith('image/') && file.data instanceof Blob){
      const previewUrl = URL.createObjectURL(file.data);
      module.settings.upload.previews.set(file.id, previewUrl);

      li.classList.add(module.settings.upload.listItemImageClass);
      img.src = previewUrl;
      img.alt = file.name;
      icon?.remove();
    } else {
      img.remove();
    }

    li.style.setProperty(module.settings.upload.progressProperty, file.progress?.percentage || 0);

    if(file.progress?.uploadComplete){
      li.classList.add(module.settings.upload.listItemUploadedClass);
    } else if(file.error){
      li.classList.add(module.settings.upload.listItemFailedClass);
    }

    return li;
  };


  // purpose:		listens to the uppy upload progress and shows it on the files list items,
  //				    only once per uppy instance
  // ------------------------------------------------------------------------
  module.upload.watchProgress = () => {
    const uppy = pos.modules.active[module.settings.upload.uploaderId]?.settings.uppy;

    if(!uppy || uppy === module.settings.upload.watchedUppy){
      return;
    }

    module.settings.upload.watchedUppy = uppy;

    uppy.on('upload-progress', (file, progress) => {
      if(file && progress?.bytesTotal){
        // a retried upload is no longer failed
        module.upload.getListItem(file.id)?.classList.remove(module.settings.upload.listItemFailedClass);
        module.upload.setProgress(file.id, Math.round(progress.bytesUploaded / progress.bytesTotal * 100));
      }
    });

    uppy.on('upload-success', file => {
      if(file){
        module.upload.setProgress(file.id, 100);
        module.upload.getListItem(file.id)?.classList.add(module.settings.upload.listItemUploadedClass);
      }
    });

    // the progress border goes all the way around in the error color, the content stays faded
    uppy.on('upload-error', file => {
      if(file){
        module.upload.setProgress(file.id, 100);
        module.upload.getListItem(file.id)?.classList.add(module.settings.upload.listItemFailedClass);
      }
    });

    // files uploaded together finish at different times, so the toast waits until the whole
    // batch is done to list all the failed ones at once
    uppy.on('complete', result => {
      result?.failed?.forEach(file => {
        module.upload.showError('uploadFailed', window.pos.translations.chat.uploadFailed, file.name);
      });
    });

    pos.modules.debug(module.settings.debug, module.settings.id, 'Listening to the upload progress', module.settings.upload.uploaderId);
  };


  // purpose:		shows an error toast about files that couldn't be added to the uploader,
  //				    one per kind of error for each pick or drop, listing the files' names -
  //				    picking or dropping several files fails for each of them separately,
  //				    but in the same tick, so they are collected and shown together after it
  // arguments:	kind of the error (string)
  //				    the message to show, followed by the files' names (string), or messages
  //				    for one and for more files with the names in place of {files} (object: { single, multiple })
  //				    name of the file that couldn't be added (string)
  // ------------------------------------------------------------------------
  module.upload.showError = (kind, message, fileName) => {
    const errors = module.settings.upload.errors;

    if(!errors.size){
      queueMicrotask(() => {
        errors.forEach(({ message, fileNames }) => {
          const names = fileNames.map(name => `<strong title="${encodeHtml(name).replaceAll('"', '&quot;')}">${encodeHtml(module.upload.shortenFileName(name))}</strong>`).join(', ');

          const text = (typeof message === 'string') ? message : (fileNames.length === 1) ? message.single : message.multiple;

          if(text.includes('{files}')){
            // a function as the replacement, so '$' in the file names isn't treated as a special pattern
            new window.pos.modules.toast('error', text.replace('{files}', () => names));
          } else {
            new window.pos.modules.toast('error', `${text}<br>${names}`);
          }
        });

        // the next pick or drop can show the same errors again
        errors.clear();
      });
    }

    if(!errors.has(kind)){
      errors.set(kind, { message: message, fileNames: [] });
    }

    errors.get(kind).fileNames.push(fileName);

    pos.modules.debug(module.settings.debug, module.settings.id, 'Could not add file to the uploader', { kind: kind, file: fileName });
  };


  // purpose:		shortens the file name to show in a message, cutting the name before the
  //				    extension with an ellipsis, so the extension stays visible
  // arguments:	the file name (string)
  // returns:		the file name, at most module.settings.upload.maxFileNameLength characters long (string)
  // ------------------------------------------------------------------------
  module.upload.shortenFileName = (name = '') => {
    // split into characters, not UTF-16 code units, so emoji and such aren't cut in half
    const characters = Array.from(name);
    const maxLength = module.settings.upload.maxFileNameLength;

    if(characters.length <= maxLength){
      return name;
    }

    // a dot at the very start marks a hidden file, not an extension
    const dotIndex = characters.lastIndexOf('.');
    const extension = (dotIndex > 0) ? characters.slice(dotIndex) : [];

    // keep at least one character of the name before the ellipsis, otherwise cut the whole thing at the end
    if(!extension.length || extension.length > maxLength - 2){
      return characters.slice(0, maxLength - 1).join('') + '…';
    }

    return characters.slice(0, maxLength - 1 - extension.length).join('') + '…' + extension.join('');
  };


  // purpose:		sets the upload progress on the files list item of the given file
  // arguments:	uppy file id (string)
  //				    progress in percents, 0-100 (int)
  // ------------------------------------------------------------------------
  module.upload.setProgress = (fileId, percentage) => {
    module.upload.getListItem(fileId)?.style.setProperty(module.settings.upload.progressProperty, percentage);
  };


  // purpose:		finds the files list item of the given file
  // arguments:	uppy file id (string)
  // returns:		the file's <li> element, or null when it's not on the list (dom node)
  // ------------------------------------------------------------------------
  module.upload.getListItem = (fileId) => {
    return module.settings.upload.list?.querySelector(`:scope > li[data-file-id="${CSS.escape(fileId)}"]`) || null;
  };


  // purpose:		syncs the files list with the files currently added to the uploader,
  //				    keeping the same order, reusing items that are already shown
  // ------------------------------------------------------------------------
  module.upload.renderList = () => {
    const list = module.settings.upload.list;
    const uppy = pos.modules.active[module.settings.upload.uploaderId]?.settings.uppy;

    if(!list || !module.settings.upload.listItemTemplate){
      return;
    }

    const files = uppy ? uppy.getFiles() : [];
    const fileIds = files.map(file => file.id);

    // remove the items for files that are no longer in the uploader
    list.querySelectorAll(':scope > li').forEach(li => {
      if(!fileIds.includes(li.dataset.fileId)){
        const previewUrl = module.settings.upload.previews.get(li.dataset.fileId);

        if(previewUrl){
          URL.revokeObjectURL(previewUrl);
          module.settings.upload.previews.delete(li.dataset.fileId);
        }

        li.remove();
      }
    });

    // add the missing items and keep them in the uploader's order
    files.forEach((file, index) => {
      const li = list.querySelector(`:scope > li[data-file-id="${CSS.escape(file.id)}"]`) || module.upload.buildListItem(file);

      if(list.children[index] !== li){
        list.insertBefore(li, list.children[index] || null);
      }
    });

    pos.modules.debug(module.settings.debug, module.settings.id, 'Synced the uploaded files list with the uploader', fileIds);
  };


  // purpose:		checks if the dragged content contains files (and not e.g. selected text or a link)
  // arguments:	drag event (event)
  // returns:		true if files are being dragged (bool)
  // ------------------------------------------------------------------------
  module.upload.isDraggingFiles = (event) => {
    return Boolean(event.dataTransfer?.types?.includes('Files'));
  };


  // purpose:		shows the drag & drop overlay
  // ------------------------------------------------------------------------
  module.upload.showOverlay = () => {
    module.settings.upload.overlay.hidden = false;
  };


  // purpose:		hides the drag & drop overlay
  // ------------------------------------------------------------------------
  module.upload.hideOverlay = () => {
    module.settings.upload.dragCounter = 0;
    module.settings.upload.overlay.hidden = true;
  };


  // purpose:		shows the overlay when files are dragged into the page
  // arguments:	dragenter event (event)
  // ------------------------------------------------------------------------
  module.upload.dragEnter = (event) => {
    if(!module.upload.isDraggingFiles(event)){
      return;
    }

    event.preventDefault();

    module.settings.upload.dragCounter++;
    module.upload.showOverlay();
  };


  // purpose:		hides the overlay when files are dragged out of the page
  //            (dragleave fires for every element left, hence the counter)
  // arguments:	dragleave event (event)
  // ------------------------------------------------------------------------
  module.upload.dragLeave = (event) => {
    if(!module.upload.isDraggingFiles(event)){
      return;
    }

    module.settings.upload.dragCounter--;

    if(module.settings.upload.dragCounter <= 0){
      module.upload.hideOverlay();
    }
  };


  // purpose:		allows dropping on the overlay and prevents the browser from opening
  //            the file when it's dropped anywhere else on the page
  // arguments:	dragover event (event)
  // ------------------------------------------------------------------------
  module.upload.dragOver = (event) => {
    if(!module.upload.isDraggingFiles(event)){
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = module.settings.upload.overlay.contains(event.target) ? 'copy' : 'none';
  };


  // purpose:		adds the files dropped on the overlay to the uploader
  // arguments:	drop event (event)
  // ------------------------------------------------------------------------
  module.upload.drop = (event) => {
    if(!module.upload.isDraggingFiles(event)){
      return;
    }

    event.preventDefault();
    module.upload.hideOverlay();

    if(!module.settings.upload.overlay.contains(event.target)){
      return;
    }

    module.upload.addFiles(Array.from(event.dataTransfer.files));
  };


  // purpose:		adds files to the uppy uploader (which uploads them right away)
  // arguments:	files to add (array of File)
  // ------------------------------------------------------------------------
  module.upload.addFiles = (files) => {
    const uppy = pos.modules.active[module.settings.upload.uploaderId]?.settings.uppy;

    if(!uppy){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Could not add files, the uploader is not initialized', module.settings.upload.uploaderId);
      return;
    }

    files.forEach(file => {
      // uppy throws when a file breaks the restrictions (size, type, number of files),
      // it also emits 'restriction-failed' and shows the error in the dashboard, so just skip the file
      try {
        uppy.addFile({
          source: module.settings.id,
          name: file.name,
          type: file.type,
          data: file
        });

        pos.modules.debug(module.settings.debug, module.settings.id, 'Added file to the uploader', file.name);
      } catch(error) {
        pos.modules.debug(module.settings.debug, module.settings.id, 'Could not add file to the uploader', { file: file.name, error: error });
      }
    });

    // let the user write a message to go with the files right away
    module.settings.messageInput?.focus();
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