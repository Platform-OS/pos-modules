import { type Page, expect } from '@playwright/test';

export type SubscriptionVerdict = 'confirm_subscription' | 'reject_subscription' | 'no_confirmation';

/*
  Thin client for the chat module's Action Cable channels, used to assert subscription
  authorization (see views/partials/channels/<channel>/subscribed.liquid).

  Authorization for a channel is delegated to that `subscribed.liquid` partial; without it
  the platform defaults open for same-origin connections and any authenticated user could
  subscribe to another user's stream (IDOR / CWE-639). Defaults to the `notifications`
  channel; pass a different channel (e.g. 'conversate') for the other channels.
*/
export class ChannelClient {
  constructor(private page: Page, private channel: string = 'notifications') { }

  // The notifications room for the signed-in user (`notifications-<profile id>`).
  // window.pos.profile is exposed on /inbox once the user has at least one conversation.
  async ownNotificationsRoomId(): Promise<string> {
    await this.ensureInbox();
    const profileId = await this.page.evaluate(() => String((window as any).pos?.profile?.id ?? ''));
    expect(profileId, 'window.pos.profile.id should be available on /inbox').not.toBe('');
    return `notifications-${profileId}`;
  }

  // Attempt to subscribe to a room and return the server's verdict:
  //   'confirm_subscription' — accepted, the stream is established (the only outcome
  //                            that grants access);
  //   'reject_subscription'  — explicit rejection frame;
  //   'no_confirmation'      — never confirmed within the window (how AnyCable surfaces
  //                            a denied `subscribed` partial: silently dropped).
  // The socket is closed once the verdict is known.
  async subscribe(roomId: string): Promise<SubscriptionVerdict> {
    return this.openSocket(roomId, false);
  }

  // Subscribe to `roomId` and keep the socket open, buffering broadcast payloads for
  // collectNotification(). Fails unless the subscription is confirmed.
  async startListening(roomId: string): Promise<void> {
    const verdict = await this.openSocket(roomId, true);
    expect(verdict, 'should be subscribed to own room').toBe('confirm_subscription');
  }

  // Wait for the first payload buffered by startListening(), or null on timeout.
  async collectNotification(timeoutMs = 10_000): Promise<any> {
    return this.page.evaluate(async (timeoutMs) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const buffer = (window as any).__notif?.received;
        if (buffer && buffer.length) return buffer[0];
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    }, timeoutMs);
  }

  private async ensureInbox(): Promise<void> {
    if (!this.page.url().endsWith('/inbox')) {
      await this.page.goto('/inbox');
    }
  }

  // Open a real Action Cable socket, perform the welcome->subscribe handshake for `roomId`
  // on this client's channel, and resolve with the subscription verdict. Broadcast payloads
  // for the room are buffered on window.__notif.received. When keepOpen is false the socket
  // is closed once the verdict is known; when true it is left open so notifications keep arriving.
  private async openSocket(roomId: string, keepOpen: boolean): Promise<SubscriptionVerdict> {
    await this.ensureInbox();
    const csrfToken = await this.page.evaluate(() => String((window as any).pos?.csrfToken ?? ''));
    expect(csrfToken, 'window.pos.csrfToken should be available on /inbox').not.toBe('');

    return this.page.evaluate(
      ({ csrfToken, channel, roomId, keepOpen }) => {
        return new Promise<SubscriptionVerdict>((resolve, reject) => {
          const identifier = JSON.stringify({ channel, room_id: roomId });
          const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/websocket?authenticity_token=${encodeURIComponent(csrfToken)}`);
          (window as any).__notif = { ws, identifier, received: [] as any[] };

          const settle = (verdict: SubscriptionVerdict) => {
            clearTimeout(timer);
            if (!keepOpen) { try { ws.close(); } catch (_) { } }
            resolve(verdict);
          };
          // A confirmation for an allowed room arrives well under a second; if none has
          // arrived in this window the subscription was denied.
          const timer = setTimeout(() => settle('no_confirmation'), 8_000);

          ws.onmessage = (event) => {
            let msg: any;
            try { msg = JSON.parse(event.data); } catch (_) { return; }
            if (msg.type === 'welcome') { ws.send(JSON.stringify({ command: 'subscribe', identifier })); return; }
            if (msg.identifier !== identifier) return;
            if (msg.type === 'confirm_subscription' || msg.type === 'reject_subscription') { settle(msg.type); return; }
            if (msg.message) { (window as any).__notif.received.push(msg.message); }
          };
          ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket error')); };
        });
      },
      { csrfToken, channel: this.channel, roomId, keepOpen }
    ) as Promise<SubscriptionVerdict>;
  }
}
