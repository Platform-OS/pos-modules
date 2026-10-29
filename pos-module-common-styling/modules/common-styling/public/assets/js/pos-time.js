/*
  formats dates in <time> elements in the visitor's timezone and language
*/


window.pos.modules.time = function(userSettings = {}){

  // cache 'this' value not to be overwritten later
  const module = this;


  // purpose:		returns the locale if Intl supports it, undefined (the browser's language) otherwise
  // arguments: locale (string)
  // ------------------------------------------------------------------------
  const supportedLocale = locale => {
    try {
      return Intl.DateTimeFormat.supportedLocalesOf(locale).length ? locale : undefined;
    } catch {
      return undefined;
    }
  };


  // purpose:		settings that are being used across the module
  // ------------------------------------------------------------------------
  module.settings = {};
  // container in which the dates are formatted and watched for new ones (dom node)
  module.settings.container = userSettings.container || document.body;
  // id used to mark the module (string)
  module.settings.id = userSettings.id || 'pos-time';
  // selector for the elements to format (string)
  module.settings.selector = userSettings.selector || 'time.pos-time';
  // language of the formatted dates, defaults to the page's language (string)
  module.settings.locale = supportedLocale(userSettings.locale || document.documentElement.lang);
  // timezone of the formatted dates, defaults to the visitor's one (string)
  module.settings.timeZone = userSettings.timeZone;
  // Intl.DateTimeFormat styles of a full date, overwritten by data-date-style and data-time-style (string)
  module.settings.dateStyle = userSettings.dateStyle || 'medium';
  module.settings.timeStyle = userSettings.timeStyle || 'short';
  // how often the relative dates are refreshed, in milliseconds, 0 to never refresh (int)
  module.settings.refreshInterval = userSettings.refreshInterval ?? 30000;
  // to enable debug mode (bool)
  module.settings.debug = (userSettings?.debug) ? userSettings.debug : false;
  // relative date formatters - 'auto' only for "now", as it turns "1 day ago" into "yesterday" (Intl.RelativeTimeFormat)
  module.settings.relativeFormatter = new Intl.RelativeTimeFormat(module.settings.locale, { numeric: 'always' });
  module.settings.nowFormatter = new Intl.RelativeTimeFormat(module.settings.locale, { numeric: 'auto' });
  // full date formatters, one for each style used (Intl.DateTimeFormat)
  module.settings.fullFormatters = {};



  // purpose:		initializes the component
  // ------------------------------------------------------------------------
  module.init = () => {
    pos.modules.debug(module.settings.debug, module.settings.id, 'Initializing time formatting', module.settings);

    module.updateAll(module.settings.container);

    // dates added to the page later (rendered by other modules or loaded from an endpoint)
    new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if(node.nodeType === Node.ELEMENT_NODE){
            module.updateAll(node);
          }
        });
      });
    }).observe(module.settings.container, { childList: true, subtree: true });

    // "5 minutes ago" becomes outdated
    if(module.settings.refreshInterval > 0){
      setInterval(() => {
        module.settings.container.querySelectorAll(`${module.settings.selector}[data-format="relative"]`).forEach(module.update);
      }, module.settings.refreshInterval);
    }
  };


  // purpose:		formats the date as a full date
  // arguments: date (Date)
  //            date style and time style - 'full', 'long', 'medium', 'short' or 'none' (string)
  // returns:   formatted date (string)
  // ------------------------------------------------------------------------
  module.full = (date, dateStyle = module.settings.dateStyle, timeStyle = module.settings.timeStyle) => {
    const key = `${dateStyle}-${timeStyle}`;

    if(!module.settings.fullFormatters[key]){
      const options = { timeZone: module.settings.timeZone };
      if(dateStyle !== 'none'){
        options.dateStyle = dateStyle;
      }
      if(timeStyle !== 'none'){
        options.timeStyle = timeStyle;
      }
      module.settings.fullFormatters[key] = new Intl.DateTimeFormat(module.settings.locale, options);
    }

    return module.settings.fullFormatters[key].format(date);
  };


  // purpose:		formats the date relative to now: "now", "5 minutes ago", "3 hours ago",
  //            "1 day ago", "2 days ago", then the full date
  // arguments: date (Date)
  //            date style and time style of the full date (string)
  // returns:   formatted date (string)
  // ------------------------------------------------------------------------
  module.relative = (date, dateStyle, timeStyle) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    // a date in the future, beyond a clock difference, is shown as it is
    if(seconds < -60){
      return module.full(date, dateStyle, timeStyle);
    }
    if(seconds < 60){
      return module.settings.nowFormatter.format(0, 'second');
    }
    if(seconds < 3600){
      return module.settings.relativeFormatter.format(-Math.floor(seconds / 60), 'minute');
    }
    if(seconds < 86400){
      return module.settings.relativeFormatter.format(-Math.floor(seconds / 3600), 'hour');
    }
    if(seconds < 3 * 86400){
      return module.settings.relativeFormatter.format(-Math.floor(seconds / 86400), 'day');
    }

    return module.full(date, dateStyle, timeStyle);
  };


  // purpose:		formats a date
  // arguments: date (Date, string or number)
  //            'full' or 'relative' (string)
  //            date style and time style of the full date (string)
  // returns:   formatted date, empty string for an invalid date (string)
  // ------------------------------------------------------------------------
  module.format = (date, format = 'full', dateStyle, timeStyle) => {
    date = new Date(date);

    if(isNaN(date)){
      return '';
    }

    return format === 'relative' ? module.relative(date, dateStyle, timeStyle) : module.full(date, dateStyle, timeStyle);
  };


  // purpose:		formats the date of a <time> element from its datetime attribute
  // arguments: element (dom node)
  // ------------------------------------------------------------------------
  module.update = element => {
    const date = new Date(element.getAttribute('datetime'));

    // keeps whatever the server rendered
    if(isNaN(date)){
      pos.modules.debug(module.settings.debug, module.settings.id, 'Invalid date, left as it is', element);
      return;
    }

    const dateStyle = element.dataset.dateStyle || module.settings.dateStyle;
    const timeStyle = element.dataset.timeStyle || module.settings.timeStyle;

    try {
      const text = module.format(date, element.dataset.format, dateStyle, timeStyle);

      if(element.textContent !== text){
        element.textContent = text;
      }

      // the exact date on hover
      if(element.dataset.format === 'relative'){
        element.title = module.full(date, dateStyle, timeStyle);
      }
    } catch(error) {
      // an unknown data-date-style or data-time-style
      pos.modules.debug(module.settings.debug, module.settings.id, 'Could not format the date, left as it is', { element, error });
    }
  };


  // purpose:		formats all the dates in the container, the container included
  // arguments: container (dom node)
  // ------------------------------------------------------------------------
  module.updateAll = container => {
    if(container.matches(module.settings.selector)){
      module.update(container);
    }

    container.querySelectorAll(module.settings.selector).forEach(module.update);
  };




  module.init();

};
