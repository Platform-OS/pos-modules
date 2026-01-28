import { createConsumer } from "https://unpkg.com/@rails/actioncable@8.0.100/app/assets/javascripts/actioncable.esm.js";

const getWebSocketURL = () => {
  return `/websocket?authenticity_token=${window.pos.csrfToken}`;
};

export default createConsumer(getWebSocketURL);
