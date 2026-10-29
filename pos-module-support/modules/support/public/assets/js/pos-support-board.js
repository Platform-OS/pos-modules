// Board (D-26): drag a card to another column, or use its "Move to" form.
// Both post to /support-desk/board/move; with respond=json the server answers
// with JSON instead of a redirect, and the card is re-fetched so it lands in its sorted place (or back
// where it was when the move is refused). Changes from the queue rooms
// refresh cards the same way.
import { createConsumer } from './vendor/actioncable-8.0.100.esm.js';

const root = document.querySelector('[data-support-board]');
if (root) {
  const priorityRank = { p0: 0, p1: 1, p2: 2, p3: 3 };
  const column = (key) => root.querySelector(`.pos-support-column[data-status-key="${CSS.escape(key)}"]`);
  const cardFor = (id) => root.querySelector(`.pos-support-card[data-ticket-id="${CSS.escape(id)}"]`);
  // the same message is not stacked again while it is still on screen
  let lastToast = { message: null, at: 0 };
  const toast = (kind, message) => {
    if (message === lastToast.message && Date.now() - lastToast.at < 5000) return;
    lastToast = { message, at: Date.now() };
    if (window.pos && window.pos.modules && window.pos.modules.toast) new window.pos.modules.toast(kind, message);
  };
  const adjustCount = (col, delta) => {
    const count = col && col.querySelector('[data-count]');
    if (count) count.textContent = Math.max(0, Number(count.textContent) + delta);
  };

  // Insert by priority, then newest first: the order the server uses.
  const place = (card, col) => {
    const cards = col.querySelector('[data-cards]');
    const rank = priorityRank[card.dataset.priority] ?? 9;
    const created = Number(card.dataset.created);
    const before = Array.from(cards.children).find((other) => {
      const otherRank = priorityRank[other.dataset.priority] ?? 9;
      return otherRank > rank || (otherRank === rank && Number(other.dataset.created) < created);
    });
    cards.insertBefore(card, before || null);
  };

  // Fetch the card again. It is dropped when the ticket left the member's
  // scope or moved to a column that is not shown.
  const refresh = async (ticketId) => {
    const response = await fetch(`/support-desk/tickets/${encodeURIComponent(ticketId)}/card`, { credentials: 'same-origin' });
    const existing = cardFor(ticketId);
    const from = existing && existing.closest('.pos-support-column');
    let card = null;
    let target = null;
    if (response.ok) {
      const template = document.createElement('template');
      template.innerHTML = (await response.text()).trim();
      card = template.content.querySelector('.pos-support-card');
      if (card) target = column(card.dataset.statusKey);
    }
    if (existing) existing.remove();
    if (card && target) {
      card.classList.add('pos-support-row-fresh');
      bind(card);
      place(card, target);
    }
    if (from !== target) {
      adjustCount(from, -1);
      if (card) adjustCount(target, 1);
    }
  };

  const move = async (card, statusKey) => {
    const form = card.querySelector('form.pos-support-move');
    const data = new FormData(form);
    data.set('status_key', statusKey);
    data.set('respond', 'json');
    card.setAttribute('aria-busy', 'true');
    let error = null;
    try {
      const response = await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) error = body.error || root.dataset.supportMoveError;
    } catch (e) {
      error = root.dataset.supportMoveError;
    }
    card.removeAttribute('aria-busy');
    if (error) toast('error', error);
    await refresh(card.dataset.ticketId);
  };

  const bind = (card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', card.dataset.ticketId);
      event.dataTransfer.effectAllowed = 'move';
    });
    const form = card.querySelector('form.pos-support-move');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        move(card, form.elements.status_key.value);
      });
    }
  };
  root.querySelectorAll('.pos-support-card').forEach(bind);

  root.querySelectorAll('.pos-support-column').forEach((col) => {
    // a ticket never goes back to New, so that column takes no drops
    if (col.dataset.category === 'new') return;
    col.addEventListener('dragover', (event) => { event.preventDefault(); col.classList.add('pos-support-drop-target'); });
    col.addEventListener('dragleave', (event) => { if (!col.contains(event.relatedTarget)) col.classList.remove('pos-support-drop-target'); });
    col.addEventListener('drop', (event) => {
      event.preventDefault();
      col.classList.remove('pos-support-drop-target');
      const card = cardFor(event.dataTransfer.getData('text/plain'));
      if (card && card.closest('.pos-support-column') !== col) move(card, col.dataset.statusKey);
    });
  });

  // Live: cards on the board follow changes made elsewhere. A ticket not on
  // the board is only added when no filter is narrowing it.
  const filtered = root.dataset.supportFiltered === 'true';
  const departments = (root.dataset.supportDepartments || '').split(',').filter(Boolean);
  if (departments.length && window.pos && window.pos.csrfToken) {
    const consumer = createConsumer(() => `/websocket?authenticity_token=${encodeURIComponent(window.pos.csrfToken)}`);
    const received = (data) => {
      if (!data.ticket_id || (filtered && !cardFor(data.ticket_id))) return;
      refresh(data.ticket_id);
    };
    departments.forEach((id) => consumer.subscriptions.create({ channel: 'support', room_id: `queue-${id}` }, { received }));
  }
}
