import { createConsumer } from './vendor/actioncable-8.0.100.esm.js';

// The CSRF token goes in the query string because a browser can't set headers on a
// WebSocket - it's how platformOS checks it (websockets_require_csrf_token, on by default),
// which keeps other sites from opening a socket with the user's cookies.
// https://documentation.platformos.com/use-cases/using-websockets
const getWebSocketURL = () => {
  return `/websocket?authenticity_token=${encodeURIComponent(window.pos.csrfToken)}`;
};

export default createConsumer(getWebSocketURL);
