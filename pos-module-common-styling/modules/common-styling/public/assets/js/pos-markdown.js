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
  // errors container (dom node)
  module.settings.errorsContainer = module.settings.container.querySelector('.pos-form-errors');
  // class name that hides error on the list (string)
  module.settings.errorDisabledClass = 'pos-markdown-error-disabled';
  
  // @mention object (object)
  module.mention = {};
  // @mention settings (object)
  module.settings.mention = {};
  // instance of the popover with @mentions (object)
  module.settings.mention.popover = pos.modules.active[`${module.settings.id}-mention-popover`];
  // list with @mention results (dom node)
  module.settings.mention.results = module.settings.container.querySelector(`#${module.settings.id}-mention-popover`);
  // url of the api to fetch mention results (string)
  module.settings.mention.url = module.settings.mention.popover?.settings.container.dataset.url || null;
  // active @mention state { query, line, atCh } or null
  module.settings.mention.state = null;
  // template for @mention result (dom node)
  module.settings.mention.template = module.settings.mention.popover?.settings.container.querySelector('template');
  // async function(query) => [{ id, name }] — function to fetch mention results, returns array of objects with id, name and avatar
  module.settings.mention.search = async function(query){ return fetch(module.settings.mention.url + '?query=' + encodeURIComponent(query)).then(response => response.json()).then(data => data.results) };

  // debug mode enabled (bool)
  module.settings.debug = typeof settings.debug === 'boolean' ? settings.debug : false;

  // easymde instance (object)
  module.settings.easyMde = null;




  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = () => {
    
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing rich text editor', module.settings.container);

    module.startEasyMde();

    // attach validation
    module.settings.textarea.form?.addEventListener('submit', event => {
      module.validate(event);
    });

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

    // purpose: sets up @mention detection and popup
    if(module.settings.mention.url){
      module.mention.start();
    }

    pos.modules.debug(module.settings.debug, module.settings.id, 'EasyMDE instance created', module.settings.easyMde);
  };


  // purpose:		uploads images in the editor
  // ------------------------------------------------------------------------
  module.uploadImage = async (file, onSuccess, onError) => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Uploading image', module.settings.container);

    const fields = new FormData();

    for(let attribute of module.settings.textarea.attributes){
      if(attribute.name.startsWith('data-request-')){
        fields.append(attribute.name.replace('data-request-', ''), attribute.value)
      }
    }
    fields.append('Content-Type', file.type);
    fields.append('file', file);

    fetch(module.settings.textarea.dataset.uploadUrl, {
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
      module.mention.reapplyMarks();

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


  // purpose:   validates the value
  // ------------------------------------------------------------------------
  module.validate = event => {
    let errors = 0;

    if((module.value()).length < module.settings.minlength){
      errors++;

      module.settings.container.querySelector(`[data-pos-markdown-error-minlength]`).classList.remove(module.settings.errorDisabledClass);

      pos.modules.debug(module.settings.debug, module.settings.id, 'Validating minimum length failed', { length: (module.value()).length, minlength: module.settings.minlength });
    }

    if((module.value()).length > module.settings.maxlength){
      errors++;

      module.settings.container.querySelector(`[data-pos-markdown-error-maxlength]`).classList.remove(module.settings.errorDisabledClass);

      pos.modules.debug(module.settings.debug, module.settings.id, 'Validating maximum length failed', { length: (module.value()).length, maxlength: module.settings.maxlength });
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


  // purpose:   sets up @mention detection and popup
  // ------------------------------------------------------------------------
  module.mention.start = () => {
    module.settings.easyMde.codemirror.on('change', async () => {
      const cursor = module.settings.easyMde.codemirror.getCursor();
      const textBefore = module.settings.easyMde.codemirror.getLine(cursor.line).slice(0, cursor.ch);
      const atIdx = textBefore.lastIndexOf('@');

      if(atIdx === -1){
        module.mention.hide();
        return;
      }

      const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : ' ';
      const query = textBefore.slice(atIdx + 1);

      if(!/\s/.test(charBefore) && atIdx > 0){
        module.mention.hide();
        return;
      }
      if(query.length < 1 || /\s/.test(query)){
        module.mention.hide();
        return;
      }

      module.settings.mention.state = { query, line: cursor.line, atCh: atIdx };
      const results = await module.settings.mention.search(query);
      module.mention.renderPopup(results);
    });

    document.addEventListener('click', e => {
      if(!module.settings.mention.results.contains(e.target)){
        module.mention.hide();
      }
    });

    module.settings.easyMde.codemirror.addKeyMap({
      'Esc': () => {
        if(!module.settings.mention.popover.settings.opened){
          return module.settings.easyMde.codemirror.constructor.Pass;
        }
      },
      'Up':  () => {
        if(!module.settings.mention.popover.settings.opened){
          return module.settings.easyMde.codemirror.constructor.Pass;
        }
      },
      'Down': () => {
        if(!module.settings.mention.popover.settings.opened){
          return module.settings.easyMde.codemirror.constructor.Pass;
        }
      },
      'Enter': () => {
        if(module.settings.mention.popover.settings.opened){
          if(module.settings.mention.menu.contains(document.activeElement)){
            document.activeElement.click();
          }
        } else {
          return module.settings.easyMde.codemirror.constructor.Pass;
        }
      }
    });

    // reposition popup when the page or the editor itself scrolls
    window.addEventListener('scroll', () => {
      if(module.settings.mention.popover?.settings.opened) module.mention.updatePopupPosition();
    }, { passive: true });

    module.settings.easyMde.codemirror.on('scroll', () => {
      if(module.settings.mention.popover?.settings.opened) module.mention.updatePopupPosition();
    });

    module.mention.reapplyMarks();
  };


  // purpose:   renders mention results in the popup, positioned at the cursor
  // ------------------------------------------------------------------------
  module.mention.renderPopup = (results) => {
    module.settings.mention.results.innerHTML = '';

    if(!results?.length){
      module.mention.hide();
      return;
    }

    results.forEach(person => {
      const template = module.settings.mention.template.content.cloneNode(true);

      if(person.avatar.photo){
        template.querySelector('img').src = person.avatar.photo.versions.sm;
        template.querySelector('.pos-markdown-mention-avatar-initials').remove();
      } else {
        template.querySelector('img').remove();
        const names = person.name.split(' ');
        template.querySelector('.pos-markdown-mention-avatar-initials').textContent = names[0][0] + names[1][0];
      }
      template.querySelector('.pos-markdown-mention-name').textContent = person.name;

      template.querySelector('button').addEventListener('click', e => {
        e.preventDefault();
        module.mention.insert(person);
      });

      module.settings.mention.results.appendChild(template);
    });

    module.mention.updatePopupPosition();

    module.settings.mention.popover.buildFocusableMenuItems();

    module.settings.mention.popover.open();
  };


  // purpose:   recalculates popup position anchored to the @ character (fixed to viewport)
  // ------------------------------------------------------------------------
  module.mention.updatePopupPosition = () => {
    if(!module.settings.mention.state){
      return;
    }
    const atPos = { line: module.settings.mention.state.line, ch: module.settings.mention.state.atCh };
    const coords = module.settings.easyMde.codemirror.charCoords(atPos, 'window');
    module.settings.mention.results.style.left = coords.left + 'px';
    module.settings.mention.results.style.top = (coords.bottom + 4) + 'px';
  };


  // purpose:   hides the mention popup and clears state
  // ------------------------------------------------------------------------
  module.mention.hide = () => {
    if(module.settings.mention.popover){
      module.settings.mention.popover.close();
    }
    module.settings.mention.state = null;
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
  };


  // purpose:   re-applies mention marks on existing content (init or programmatic value set)
  // ------------------------------------------------------------------------
  module.mention.reapplyMarks = () => {
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


  // purpose:   replaces the @query text with the selected mention
  // ------------------------------------------------------------------------
  module.mention.insert = (person) => {
    const cm = module.settings.easyMde.codemirror;
    const s = module.settings.mention.state;
    if (!s) return;
    const cursor = cm.getCursor();
    cm.replaceRange(
      `@[${person.name}](${person.id}) `,
      { line: s.line, ch: s.atCh },
      { line: cursor.line, ch: cursor.ch }
    );
    module.mention.applyMark(s.line, s.atCh, person.name, person.id);
    module.mention.hide();
    cm.focus();
  };



  module.init();

};