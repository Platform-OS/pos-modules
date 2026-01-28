/*
  handles popups behavior
*/



// purpose:		close the popup menu when clicked outside it
// ************************************************************************
const popup = function(options){

  // cache 'this' value not to be overwritten later
  const module = this;

  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // toggle element that opens the popup (dom node)
  module.settings.toggle = options.toggle;
  // corresponding popup content (dom node)
  module.settings.popup = module.settings.toggle.nextElementSibling;
  // selector for the popup checkbox toggle (string)
  module.settings.toggleSelector = '.app-chat-popupToggle';


  // purpose:		each time the popup opens, make sure every other popup is closed
  // arguments: currently opened popup that won't be closed (dom node)
  // ------------------------------------------------------------------------
  module.closeOthers = (current) => {
    document.querySelectorAll(module.settings.toggleSelector).forEach(element => {
      if(element !== current){
        element.checked = false;
      }
    })
  };


  // purpose:		close opened popup when clicked outside it
  // ------------------------------------------------------------------------
  module.closeIfClickedOutside = () => {
    const handleClick = event => {
      const path = event.composedPath();

      if(!path.includes(module.settings.popup) && !path.includes(module.settings.toggle) && !event.target.matches(`[for="${module.settings.toggle.id}"]`)){
        module.settings.toggle.checked = false;
        document.removeEventListener('click', handleClick);
      }
    }

    document.addEventListener('click', handleClick);
  };


  // purpose:		initializes the module
  // ------------------------------------------------------------------------
  module.init = () => {
    module.settings.toggle.addEventListener('change', () => {
      if(module.settings.toggle.checked){
        module.closeIfClickedOutside();
      }
    });
  };


  module.init();

};



// purpose:		create a new instance for each popup on the page and store it in the application namespace
// ************************************************************************
application.module.popup = {};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-chat-popupToggle').forEach((element, i) => {
    application.module.popup[element.id || `popup-${i}`] = new popup({ toggle: element });
  });
});