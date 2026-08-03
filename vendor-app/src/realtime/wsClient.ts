import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { storage } from '../lib/storage';
import { apiBaseUrl } from '../lib/host';

export type LocationPayload = { lat: number; lng: number; driverId: string };
export type QueuePayload = { position: number; status: string };

type Callback<T> = (payload: T) => void;

/**
 * The live layer: courier and driver positions, and walk-in queue movement.
 *
 * <b>Nothing here used to arrive.</b> Every screen called `subscribeToX` and nobody ever called
 * `connect`, so `this.client` was null and the optional chaining threw the subscription away
 * without a word — no error, no reconnect, no clue. The ride screens survived it because they also
 * poll for status; courier tracking has no such fallback, so the customer's map simply never moved.
 *
 * So subscribing now connects. A caller asks to watch a topic and gets it whenever the socket is
 * ready, including after a reconnect, and never has to know whether it was ready at the time.
 */
class GoZoneWsClient {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private staleCallback: (() => void) | null = null;
  private readonly STALE_THRESHOLD_MS = 4_000;

  /**
   * Every topic somebody has asked for, kept for the lifetime of the subscription.
   *
   * The broker does not replay anything on reconnect, so without this a dropped socket — a lift, a
   * tunnel, a Wi-Fi handover — would leave a screen silently watching nothing for the rest of the
   * journey. They are re-established on every connect.
   */
  private wanted = new Map<string, { cb: (msg: IMessage) => void; sub?: StompSubscription }>();

  /** Connect once. Concurrent callers share the same attempt rather than opening several sockets. */
  private ensureConnected(): Promise<void> {
    if (this.client?.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      // The storage shim, not SecureStore directly: SecureStore throws on web, which killed the
      // socket before it was opened there.
      const token = await storage.get('accessToken');
      // Derive the WS URL from the laptop's *current* IP at connect time (not module load),
      // so it follows the network the phone is actually on.
      const wsBase = apiBaseUrl().replace(/^http/, 'ws');

      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };

        this.client = new Client({
          brokerURL: `${wsBase}/ws/websocket?token=${token}`,
          // The server authenticates the STOMP CONNECT frame via this header.
          connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
          reconnectDelay: 3_000,
          onConnect: () => {
            if (this.staleTimer) clearTimeout(this.staleTimer);
            this.resubscribeAll();
            done();
          },
          onDisconnect: () => this.triggerStale(),
          onWebSocketClose: () => this.triggerStale(),
          onStompError: () => { this.triggerStale(); done(); },
        });

        this.client.activate();
        // Don't leave a caller awaiting a socket that may never come up — stompjs keeps retrying
        // in the background, and resubscribeAll() picks the topics up when it succeeds.
        setTimeout(done, 6_000);
      });
    })().finally(() => { this.connecting = null; });

    return this.connecting;
  }

  /** Open the socket early (e.g. on app start) so the first subscription is instant. */
  async connect(onStale?: () => void): Promise<void> {
    if (onStale) this.staleCallback = onStale;
    await this.ensureConnected();
  }

  /** Called on every (re)connect — the broker replays nothing, so we re-ask for each topic. */
  private resubscribeAll(): void {
    this.wanted.forEach((entry, destination) => {
      entry.sub = this.client?.subscribe(destination, entry.cb);
    });
  }

  private watch(destination: string, handler: (msg: IMessage) => void): void {
    const entry = { cb: handler } as { cb: (msg: IMessage) => void; sub?: StompSubscription };
    this.wanted.set(destination, entry);
    if (this.client?.connected) {
      entry.sub = this.client.subscribe(destination, handler);
    } else {
      // Fire and forget: resubscribeAll() attaches it the moment the socket is up.
      this.ensureConnected().catch(() => {});
    }
  }

  private unwatch(destination: string): void {
    const entry = this.wanted.get(destination);
    try { entry?.sub?.unsubscribe(); } catch { /* socket already gone */ }
    this.wanted.delete(destination);
  }

  subscribeToRide(tripId: string, cb: Callback<LocationPayload>): () => void {
    const dest = `/topic/trip/${tripId}/location`;
    this.watch(dest, (msg) => { this.resetStaleTimer(); cb(JSON.parse(msg.body)); });
    return () => this.unwatch(dest);
  }

  /**
   * Watch a delivery. The id is the **order** id, not the delivery id — the customer only ever
   * knows the order, so that is what the server broadcasts on.
   */
  subscribeToDelivery(orderId: string, cb: Callback<LocationPayload>): () => void {
    const dest = `/topic/delivery/${orderId}/location`;
    this.watch(dest, (msg) => { this.resetStaleTimer(); cb(JSON.parse(msg.body)); });
    return () => this.unwatch(dest);
  }

  subscribeToQueue(restaurantId: string, cb: Callback<QueuePayload>): () => void {
    const dest = `/topic/queue/${restaurantId}`;
    this.watch(dest, (msg) => cb(JSON.parse(msg.body)));
    return () => this.unwatch(dest);
  }

  publishLocation(tripId: string, lat: number, lng: number): void {
    this.client?.publish({
      destination: `/app/location/${tripId}`,
      body: JSON.stringify({ lat, lng }),
    });
  }

  disconnect(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.wanted.clear();
    this.client?.deactivate();
    this.client = null;
  }

  private resetStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => this.triggerStale(), this.STALE_THRESHOLD_MS);
  }

  private triggerStale(): void {
    this.staleCallback?.();
  }
}

// Singleton
export const wsClient = new GoZoneWsClient();
