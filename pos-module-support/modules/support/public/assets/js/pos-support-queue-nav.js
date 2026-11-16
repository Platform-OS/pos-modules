// Queue navigation without full page loads (Maciek's review, 16 Nov 2026):
// switching list ↔ board, the grouping, the filters, the attention links and
// "Show more" fetch the page and replace the queue in place. The URL changes
// (back and forward work), the sidebar counts follow, the scroll position of
// the page and of every board column is kept, and a loading state shows while
// the page is fetched. Without JavaScript the same links and the filter form
// load the page as before; on any failure the browser simply goes to the URL.
//
// After a swap "pos-support:queue-replaced" is fired on document: the board,
// live and queue scripts wire the new list (pos-support-board.js,
// pos-support-live.js, pos-support-queue.js).

const QUEUE_PATHS = ['/support-desk', '/support-desk/board'];
let current = null; // the fetch in flight, aborted when another starts

const isQueueUrl = (url) => url.origin === window.location.origin && QUEUE_PATHS.includes(url.pathname.replace(/\/$/, ''));

const loading = (on) => {
  document.body.classList.toggle('pos-support-loading', on);
  const root = document.querySelector('.pos-support-queue');
  if (root) root.setAttribute('aria-busy', on ? 'true' : 'false');
};

// scroll positions: the window, and each board column by its group key
const remember = () => {
  const columns = {};
  document.querySelectorAll('.pos-support-column[data-group-key] [data-cards]').forEach((cards) => {
    columns[cards.closest('.pos-support-column').dataset.groupKey] = cards.scrollTop;
  });
  return { x: window.scrollX, y: window.scrollY, columns };
};
const restore = (saved) => {
  Object.entries(saved.columns).forEach(([key, top]) => {
    const cards = document.querySelector(`.pos-support-column[data-group-key="${CSS.escape(key)}"] [data-cards]`);
    if (cards) cards.scrollTop = top;
  });
  window.scrollTo(saved.x, saved.y);
};

// icons are sent per page (icons/sprite): add the symbols the new list uses
const mergeIcons = (doc) => {
  const sprite = document.querySelector('svg.pos-support-sprite');
  const incoming = doc.querySelector('svg.pos-support-sprite');
  if (!sprite || !incoming) return;
  incoming.querySelectorAll('symbol[id]').forEach((symbol) => {
    if (!document.getElementById(symbol.id)) sprite.append(document.importNode(symbol, true));
  });
};

// scripts the new list needs that this page has not loaded yet (list → board)
const loadScripts = (doc) => {
  const loaded = new Set(Array.from(document.scripts).map((s) => s.src.split('?')[0]).filter(Boolean));
  doc.querySelectorAll('.pos-support-content script[src]').forEach((script) => {
    const src = script.getAttribute('src');
    if (loaded.has(new URL(src, window.location.href).href.split('?')[0])) return;
    const fresh = document.createElement('script');
    if (script.type) fresh.type = script.type;
    fresh.src = src;
    document.body.append(fresh);
  });
};

// focus stays on the control that was used, when the new page has it again
const focusKey = (element) => {
  if (!element) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const link = element.closest('a[href]');
  if (link) return `a[href="${CSS.escape(link.getAttribute('href'))}"]`;
  return null;
};

// The server remembers the last layout and grouping in the session, so a URL
// without them shows whatever was chosen last. Each history entry gets both
// written in, so Back shows the list as it was.
const pinned = (href) => {
  const url = new URL(href, window.location.href);
  const root = document.querySelector('.pos-support-queue');
  if (!root) return url.href;
  if (url.pathname.replace(/\/$/, '') === '/support-desk' && !url.searchParams.has('layout')) {
    url.searchParams.set('layout', root.hasAttribute('data-support-board') ? 'board' : 'list');
  }
  if (root.dataset.supportGroup && !url.searchParams.has('group')) url.searchParams.set('group', root.dataset.supportGroup);
  return url.href;
};

async function go(href, { push = true, focus = null } = {}) {
  const url = new URL(href, window.location.href);
  if (current) current.abort();
  const controller = new AbortController();
  current = controller;
  const saved = remember();
  const kind = (root) => (root && root.hasAttribute('data-support-board') ? 'board' : 'list');
  const before = kind(document.querySelector('.pos-support-queue'));
  loading(true);
  try {
    const response = await fetch(url.href, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'text/html' } });
    if (!response.ok || response.redirected && !isQueueUrl(new URL(response.url))) throw new Error('not a queue page');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const incoming = doc.querySelector('.pos-support-queue');
    const outgoing = document.querySelector('.pos-support-queue');
    if (!incoming || !outgoing) throw new Error('no queue in the answer');

    outgoing.replaceWith(document.importNode(incoming, true));
    // the sidebar: current view and counts
    const railLists = document.querySelectorAll('.pos-support-rail .pos-support-rail-items');
    const newRailLists = doc.querySelectorAll('.pos-support-rail .pos-support-rail-items');
    if (railLists.length === newRailLists.length) railLists.forEach((list, i) => list.replaceWith(document.importNode(newRailLists[i], true)));
    document.title = doc.title;
    mergeIcons(doc);
    loadScripts(doc);
    if (push) window.history.pushState({ supportQueue: true }, '', pinned(response.url || url.href));
    document.dispatchEvent(new CustomEvent('pos-support:queue-replaced'));
    // the same kind of list (filters, grouping, Show more): stay where you were
    if (kind(document.querySelector('.pos-support-queue')) === before) restore(saved);
    const target = focus && document.querySelector(focus);
    if (target) target.focus();
  } catch (error) {
    if (error.name === 'AbortError') return;
    window.location.href = url.href;
  } finally {
    if (current === controller) {
      current = null;
      loading(false);
    }
  }
}

if (window.fetch && window.DOMParser && window.history.pushState) {
  // the page the visitor arrived on: its layout and grouping written in too
  if (document.querySelector('.pos-support-queue')) {
    window.history.replaceState({ supportQueue: true }, '', pinned(window.location.href));
  }
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download') || !link.closest('.pos-support-queue')) return;
    // ticket links, the assignee button and anything outside the queue pages load normally
    if (link.closest('.pos-support-card-title, .pos-support-subject, [data-support-assign]')) return;
    const url = new URL(link.href, window.location.href);
    if (!isQueueUrl(url)) return;
    event.preventDefault();
    // Reset all filters disappears with the filters: focus goes to the search
    // field (on a full load pos-support-ui.js does this with a session flag)
    const reset = link.hasAttribute('data-support-reset-filters');
    if (reset) {
      try { sessionStorage.removeItem('pos-support-focus-search'); } catch (e) { /* storage unavailable */ }
    }
    go(url.href, { focus: reset ? '[data-support-search]' : focusKey(link) });
  });

  // the filter form (GET, sent by queue.js as soon as a dropdown changes)
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (event.defaultPrevented || !form.matches('.pos-support-queue form[method="get" i]')) return;
    const url = new URL(form.getAttribute('action') || window.location.pathname, window.location.href);
    if (!isQueueUrl(url)) return;
    event.preventDefault();
    const params = new URLSearchParams(new FormData(form, event.submitter));
    // empty fields are left out, as the server ignores them anyway
    Array.from(params.keys()).forEach((key) => { if (params.get(key) === '') params.delete(key); });
    url.search = params.toString();
    go(url.href, { focus: focusKey(document.activeElement) });
  });

  window.addEventListener('popstate', () => {
    if (isQueueUrl(new URL(window.location.href)) && document.querySelector('.pos-support-queue')) {
      go(window.location.href, { push: false });
    }
  });
}
