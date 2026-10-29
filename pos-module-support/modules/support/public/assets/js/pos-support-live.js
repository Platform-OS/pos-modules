// Live updates and presence (05 §4) over the platformOS "support" channel.
// Rooms: queue-<department>, ticket-<id>, profile-<id>. Payloads carry ids;
// rows and pages are fetched from the desk, which checks access again.
import { createConsumer } from './vendor/actioncable-8.0.100.esm.js';

const root = document.querySelector('[data-support-live]');
if (root && window.pos && window.pos.csrfToken) {
  const consumer = createConsumer(() => `/websocket?authenticity_token=${encodeURIComponent(window.pos.csrfToken)}`);
  const subscribe = (room, received, connected) => consumer.subscriptions.create(
    { channel: 'support', room_id: room },
    { received, connected }
  );
  const text = (key, fallback) => root.dataset[key] || fallback;

  // Queue: refresh changed rows; new tickets go to the top of their swim lane
  // (the lane of their priority or status), or of the first lane when theirs is not shown.
  const tbody = document.querySelector('.pos-support-table tbody');
  const departments = (root.dataset.supportDepartments || '').split(',').filter(Boolean);
  const laneFor = (row) => {
    const key = root.dataset.supportGroup === 'status' ? row.dataset.statusKey : row.dataset.priority;
    return document.querySelector(`.pos-support-lane[data-lane="${CSS.escape(key || '')}"]`) || tbody;
  };
  // once the page is being left (a form was sent), rows are not fetched any more:
  // requests racing the redirect could take the one-time flash message
  let leaving = false;
  document.addEventListener('submit', (event) => { if (!event.defaultPrevented) leaving = true; });
  window.addEventListener('pagehide', () => { leaving = true; });
  const rowOf = (ticketId) => document.querySelector(`.pos-support-row [value="${CSS.escape(ticketId)}"]`)?.closest('tr');
  const refreshRow = async (ticketId, kind) => {
    if (leaving) return;
    if (!rowOf(ticketId) && (kind !== 'created' || root.dataset.supportFirstPage !== 'true')) return;
    const response = await fetch(`/support-desk/tickets/${encodeURIComponent(ticketId)}/row`, { credentials: 'same-origin' });
    if (!response.ok) return;
    const template = document.createElement('template');
    template.innerHTML = (await response.text()).trim();
    const row = template.content.querySelector('tr');
    if (!row) return;
    row.classList.add('pos-support-row-fresh');
    // look the row up again: another update may have replaced it while this one was loading
    const existing = rowOf(ticketId);
    const lane = laneFor(row);
    if (existing && existing.closest('tbody') === lane) {
      existing.replaceWith(row);
      return;
    }
    if (existing) existing.remove();
    if (!lane) return;
    const head = lane.querySelector('.pos-support-lane-head');
    if (head) head.after(row);
    else lane.prepend(row);
  };
  if (tbody) {
    departments.forEach((id) => subscribe(`queue-${id}`, (data) => refreshRow(data.ticket_id, data.kind)));
  }

  // Ticket page: presence and the new-message guard.
  const ticketId = root.dataset.supportTicket;
  if (ticketId) {
    const presence = document.querySelector('[data-support-presence]');
    const composer = document.querySelector('[data-support-composer]');
    const body = composer && composer.querySelector('textarea[name="body"]');
    const others = new Map();
    const me = root.dataset.supportMe;
    const renderPresence = () => {
      if (!presence) return;
      const now = Date.now();
      const names = [];
      others.forEach((entry, id) => {
        if (now - entry.at > 45000 || entry.state === 'left') { others.delete(id); return; }
        names.push(`${entry.name} ${entry.state === 'replying' ? text('supportReplying', 'is replying') : text('supportViewing', 'is viewing')}`);
      });
      presence.textContent = names.join(' · ');
      presence.hidden = names.length === 0;
    };
    const state = () => (body && (document.activeElement === body || body.value.trim() !== '') ? 'replying' : 'viewing');
    let room = null;
    room = subscribe(`ticket-${ticketId}`, (data) => {
      if (data.kind === 'presence') {
        if (data.profile_id !== me) { others.set(data.profile_id, { name: data.name, state: data.state, at: Date.now() }); renderPresence(); }
        return;
      }
      // A customer message, or a reply sent by someone else, while this agent may be writing.
      const fromOther = data.kind === 'reply' && data.actor_id && data.actor_id !== me;
      if ((data.kind === 'message' || fromOther) && composer) {
        const warning = document.querySelector('[data-support-new-message]');
        if (warning) {
          warning.hidden = false;
          const ack = warning.querySelector('input[type="checkbox"]');
          if (ack) { ack.checked = false; ack.required = true; }
        }
      }
    }, () => room && room.send({ state: state() }));
    setInterval(() => { room.send({ state: state() }); renderPresence(); }, 20000);
    if (body) body.addEventListener('focus', () => room.send({ state: 'replying' }));
    window.addEventListener('pagehide', () => room.send({ state: 'left' }));
  }

  // Personal room: short in-app notice for assignments.
  const profileId = root.dataset.supportMe;
  if (profileId) {
    subscribe(`profile-${profileId}`, (data) => {
      if (data.kind !== 'assigned' || !window.pos.modules || !window.pos.modules.toast) return;
      new window.pos.modules.toast('info', `${text('supportAssignedToYou', 'Assigned to you')}: #${data.number}`);
    });
  }
}
