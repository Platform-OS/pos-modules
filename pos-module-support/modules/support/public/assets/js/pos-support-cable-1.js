// One WebSocket connection per page for the desk's live updates (05 §4),
// shared by the queue, ticket and board scripts: platformOS "support"
// channel, rooms queue-<department> | queue-all, ticket-<id>, profile-<id>.
// Imported by relative path, which skips the ?updated= cache stamp the
// pages put on asset URLs (the CDN caches a year): change the number in the
// file name whenever this file changes, like the vendored Action Cable.
import { createConsumer } from './vendor/actioncable-8.0.100.esm.js';

let consumer = null;

// Subscribes to one room; returns the subscription, or null when the page
// has no CSRF token (signed out), so callers can skip live updates.
export function subscribe(room, received, connected) {
  if (!window.pos || !window.pos.csrfToken) return null;
  if (!consumer) {
    consumer = createConsumer(() => `/websocket?authenticity_token=${encodeURIComponent(window.pos.csrfToken)}`);
  }
  return consumer.subscriptions.create({ channel: 'support', room_id: room }, { received, connected });
}
