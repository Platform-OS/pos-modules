/*
  handles markdown editor

  usage:
    new pos.modules.markdown({ settings });
*/



window.pos.modules.markdown = function(settings){

  // cache 'this' value not to be overwritten later
  const module = this;


  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // uploader container (dom node)
  module.settings.container = settings.container;
  // textarea for the content (dom node)
  module.settings.textarea = settings.textarea || module.settings.container.querySelector('textarea');
  // unique id for the module (string)
  module.settings.id = module.settings.container.id || 'pos-markdown';
  // minimum number of characters allowed in the textarea (int)
  module.settings.minlength = parseInt(settings.minlength) || parseInt(module.settings.container.dataset.minlength) || 0;
  // maximum number of characters allowed in the textarea (int)
  module.settings.maxlength = parseInt(settings.maxlength) || parseInt(module.settings.container.dataset.maxlength) || 10000;
  // url returning a fresh presigned upload for each image, so each gets its own key - without it, the one
  // rendered on the textarea (data-upload-url, data-request-*) is used for every image (string)
  module.settings.presignUrl = settings.presignUrl || module.settings.textarea?.dataset.presignUrl || null;
  // errors container (dom node)
  module.settings.errorsContainer = module.settings.container.querySelector('.pos-form-errors');
  // class name that hides error on the list (string)
  module.settings.errorDisabledClass = 'pos-markdown-error-disabled';
  
  // purpose:   settings of an autocomplete (@mentions, #hashtags) that opens a popup with search results
  //            when its trigger character is typed, see module.autocomplete
  // arguments: name of the autocomplete, also used in the class of its container (string)
  //            character that opens the popup (string)
  //            settings passed to the module for this autocomplete, can override the container and search (object)
  // returns:   settings of the autocomplete (object)
  // ------------------------------------------------------------------------
  const autocompleteSettings = (name, trigger, options) => {
    const autocomplete = {};
    // character that opens the popup (string)
    autocomplete.trigger = trigger;
    // name used in debug messages, e.g. '@mention' (string)
    autocomplete.label = trigger + name;
    // container with the popup (dom node)
    autocomplete.container = options?.container || module.settings.container.querySelector(`.pos-markdown-${name}`);
    // list with results (dom node)
    autocomplete.results = autocomplete.container?.querySelector('[popover]') || null;
    // instance of the popover with results (object)
    autocomplete.popover = (autocomplete.results && pos.modules.active[autocomplete.results.id]) || null;
    // url of the api to fetch results, the query is appended to it (string)
    autocomplete.url = autocomplete.container?.dataset.url || null;
    // active state { query, line, ch } where ch is the position of the trigger character, or null
    autocomplete.state = null;
    // template for a result (dom node)
    autocomplete.template = autocomplete.container?.querySelector('template') || null;
    // controller used to abort the in-flight search request (AbortController)
    autocomplete.searchController = null;
    // async function(query, signal) => [results] — fetches the results
    autocomplete.search = options?.search || async function(query, signal){
      const response = await fetch(autocomplete.url + encodeURIComponent(query), { signal });
      if(!response.ok){
        throw new Error(`${autocomplete.label} search failed with status ${response.status}`);
      }
      const data = await response.json();
      return data.results;
    };

    return autocomplete;
  };

  // names of the autocompletes, each has its settings in module.settings[name] and its behavior in module[name] (array)
  module.settings.autocompletes = ['mention', 'hashtag'];
  // origin of the editor changes made by the autocompletes, so the change listener can tell them from typing (string)
  module.settings.autocompleteOrigin = 'pos-markdown-autocomplete';

  // @mention settings (object), search returns [{ id, name, avatar }]
  module.settings.mention = autocompleteSettings('mention', '@', settings.mention);

  // #hashtag settings (object), search returns [{ name }] or plain strings
  module.settings.hashtag = autocompleteSettings('hashtag', '#', settings.hashtag);
  // characters allowed in a hashtag, anything else ends it (regex)
  module.settings.hashtag.allowed = /^[\p{L}\p{N}_-]+$/u;

  // debug mode enabled (bool)
  module.settings.debug = typeof settings.debug === 'boolean' ? settings.debug : false;

  // easymde instance (object)
  module.settings.easyMde = null;
  // aborting it removes all the listeners attached outside of the editor (AbortController)
  module.settings.listeners = new AbortController();




  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = () => {
    
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing rich text editor', module.settings.container);

    // create the popovers of the enabled autocompletes (@mentions, #hashtags) if they don't exist yet
    module.settings.autocompletes.forEach(name => {
      const autocomplete = module.settings[name];

      if(autocomplete.results && !autocomplete.popover){
        if(typeof pos.modules.popover === 'function'){
          pos.modules.debug(module.settings.debug, module.settings.id, `No ${autocomplete.label}s popover instance detected, creating one`);

          autocomplete.popover = pos.modules.active[autocomplete.results.id] = new pos.modules.popover(autocomplete.container);
        } else {
          console.error(`[${module.settings.id}] pos-popover.js is not loaded, ${autocomplete.label}s are disabled`);
        }
      }
    });

    module.startEasyMde();

    // attach validation
    module.settings.textarea.form?.addEventListener('submit', event => {
      module.validate(event);
    }, { signal: module.settings.listeners.signal });

    // dispatch custom event
    module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-initialized', { bubbles: true, detail: { module, target: module.settings.container, id: module.settings.id } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-initialized', { module, target: module.settings.container, id: module.settings.id });

  };


  // purpose:		starts EasyMDE instance
  // ------------------------------------------------------------------------
  module.startEasyMde = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Starting EasyMDE', module.settings.textarea);

    module.settings.easyMde = new EasyMDE({
      element: module.settings.textarea,
      renderingConfig: {
        codeSyntaxHighlighting: true
      },
      showIcons: ['code', 'table', 'upload-image'],
      spellChecker: false,
      hideIcons: ['guide', 'image', 'fullscreen'],
      uploadImage: true,
      sideBySideFullscreen: false,
      status: false,
      imageUploadFunction: module.uploadImage,
      previewImagesInEditor: true,
      previewClass: ['pos-prose', 'editor-preview']
    });

    // purpose: escape releases the TAB trap so keyboard users can navigate out
    // pressing Esc sets a flag; the capture-phase listener on the wrapper intercepts the next tab before codemirror can call preventDefault, letting the browser move focus naturally; any other key cancels the released state
    module.settings.easyMde.codemirror.addKeyMap({
      'Esc': function(){
        pos.modules.debug(module.settings.debug, module.settings.id, 'Escape pressed, releasing tab trap', module.settings.easyMde);
        module.settings.easyMde.codemirror.state.tabTrapReleased = true;
      }
    });
    
    const cmWrapper = module.settings.easyMde.codemirror.getWrapperElement();

    cmWrapper.addEventListener('keydown', function(event){
      if(module.settings.easyMde.codemirror.state.tabTrapReleased){
        if(event.key === 'Tab'){
          pos.modules.debug(module.settings.debug, module.settings.id, 'Tab trap was released, navigating focus outside of the editor', module.settings.easyMde);
          module.settings.easyMde.codemirror.state.tabTrapReleased = false;
          event.stopPropagation(); // codemirror never sees it → never calls preventDefault → browser navigates
        } else if(event.key !== 'Escape'){
          pos.modules.debug(module.settings.debug, module.settings.id, 'Re-engaging tab trap as the user resumed editing', module.settings.easyMde);
          module.settings.easyMde.codemirror.state.tabTrapReleased = false; // user resumed editing, re-engage tab trap
        }
      }
    }, true); // capture phase — fires before codemirror's listener on the inner textarea

    // purpose: sets up @mention and #hashtag detection and popups
    module.autocomplete.start();

    pos.modules.debug(module.settings.debug, module.settings.id, 'EasyMDE instance created', module.settings.easyMde);
  };


  // purpose:		uploads images in the editor
  // ------------------------------------------------------------------------
  module.uploadImage = async (file, onSuccess, onError) => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Uploading image', module.settings.container);

    const fields = new FormData();
    let uploadUrl = module.settings.textarea.dataset.uploadUrl;

    if(module.settings.presignUrl){
      // a fresh presign for each image, so images with the same name don't overwrite each other
      try {
        const response = await fetch(module.settings.presignUrl, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
        if(!response.ok){
          throw new Error(`status ${response.status}`);
        }
        const presign = await response.json();
        if(!presign.upload_url || !presign.upload_url_payload){
          throw new Error('the response has no upload_url and upload_url_payload');
        }
        uploadUrl = presign.upload_url;
        for(const [name, value] of Object.entries(presign.upload_url_payload)){
          if(name.toLowerCase() !== 'content-type'){
            fields.append(name, value);
          }
        }
      } catch(error) {
        pos.modules.debug(module.settings.debug, module.settings.id, 'Could not get a presigned upload', error);
        new pos.modules.toast('error', 'Could not upload image, please refresh the page and try again');
        onError('Upload failed');
        return;
      }
    } else {
      for(let attribute of module.settings.textarea.attributes){
        if(attribute.name.startsWith('data-request-')){
          fields.append(attribute.name.replace('data-request-', ''), attribute.value)
        }
      }
    }
    fields.append('Content-Type', file.type);
    fields.append('file', file);

    fetch(uploadUrl, {
      method: 'POST',
      body: fields
    }).then(async response => {
      const xmlData = await response.text();

      if(response.status === 201 || response.status === 200){
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
        const fileUrl = xmlDoc.getElementsByTagName('Location')[0].textContent.indexOf('directory-uploads.uploads') ? xmlDoc.getElementsByTagName('Location')[0].textContent.replace('directory-uploads.uploads', 'files') : xmlDoc.getElementsByTagName('Location')[0].textContent; // fix for PS returning wrong file URL

        pos.modules.debug(module.settings.debug, module.settings.id, 'Image uploaded', fileUrl);
        // dispatch custom event
        module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-image-uploaded', { bubbles: true, detail: { target: module.settings.container, file: { url: fileUrl } } }));
        pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-image-uploaded', { target: module.settings.container, file: { url: fileUrl } });


        onSuccess(fileUrl);
      } else {
        pos.modules.debug(module.settings.debug, module.settings.id, 'Image upload failed', response);
        new pos.modules.toast('error', 'Could not upload image, please refresh the page and try again');
        onError('Upload failed');
      }
    });
  };

  // purpose:   focuses the text editor
  // ------------------------------------------------------------------------
  module.focus = () => {
    module.settings.easyMde.codemirror.focus();
    module.settings.easyMde.codemirror.setCursor(module.settings.easyMde.codemirror.lineCount(), 0);

    pos.modules.debug(module.settings.debug, module.settings.id, 'Markdown editor focused', module.settings.container);
  };


  // purpose:   resets editor state
  // ------------------------------------------------------------------------
  module.reset = () => {

    // clean value
    module.settings.easyMde.value('');

    // hide preview
    if(module.settings.easyMde.isPreviewActive()) {
      module.settings.easyMde.togglePreview();
    }

    // hide side-by-side preview
    if(module.settings.easyMde.isSideBySideActive()) {
      module.settings.easyMde.toggleSideBySide();
    }

    // clean errors
    module.settings.errorsContainer.querySelectorAll('li').forEach(li => li.classList.add(module.settings.errorDisabledClass));

    pos.modules.debug(module.settings.debug, module.settings.id, 'Cleaned the content of markdown editor', module.settings.container);
    // dispatch custom event
    module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-reset', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-reset', { target: module.settings.container, id: module.settings.id });
  
  };


  // purpose:   gets/sets the markdown content of the editor
  // arguments: new value to set to the editr (string)
  // returns:   current editor value
  // ------------------------------------------------------------------------
  module.value = (value) => {
    if(value){
      module.settings.easyMde.value(value);
      module.autocomplete.reapplyMarks();

      pos.modules.debug(module.settings.debug, module.settings.id, 'Changed editor content', value);
      // dispatch custom event
      module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-changed', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id, value: value } }));
      pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-changed', { target: module.settings.container, id: module.settings.id, value: value });
    }

    module.updateTextarea();

    return module.settings.easyMde.value();
  };


  // purpose:   updates the textarea with the markdown content
  // ------------------------------------------------------------------------
  module.updateTextarea = () => {
    module.settings.easyMde.codemirror.save();

    // dispatch custom event
    module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-textarea-updated', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id, textarea: module.settings.textarea, value: module.settings.textarea.value } }));
    pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-textarea-updated', { target: module.settings.container, id: module.settings.id, textarea: module.settings.textarea, value: module.settings.textarea.value });

  };


  // purpose:   when EasyMDE/CodeMirror instance is created on a hidden element,
  //            it needs to be refreshed after showing up
  // ------------------------------------------------------------------------
  module.refresh = () => {
    module.settings.easyMde.codemirror.refresh();
  };


  // purpose:   removes the listeners attached outside of the editor,
  //            use when removing the editor from the page without reloading it
  // ------------------------------------------------------------------------
  module.destroy = () => {
    module.autocomplete.hideAll();
    module.settings.listeners.abort();

    pos.modules.debug(module.settings.debug, module.settings.id, 'Markdown editor destroyed', module.settings.container);
  };


  // purpose:   validates the value
  // ------------------------------------------------------------------------
  module.validate = event => {
    let errors = 0;
    const length = module.value().length;

    if(length < module.settings.minlength){
      errors++;

      module.settings.container.querySelector(`[data-pos-markdown-error-minlength]`).classList.remove(module.settings.errorDisabledClass);

      pos.modules.debug(module.settings.debug, module.settings.id, 'Validating minimum length failed', { length, minlength: module.settings.minlength });
    }

    if(length > module.settings.maxlength){
      errors++;

      module.settings.container.querySelector(`[data-pos-markdown-error-maxlength]`).classList.remove(module.settings.errorDisabledClass);

      pos.modules.debug(module.settings.debug, module.settings.id, 'Validating maximum length failed', { length, maxlength: module.settings.maxlength });
    }

    if(errors){
      // dispatch custom event
      module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-validation-failed', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id, value: module.settings.textarea.value, errors: module.settings.errorsContainer } }));
      pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-validation-failed', { target: module.settings.container, id: module.settings.id, value: module.settings.textarea.value, errors: module.settings.errorsContainer });
    } else {
      // dispatch custom event
      module.settings.container.dispatchEvent(new CustomEvent('pos-markdown-validation-passed', { bubbles: true, detail: { target: module.settings.container, id: module.settings.id, value: module.settings.textarea.value } }));
      pos.modules.debug(module.settings.debug, 'event', 'pos-markdown-validation-passed', { target: module.settings.container, id: module.settings.id, value: module.settings.textarea.value });
    }

    if(errors){
      event.preventDefault();
      return false
    }
  };


  // purpose:   autocompletes (@mentions, #hashtags) open a popup with search results when their trigger
  //            character is typed, this is the part they share; what differs is defined in module[name]:
  //              isValidQuery(query)         whether the text typed after the trigger is a query (bool)
  //              prepare(results)            optional, normalizes and filters the search results (array)
  //              renderResult(item, result)  fills the cloned template with a result
  //              text(result)                text that replaces the trigger and the query (string)
  //              mark(line, ch, result)      marks the inserted text, ch is the position of the trigger
  //              cleanupIfEditingMark()      runs on each typed change, undoes the marks the change edited
  //              reapplyMarks()              marks the existing content
  //              markWhenDisabled            whether the content is marked even without the search (bool)
  // ------------------------------------------------------------------------
  module.autocomplete = {};


  // purpose:   lists the autocompletes that have a search url and a popover
  // returns:   names of the enabled autocompletes (array)
  // ------------------------------------------------------------------------
  module.autocomplete.enabled = () => {
    return module.settings.autocompletes.filter(name => module.settings[name].url && module.settings[name].popover);
  };


  // purpose:   finds the autocomplete with its popup opened
  // returns:   name of the autocomplete (string) or null
  // ------------------------------------------------------------------------
  module.autocomplete.opened = () => {
    return module.settings.autocompletes.find(name => module.settings[name].popover?.settings.opened) || null;
  };


  // purpose:   sets up the detection and the popups of the enabled autocompletes
  // ------------------------------------------------------------------------
  module.autocomplete.start = () => {
    const enabled = module.autocomplete.enabled();
    const cm = module.settings.easyMde.codemirror;

    if(!enabled.length){
      return;
    }

    cm.on('change', (cm, change) => {
      // the autocompletes' own changes (an inserted result, a cleaned up mark) are not typing - when a result
      // is picked with Enter, this runs after the insert has marked it, so it would undo the fresh mark
      if(change.origin === module.settings.autocompleteOrigin){
        return;
      }

      enabled.forEach(name => module[name].cleanupIfEditingMark());

      const cursor = cm.getCursor();
      const textBefore = cm.getLine(cursor.line).slice(0, cursor.ch);

      // at most one of them finds a query: a trigger has to start a word and a query can't contain whitespace
      enabled.forEach(name => module.autocomplete.detect(name, textBefore, cursor));
    });

    document.addEventListener('click', e => {
      enabled.forEach(name => {
        if(!module.settings[name].results.contains(e.target)){
          module.autocomplete.hide(name);
        }
      });
    }, { signal: module.settings.listeners.signal });

    cm.addKeyMap({
      'Esc': () => {
        const name = module.autocomplete.opened();

        if(!name){
          return cm.constructor.Pass;
        }

        module.autocomplete.hide(name);
      },
      'Up': () => {
        if(!module.autocomplete.opened()){
          return cm.constructor.Pass;
        }
      },
      'Down': () => {
        if(!module.autocomplete.opened()){
          return cm.constructor.Pass;
        }
      },
      'Enter': () => {
        const name = module.autocomplete.opened();

        if(!name){
          return cm.constructor.Pass;
        }

        // the editor still has focus (arrow keys move focus into the menu, where the button handles Enter itself),
        // so pick the first result
        module.settings[name].popover.settings.focusable[0]?.click();
      }
    });

    // the popup is positioned in document coordinates (see updatePopupPosition), so it scrolls
    // along with the page natively — no listener needed for window/page scrolling. What still
    // needs a manual reposition is the editor's own internal scroll (typing pushes lines up
    // inside CodeMirror's viewport without the page itself scrolling)...
    cm.on('scroll', () => {
      const name = module.autocomplete.opened();
      if(name) module.autocomplete.updatePopupPosition(name);
    });

    // ...and the on-screen keyboard showing/hiding, which can reflow the editor (e.g. line
    // wrapping changes) even though the page didn't scroll.
    window.visualViewport?.addEventListener('resize', () => {
      const name = module.autocomplete.opened();
      if(name) module.autocomplete.updatePopupPosition(name);
    }, { passive: true, signal: module.settings.listeners.signal });

    module.autocomplete.reapplyMarks(enabled);

    pos.modules.debug(module.settings.debug, module.settings.id, 'Activated autocompletes', enabled);
  };


  // purpose:   opens the autocomplete's popup when the text before the cursor ends with its trigger and a query,
  //            searching after a pause in typing, otherwise hides it
  // arguments: name of the autocomplete (string)
  //            text of the line before the cursor (string)
  //            cursor position (object)
  // ------------------------------------------------------------------------
  module.autocomplete.detect = (name, textBefore, cursor) => {
    const autocomplete = module.settings[name];
    const triggerIdx = textBefore.lastIndexOf(autocomplete.trigger);

    if(triggerIdx === -1){
      module.autocomplete.hide(name);
      return;
    }

    const charBefore = triggerIdx > 0 ? textBefore[triggerIdx - 1] : ' ';
    const query = textBefore.slice(triggerIdx + 1);

    // the trigger has to start a word, so emails, 'C#' or 'page#anchor' don't open the popup
    if(!/\s/.test(charBefore)){
      module.autocomplete.hide(name);
      return;
    }
    if(query.length < 1 || !module[name].isValidQuery(query)){
      module.autocomplete.hide(name);
      return;
    }

    autocomplete.state = { query, line: cursor.line, ch: triggerIdx };
    module.autocomplete.cancelSearch(name);
    autocomplete.searchTimeout = setTimeout(async () => {
      const controller = autocomplete.searchController = new AbortController();

      try {
        const results = await autocomplete.search(query, controller.signal);

        // drop responses for a query that is no longer being typed (user moved on or closed the popup)
        if(controller.signal.aborted || autocomplete.state?.query !== query){
          return;
        }

        module.autocomplete.renderPopup(name, results);
      } catch(error) {
        if(error.name === 'AbortError'){
          return;
        }

        pos.modules.debug(module.settings.debug, module.settings.id, `Searching for ${autocomplete.label}s failed`, error);
        module.autocomplete.hide(name);
      }
    }, 300);
  };


  // purpose:   renders the results in the autocomplete's popup, positioned at the trigger
  // arguments: name of the autocomplete (string)
  //            search results (array)
  // ------------------------------------------------------------------------
  module.autocomplete.renderPopup = (name, results) => {
    const autocomplete = module.settings[name];

    pos.modules.debug(module.settings.debug, module.settings.id, `Rendering ${autocomplete.label} results in the popover`, results);

    autocomplete.results.innerHTML = '';

    results = results || [];
    if(module[name].prepare){
      results = module[name].prepare(results);
    }

    if(!results.length){
      module.autocomplete.hide(name);
      return;
    }

    results.forEach(result => {
      const item = autocomplete.template.content.cloneNode(true);

      module[name].renderResult(item, result);

      item.querySelector('button').addEventListener('click', e => {
        e.preventDefault();
        module.autocomplete.insert(name, result);
      });

      autocomplete.results.appendChild(item);
    });

    module.autocomplete.updatePopupPosition(name);

    autocomplete.popover.buildFocusableMenuItems();

    autocomplete.popover.open();
  };


  // purpose:   recalculates the popup position anchored to the trigger character (document-relative,
  //            since the popup is `position: absolute` — see pos-markdown.css)
  // arguments: name of the autocomplete (string)
  // ------------------------------------------------------------------------
  module.autocomplete.updatePopupPosition = (name) => {
    const autocomplete = module.settings[name];

    if(!autocomplete.state){
      return;
    }

    pos.modules.debug(module.settings.debug, module.settings.id, `Updating ${autocomplete.label} popover position`, autocomplete.state);

    const triggerPos = { line: autocomplete.state.line, ch: autocomplete.state.ch };
    // 'page' mode bakes the document scroll offset into the coordinates, matching a
    // `position: absolute` element — the browser then keeps it aligned with the caret on
    // scroll natively, instead of us recomputing viewport-relative ('window' mode) coordinates
    // on every scroll frame, which is what broke on mobile Safari with the keyboard open.
    const coords = module.settings.easyMde.codemirror.charCoords(triggerPos, 'page');

    autocomplete.results.style.left = coords.left + 'px';
    autocomplete.results.style.top = (coords.bottom + 4) + 'px';
  };


  // purpose:   hides the autocomplete's popup and clears its state
  // arguments: name of the autocomplete (string)
  // ------------------------------------------------------------------------
  module.autocomplete.hide = (name) => {
    const autocomplete = module.settings[name];

    module.autocomplete.cancelSearch(name);

    if(autocomplete.popover && autocomplete.popover.settings.opened){
      autocomplete.popover.close();
    }
    autocomplete.state = null;
  };


  // purpose:   hides the popups of all the autocompletes
  // ------------------------------------------------------------------------
  module.autocomplete.hideAll = () => {
    module.settings.autocompletes.forEach(name => module.autocomplete.hide(name));
  };


  // purpose:   cancels the autocomplete's scheduled and in-flight search
  // arguments: name of the autocomplete (string)
  // ------------------------------------------------------------------------
  module.autocomplete.cancelSearch = (name) => {
    const autocomplete = module.settings[name];

    clearTimeout(autocomplete.searchTimeout);
    autocomplete.searchController?.abort();
    autocomplete.searchController = null;
  };


  // purpose:   replaces the trigger and the query with the picked result
  // arguments: name of the autocomplete (string)
  //            picked result (object)
  // ------------------------------------------------------------------------
  module.autocomplete.insert = (name, result) => {
    const autocomplete = module.settings[name];

    pos.modules.debug(module.settings.debug, module.settings.id, `Inserting ${autocomplete.label} to the editor`, result);

    const cm = module.settings.easyMde.codemirror;
    const s = autocomplete.state;
    if (!s) return;
    const cursor = cm.getCursor();
    cm.replaceRange(
      module[name].text(result),
      { line: s.line, ch: s.ch },
      { line: cursor.line, ch: cursor.ch },
      module.settings.autocompleteOrigin
    );
    module[name].mark(s.line, s.ch, result);
    module.autocomplete.hide(name);
    cm.focus();
  };


  // purpose:   marks the existing content (init or programmatic value set)
  // arguments: names of the autocompletes, by default the enabled ones and the ones marking without the search (array)
  // ------------------------------------------------------------------------
  module.autocomplete.reapplyMarks = (names) => {
    const enabled = module.autocomplete.enabled();

    names = names || module.settings.autocompletes.filter(name => enabled.includes(name) || module[name].markWhenDisabled);
    names.forEach(name => module[name].reapplyMarks());
  };



  // purpose:   @mentions, inserted as @[Name](id) with "[" and "](id)" hidden in the editor
  // ------------------------------------------------------------------------
  module.mention = {};

  // @[Name](id) can't be mistaken for anything else, so it's shown as @Name even without the search
  module.mention.markWhenDisabled = true;


  // purpose:   a mention query is anything up to a whitespace
  // ------------------------------------------------------------------------
  module.mention.isValidQuery = (query) => {
    return !/\s/.test(query);
  };


  // purpose:   fills the result template with the person's avatar (or initials) and name
  // ------------------------------------------------------------------------
  module.mention.renderResult = (item, person) => {
    if(person.avatar){
      item.querySelector('img').src = person.avatar.photo.versions.sm;
      item.querySelector('.pos-markdown-mention-avatar-initials').remove();
    } else {
      item.querySelector('img').remove();
      const initials = (person.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(name => name[0]).join('');
      item.querySelector('.pos-markdown-mention-avatar-initials').textContent = initials.toUpperCase();
    }
    item.querySelector('.pos-markdown-mention-name').textContent = person.name;
  };


  // purpose:   markdown of the picked person
  // ------------------------------------------------------------------------
  module.mention.text = (person) => {
    return `@[${person.name}](${person.id}) `;
  };


  // purpose:   marks the inserted mention
  // ------------------------------------------------------------------------
  module.mention.mark = (line, ch, person) => {
    module.mention.applyMark(line, ch, person.name, person.id);
  };


  // purpose:   when a change lands inside an existing mention mark, strips @[name](id) to plain @name
  //            so backspacing or typing within the visible "@name" doesn't leave hidden markdown syntax
  // ------------------------------------------------------------------------
  module.mention.cleanupIfEditingMark = () => {
    const cm = module.settings.easyMde.codemirror;
    const cursor = cm.getCursor();

    // findMarksAt uses exclusive right boundary, so also check one char left to catch right-edge deletions
    const positions = [cursor];
    if (cursor.ch > 0) positions.push({ line: cursor.line, ch: cursor.ch - 1 });

    let mentionMark = null;
    for (const pos of positions) {
      mentionMark = cm.findMarksAt(pos).find(m => m.className === 'pos-markdown-mention-mark');
      if (mentionMark) break;
    }
    if (!mentionMark) return;

    const range = mentionMark.find();
    if (!range) return;

    const underlyingText = cm.getRange(range.from, range.to);
    if (!underlyingText.startsWith('@')) return;

    // extract the visible name from @[Name (collapse removes [, but it's still in underlying text)
    const displayName = underlyingText.startsWith('@[') ? underlyingText.slice(2) : underlyingText.slice(1);

    // find and clear the closing ](id) collapsed mark (starts exactly where the styling mark ends)
    let endPos = range.to;
    const allMarks = cm.getAllMarks();
    for (const m of allMarks) {
      if (m === mentionMark || m.className) continue;
      const mRange = m.find();
      if (!mRange || !m.collapsed) continue;
      if (mRange.from.line === range.to.line && mRange.from.ch === range.to.ch) {
        endPos = mRange.to;
        m.clear();
        break;
      }
    }

    // find and clear the opening [ collapsed mark (one char after the @ )
    for (const m of cm.getAllMarks()) {
      if (m === mentionMark || m.className) continue;
      const mRange = m.find();
      if (!mRange || !m.collapsed) continue;
      if (mRange.from.line === range.from.line && mRange.from.ch === range.from.ch + 1) {
        m.clear();
        break;
      }
    }

    mentionMark.clear();

    // replace @[name](id) with plain @name; the origin keeps the change listener from handling this change
    const origCh = cursor.ch;
    cm.replaceRange('@' + displayName, range.from, endPos, module.settings.autocompleteOrigin);

    // restore cursor: removing the hidden '[' shifts positions after it back by one
    const newCh = origCh > range.from.ch + 1 ? origCh - 1 : origCh;
    cm.setCursor({ line: range.from.line, ch: newCh });
  };


  // purpose:   collapses "[" and "](id)" in a single mention so only "@Name" is visible
  // ------------------------------------------------------------------------
  module.mention.applyMark = (line, atCh, name, id) => {
    const cm = module.settings.easyMde.codemirror;
    // @[Name](id) — collapse "[" (1 char) so "@Name" is visible
    cm.markText(
      { line, ch: atCh + 1 },
      { line, ch: atCh + 2 },
      { collapsed: true, atomic: true }
    );
    // collapse "](id)" (id.length + 3 chars) so nothing after the name is visible
    cm.markText(
      { line, ch: atCh + 2 + name.length },
      { line, ch: atCh + 2 + name.length + id.length + 3 },
      { collapsed: true, atomic: true }
    );
    // style the visible "@Name" span
    cm.markText(
      { line, ch: atCh },
      { line, ch: atCh + 2 + name.length },
      { className: 'pos-markdown-mention-mark' }
    );
  };


  // purpose:   re-applies mention marks on existing content
  // ------------------------------------------------------------------------
  module.mention.reapplyMarks = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Re-applying @mention marks', module.settings.mention);

    const cm = module.settings.easyMde.codemirror;
    const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    for (let line = 0; line < cm.lineCount(); line++) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(cm.getLine(line))) !== null) {
        module.mention.applyMark(line, match.index, match[1], match[2]);
      }
    }
  };



  // purpose:   #hashtags, inserted as plain #name text
  // ------------------------------------------------------------------------
  module.hashtag = {};

  // a plain #word is only a hashtag when hashtags are enabled
  module.hashtag.markWhenDisabled = false;


  // purpose:   a hashtag query is made of the allowed characters only
  // ------------------------------------------------------------------------
  module.hashtag.isValidQuery = (query) => {
    return module.settings.hashtag.allowed.test(query);
  };


  // purpose:   normalizes a search result to the hashtag name without the leading '#'
  // arguments: result from the search, an object with name or a string
  // returns:   hashtag name (string)
  // ------------------------------------------------------------------------
  module.hashtag.name = (result) => {
    return String(typeof result === 'string' ? result : result?.name || '').trim().replace(/^#+/, '');
  };


  // purpose:   turns the search results into hashtag names, leaving out the ones that can't be typed as a
  //            hashtag, as they wouldn't be recognized as one later
  // ------------------------------------------------------------------------
  module.hashtag.prepare = (results) => {
    return results.map(module.hashtag.name).filter(name => module.settings.hashtag.allowed.test(name));
  };


  // purpose:   fills the result template with the hashtag name
  // ------------------------------------------------------------------------
  module.hashtag.renderResult = (item, name) => {
    item.querySelector('.pos-markdown-hashtag-name').textContent = name;
  };


  // purpose:   text of the picked hashtag
  // ------------------------------------------------------------------------
  module.hashtag.text = (name) => {
    return `#${name} `;
  };


  // purpose:   marks the inserted hashtag
  // ------------------------------------------------------------------------
  module.hashtag.mark = (line, ch, name) => {
    module.hashtag.applyMark(line, ch, name);
  };


  // purpose:   when a change touches an existing hashtag mark, removes the styling unless the text is still
  //            the same hashtag standing on its own - the hashtag is plain '#name' text, so there is no
  //            hidden markdown to strip, and typing on re-opens the popup for the edited name
  // ------------------------------------------------------------------------
  module.hashtag.cleanupIfEditingMark = () => {
    const cm = module.settings.easyMde.codemirror;
    const cursor = cm.getCursor();

    // also check one char left to catch right-edge deletions
    const positions = [cursor];
    if (cursor.ch > 0) positions.push({ line: cursor.line, ch: cursor.ch - 1 });

    for (const pos of positions) {
      for (const hashtagMark of cm.findMarksAt(pos).filter(m => m.className === 'pos-markdown-hashtag-mark')) {
        const range = hashtagMark.find();
        if (!range) continue;

        const line = cm.getLine(range.from.line);
        const charBefore = range.from.ch > 0 ? line[range.from.ch - 1] : ' ';
        const charAfter = line[range.to.ch] || ' ';
        const unchanged = cm.getRange(range.from, range.to) === '#' + hashtagMark.hashtagName;

        if (!unchanged || !/\s/.test(charBefore) || module.settings.hashtag.allowed.test(charAfter)) {
          hashtagMark.clear();
        }
      }
    }
  };


  // purpose:   styles a single '#name' hashtag
  // ------------------------------------------------------------------------
  module.hashtag.applyMark = (line, hashCh, name) => {
    const hashtagMark = module.settings.easyMde.codemirror.markText(
      { line, ch: hashCh },
      { line, ch: hashCh + 1 + name.length },
      { className: 'pos-markdown-hashtag-mark' }
    );
    // to tell later whether the marked text was edited
    hashtagMark.hashtagName = name;
  };


  // purpose:   re-applies hashtag marks on existing content
  // ------------------------------------------------------------------------
  module.hashtag.reapplyMarks = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Re-applying #hashtag marks', module.settings.hashtag);

    const cm = module.settings.easyMde.codemirror;
    // a '#' starting a word, followed by allowed characters (so not '# heading', '##heading' or 'page#anchor')
    const regex = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
    for (let line = 0; line < cm.lineCount(); line++) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(cm.getLine(line))) !== null) {
        module.hashtag.applyMark(line, match.index + match[1].length, match[2]);
      }
    }
  };



  // purpose:   shortcuts to the shared functions for each autocomplete, e.g. module.mention.hide()
  // ------------------------------------------------------------------------
  module.settings.autocompletes.forEach(name => {
    module[name].renderPopup = results => module.autocomplete.renderPopup(name, results);
    module[name].updatePopupPosition = () => module.autocomplete.updatePopupPosition(name);
    module[name].hide = () => module.autocomplete.hide(name);
    module[name].cancelSearch = () => module.autocomplete.cancelSearch(name);
    module[name].insert = result => module.autocomplete.insert(name, result);
  });



  module.init();

};