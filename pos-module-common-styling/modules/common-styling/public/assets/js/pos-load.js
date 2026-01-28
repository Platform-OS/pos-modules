/*
  automatically loads content from endpoint
  and places in in the container when the trigger is clicked

  usage: new load({
    trigger: [dom node],
    endpoint: [string].
    target: [string]
  });
*/



export function load(userSettings = {}){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // module id (string)
  module.settings.id = userSettings?.id || `load-${userSettings.target}`;
  // element that triggers the loading (dom node)
  module.settings.trigger = userSettings?.trigger || null;
  // url of the page to load (string)
  module.settings.endpoint = userSettings.endpoint;
  // selector for the container to load the content into (string)
  module.settings.target = userSettings.target;
  // do you want to replace or append the content (string)
  module.settings.method = userSettings.method || 'replace';
  // trigger to run the loading process (string)
  module.settings.triggerType = userSettings.triggerType || 'click';
  // if you want to enable debug mode that logs to console (bool)
  module.settings.debug = userSettings.debug || false;


  // purpose:		initializes the module
  // ------------------------------------------------------------------------
  module.init = async function(){
    module.settings.trigger.addEventListener(module.settings.triggerType, module.load);
    module.settings.trigger.addEventListener('focus', module.load);
  };


  // purpose:		fetch the data and load it into the container
  // output:    updates the container content
  // ------------------------------------------------------------------------
  module.load = async function(){
    pos.modules.debug(module.settings.debug, module.settings.id, 'Loading frame', module.settings);

    fetch(module.settings.endpoint, {
      method: 'GET'
    })
      .then(response => response.text())
      .then(html => {
        pos.modules.debug(module.settings.debug, module.settings.id, 'Frame loaded successfully', module.settings);

        if(module.settings.method === 'replace'){
          document.querySelector(module.settings.target).innerHTML = html;
          pos.modules.debug(module.settings.debug, module.settings.id, 'Replaced the container content with fetched data', module.settings);
        }

        document.dispatchEvent(new CustomEvent('pos-frame-loaded', { bubbles: true, detail: { target: module.settings.target, content: html } }));
        pos.modules.debug(module.settings.debug, 'event', `pos-frame-loaded`, { target: module.settings.target, content: html });
      });
  };


  // purpose:		removed event listeners and cleans up the module
  // ------------------------------------------------------------------------
  module.destroy = function(){
    module.settings.trigger.removeEventListener('click', module.load);
    module.settings.trigger.removeEventListener('focus', module.load);
    pos.modules.debug(module.settings.debug, module.settings.id, 'Destroyed module', module.settings);
    module.settings = {};
  };



  module.init();

};