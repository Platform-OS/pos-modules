// Dropdowns (design handoff 3.24): every <select> on a desk page becomes a
// select-only combobox (WAI-ARIA APG pattern) on a <button>, so the field's
// <label for> opens it and names it. The <select> stays in the form, hidden:
// picking an option sets its value and fires "change", so auto-submit,
// autosave and the other scripts keep working, and a script that sets the
// select's value or changes its options is shown on the button too. Without
// JavaScript the plain select is used.
//
// - Markers (priority chips, department tags, avatars, status chips) are
//   rendered by the server in a hidden [data-support-options-for="<select id>"]
//   block next to the select; no colours or labels live here. A marker's
//   data-search adds words the search matches (an email, for example).
// - Lists of more than 10 options, or a select with data-support-search, get
//   a search box; focus then moves into it and it owns aria-activedescendant.
// - data-support-placeholder: the empty-value option is a prompt ("Choose…"),
//   shown muted on the button and left out of the list.
// - data-support-native keeps the browser's own control; [multiple] selects are
//   left alone.
// - The list is laid over the page (attached to <body>, position fixed), so a
//   panel that clips its overflow does not cut it off; it opens upwards when
//   there is no room below. On narrow screens it is a sheet at the bottom.
(function () {
  const SEARCH_FROM = 11;
  const SHEET_BELOW = 640;
  const SVG = 'http://www.w3.org/2000/svg';
  const proto = HTMLSelectElement.prototype;
  const valueProp = Object.getOwnPropertyDescriptor(proto, 'value');
  const indexProp = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');
  const strings = document.body.dataset;
  let uid = 0;

  // The layer every list laid over the page uses: these dropdowns and the
  // board's assignee picker (window.pos.supportLayer). One list is open at a
  // time, attached to <body>. It sits below its button, or above when there is
  // no room; on narrow screens it is a sheet at the bottom with a backdrop and
  // a title. Next to its button it follows the page while it scrolls (a smooth
  // scroll may still be running when it opens) and closes once the button
  // leaves the window. A sheet does not follow the button, and a phone keyboard
  // opening scrolls and resizes the page, so only a width change closes it.
  // A click outside the list and its button closes it.
  const layer = (() => {
    const backdrop = document.createElement('div');
    backdrop.className = 'pos-support-richselect-backdrop';
    // tapping the backdrop of a sheet closes it and gives focus back to the button
    // (preventDefault stops the mouse events that follow, which would move focus to the page)
    backdrop.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    });
    let shown = null;
    let frame = 0;
    const isSheet = () => !!shown && shown.pop.classList.contains('pos-support-richselect-sheet');
    const place = () => {
      if (!shown || isSheet()) return;
      const { anchor, pop, align, matchWidth } = shown;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      if (matchWidth) pop.style.minWidth = `${Math.round(rect.width)}px`;
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      const start = align === 'end' ? rect.right - width : rect.left;
      const left = Math.max(margin, Math.min(start, window.innerWidth - width - margin));
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - margin && rect.top - height - 4 >= margin) top = rect.top - height - 4;
      pop.style.left = `${left}px`;
      pop.style.top = `${Math.max(margin, top)}px`;
    };
    const close = (returnFocus) => {
      if (!shown) return;
      const closing = shown;
      shown = null;
      closing.pop.remove();
      backdrop.remove();
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      closing.onClose(returnFocus);
    };
    function onOutside(event) {
      if (event.target === backdrop) return;
      if (shown && !shown.pop.contains(event.target) && !shown.inside.contains(event.target)) close(false);
    }
    function onScroll(event) {
      if (!shown || isSheet() || shown.pop.contains(event.target) || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!shown) return;
        const rect = shown.anchor.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) close(false);
        else place();
      });
    }
    function onResize() {
      if (shown && window.innerWidth !== shown.width) close(false);
    }
    // anchor: the button; inside: what counts as "not outside" (default the
    // anchor); title: an element in pop shown as the sheet's heading;
    // align: start | end (which edge of the button the list lines up with);
    // matchWidth: at least as wide as the button; onClose(returnFocus).
    const open = ({ anchor, inside, pop, title, titleText, align, matchWidth, onClose }) => {
      close(false);
      const sheet = window.innerWidth < SHEET_BELOW;
      shown = { anchor, inside: inside || anchor, pop, align: align || 'start', matchWidth: !!matchWidth, onClose: onClose || (() => {}), width: window.innerWidth };
      pop.classList.toggle('pos-support-richselect-sheet', sheet);
      if (title) {
        title.textContent = titleText || '';
        title.hidden = !sheet || !title.textContent;
      }
      pop.style.left = '';
      pop.style.top = '';
      if (sheet) document.body.append(backdrop);
      document.body.append(pop);
      place();
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
    };
    return { open, close, isOpen: (pop) => !!shown && shown.pop === pop };
  })();
  window.pos = window.pos || {};
  window.pos.supportLayer = layer;

  const icon = (name, className) => {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', `pos-support-icon ${className}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', `#psi-${name}`);
    svg.append(use);
    return svg;
  };

  const enhance = (select) => {
    if (select.dataset.supportEnhanced || select.multiple || select.hasAttribute('data-support-native') || !select.id) return;
    select.dataset.supportEnhanced = 'true';
    uid += 1;
    const id = `pos-support-richselect-${uid}`;
    const placeholder = select.hasAttribute('data-support-placeholder');
    const label = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
    const markers = () => document.querySelector(`[data-support-options-for="${CSS.escape(select.id)}"]`);
    const markerFor = (value) => {
      const block = markers();
      return block ? block.querySelector(`[data-value="${CSS.escape(value)}"]`) : null;
    };
    const isPrompt = (option) => placeholder && option && option.value === '';
    const contentOf = (option) => {
      const span = document.createElement('span');
      span.className = 'pos-support-richselect-value';
      const marker = option && option.value !== '' ? markerFor(option.value) : null;
      if (marker) span.innerHTML = marker.innerHTML;
      else {
        const text = document.createElement('span');
        text.className = 'pos-support-richselect-text';
        text.textContent = option ? option.text : '';
        span.append(text);
      }
      if (isPrompt(option)) span.classList.add('pos-support-richselect-prompt');
      return span;
    };

    const wrap = document.createElement('div');
    wrap.className = 'pos-support-richselect';
    if (select.dataset.supportRichSelect === 'block') wrap.classList.add('pos-support-richselect-block');
    // controls that scripts or CSS show and hide by attribute follow the select
    if (select.hasAttribute('data-support-reply-only')) wrap.setAttribute('data-support-reply-only', '');
    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'pos-support-richselect-box';
    box.id = `${select.id}-combobox`;
    box.setAttribute('role', 'combobox');
    box.setAttribute('aria-haspopup', 'listbox');
    box.setAttribute('aria-expanded', 'false');
    box.setAttribute('aria-controls', `${id}-list`);
    const labelText = () => (label ? label.textContent.trim() : select.getAttribute('aria-label') || '');
    if (label) {
      if (!label.id) label.id = `${select.id}-label`;
      label.htmlFor = box.id;
      box.setAttribute('aria-labelledby', label.id);
    } else if (select.getAttribute('aria-label')) {
      box.setAttribute('aria-label', select.getAttribute('aria-label'));
    }
    if (select.title) box.title = select.title;

    // the open list: a panel on <body> holding the optional search box and the listbox
    const pop = document.createElement('div');
    pop.className = 'pos-support-richselect-pop';
    const sheetTitle = document.createElement('p');
    sheetTitle.className = 'pos-support-richselect-title';
    const list = document.createElement('ul');
    list.className = 'pos-support-richselect-list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    if (label) list.setAttribute('aria-labelledby', label.id);
    const empty = document.createElement('p');
    empty.className = 'pos-support-richselect-empty pos-supplementary';
    empty.textContent = strings.supportNoMatches || '';
    empty.hidden = true;
    let search = null;

    // options of the listbox, one per option of the select (prompt and hidden ones left out)
    let items = [];
    const build = () => {
      list.replaceChildren();
      items = [];
      let group = null;
      Array.from(select.options).forEach((option, index) => {
        if (isPrompt(option) || option.hidden) return;
        const parent = option.parentElement;
        if (parent && parent.tagName === 'OPTGROUP' && parent !== group) {
          group = parent;
          const head = document.createElement('li');
          head.setAttribute('role', 'presentation');
          head.className = 'pos-support-richselect-group';
          head.textContent = parent.label;
          list.append(head);
        }
        const li = document.createElement('li');
        li.id = `${id}-opt-${index}`;
        li.setAttribute('role', 'option');
        li.dataset.index = String(index);
        const disabled = option.disabled || (parent && parent.tagName === 'OPTGROUP' && parent.disabled);
        if (disabled) li.setAttribute('aria-disabled', 'true');
        li.append(contentOf(option), icon('check', 'pos-support-richselect-check'));
        const marker = markerFor(option.value);
        li.dataset.search = `${option.text} ${marker && marker.dataset.search ? marker.dataset.search : ''}`.toLowerCase();
        list.append(li);
        items.push(li);
      });
    };
    build();
    if (select.hasAttribute('data-support-search') || items.length >= SEARCH_FROM) {
      search = document.createElement('input');
      search.type = 'search';
      search.className = 'pos-support-richselect-search';
      search.placeholder = strings.supportSearchOptions || '';
      search.setAttribute('aria-label', strings.supportSearchOptions || labelText());
      search.setAttribute('role', 'combobox');
      search.setAttribute('aria-expanded', 'true');
      search.setAttribute('aria-controls', list.id);
      search.setAttribute('aria-autocomplete', 'list');
      search.autocomplete = 'off';
    }
    pop.append(sheetTitle, ...(search ? [search] : []), list, empty);
    const focusOwner = () => (search && isOpen() ? search : box);

    const render = () => {
      const option = select.options[select.selectedIndex];
      box.replaceChildren(contentOf(option), icon('chevron-down', 'pos-support-richselect-chevron'));
      items.forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.index) === select.selectedIndex)));
    };

    let active = null;
    const visible = () => items.filter((li) => !li.hidden && li.getAttribute('aria-disabled') !== 'true');
    const setActive = (li) => {
      if (active) active.classList.remove('pos-support-richselect-active');
      active = li || null;
      const owner = focusOwner();
      if (!active) {
        owner.removeAttribute('aria-activedescendant');
        return;
      }
      active.classList.add('pos-support-richselect-active');
      owner.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    };
    const step = (delta) => {
      const options = visible();
      if (!options.length) return;
      const at = options.indexOf(active);
      const next = at === -1 ? (delta > 0 ? 0 : options.length - 1) : Math.max(0, Math.min(options.length - 1, at + delta));
      setActive(options[next]);
    };
    const isOpen = () => box.getAttribute('aria-expanded') === 'true';
    // placement, sheet, outside click and scrolling: the shared layer above
    const open = () => {
      if (isOpen() || box.disabled) return;
      if (search) {
        search.value = '';
        items.forEach((li) => { li.hidden = false; });
        empty.hidden = true;
      }
      layer.open({
        anchor: box,
        inside: wrap,
        pop,
        title: sheetTitle,
        titleText: labelText(),
        align: 'start',
        matchWidth: true,
        onClose: (returnFocus) => {
          setActive(null);
          box.removeAttribute('aria-activedescendant');
          box.setAttribute('aria-expanded', 'false');
          if (returnFocus) box.focus();
        }
      });
      box.setAttribute('aria-expanded', 'true');
      if (search) search.focus();
      const selected = items.find((li) => li.getAttribute('aria-selected') === 'true' && li.getAttribute('aria-disabled') !== 'true');
      setActive(selected || visible()[0]);
    };
    const close = (returnFocus) => {
      if (layer.isOpen(pop)) layer.close(returnFocus);
    };
    const choose = (li) => {
      if (!li || li.getAttribute('aria-disabled') === 'true') return;
      const index = Number(li.dataset.index);
      close(true);
      if (select.selectedIndex === index) return;
      indexProp.set.call(select, index);
      render();
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    let typed = '';
    let typedAt = 0;
    const typeAhead = (key) => {
      const now = Date.now();
      typed = now - typedAt > 600 ? key : typed + key;
      typedAt = now;
      const options = visible();
      const from = isOpen() ? options.indexOf(active) + 1 : options.findIndex((li) => li.getAttribute('aria-selected') === 'true') + 1;
      const order = options.map((_, i) => options[(from + i) % options.length]);
      const hit = order.find((li) => li.textContent.trim().toLowerCase().startsWith(typed.toLowerCase()));
      if (!hit) return;
      if (isOpen()) setActive(hit);
      else choose(hit);
    };

    // keys shared by the button and the search box while the list is open
    const openKeys = (event, fromSearch) => {
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); step(1); return true;
        case 'ArrowUp': event.preventDefault(); step(-1); return true;
        case 'PageDown': event.preventDefault(); step(10); return true;
        case 'PageUp': event.preventDefault(); step(-10); return true;
        case 'Home': if (fromSearch) return false; event.preventDefault(); setActive(visible()[0]); return true;
        case 'End': if (fromSearch) return false; event.preventDefault(); setActive(visible()[visible().length - 1]); return true;
        case 'Enter': event.preventDefault(); choose(active); return true;
        case 'Escape': event.preventDefault(); close(true); return true;
        case 'Tab': close(false); return true;
        default: return false;
      }
    };

    box.addEventListener('click', () => (isOpen() ? close(true) : open()));
    box.addEventListener('keydown', (event) => {
      const key = event.key;
      if (!isOpen()) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(key) || (key === 'ArrowDown' && event.altKey)) {
          event.preventDefault();
          open();
          if (!search && key === 'Home') setActive(visible()[0]);
          if (!search && key === 'End') setActive(visible()[visible().length - 1]);
        } else if (key.length === 1 && /\S/.test(key) && !event.metaKey && !event.ctrlKey) {
          typeAhead(key);
        }
        return;
      }
      if (openKeys(event, false)) return;
      if (key === ' ') { event.preventDefault(); choose(active); return; }
      if (key.length === 1 && /\S/.test(key) && !event.metaKey && !event.ctrlKey) typeAhead(key);
    });
    if (search) {
      search.addEventListener('keydown', (event) => { openKeys(event, true); });
      search.addEventListener('input', () => {
        const words = search.value.trim().toLowerCase();
        items.forEach((li) => { li.hidden = words !== '' && !li.dataset.search.includes(words); });
        empty.hidden = items.some((li) => !li.hidden);
        setActive(visible()[0]);
      });
    }
    // a press in the list keeps focus where it is (the button or the search box)
    list.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('click', (event) => choose(event.target.closest('[role="option"]')));
    list.addEventListener('pointermove', (event) => {
      const li = event.target.closest('[role="option"]');
      if (li && li !== active && li.getAttribute('aria-disabled') !== 'true') setActive(li);
    });
    box.addEventListener('blur', (event) => {
      if (isOpen() && !pop.contains(event.relatedTarget)) close(false);
    });
    if (search) search.addEventListener('blur', (event) => {
      if (isOpen() && event.relatedTarget !== box && !pop.contains(event.relatedTarget)) close(false);
    });

    // a script that sets the value (a reset after a bulk action, a refused
    // autosave putting the old value back) shows on the button as well
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() { return valueProp.get.call(this); },
      set(value) { valueProp.set.call(this, value); render(); },
    });
    Object.defineProperty(select, 'selectedIndex', {
      configurable: true,
      get() { return indexProp.get.call(this); },
      set(value) { indexProp.set.call(this, value); render(); },
    });
    if (select.form) select.form.addEventListener('reset', () => setTimeout(render));
    select.addEventListener('change', render);

    // hidden / disabled follow the select; changed options rebuild the list
    const sync = () => {
      wrap.hidden = select.hidden;
      box.disabled = select.disabled;
    };
    new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' || (r.type === 'attributes' && r.target !== select))) {
        close(false);
        build();
        render();
      }
      sync();
    }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'label', 'selected'] });

    select.classList.add('pos-support-richselect-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.after(wrap);
    wrap.append(box);
    sync();
    render();
  };

  const scan = (scope) => {
    if (scope.matches && scope.matches('select')) enhance(scope);
    if (scope.querySelectorAll) scope.querySelectorAll('select').forEach(enhance);
  };
  scan(document);
  // selects that arrive later (re-rendered rows and panels) are enhanced too
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach((node) => { if (node.nodeType === 1) scan(node); }));
  }).observe(document.body, { childList: true, subtree: true });
})();
