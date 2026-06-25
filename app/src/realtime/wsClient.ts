import { Client, IMessage } from '@stomp/stompjs';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BASE_URL = (Constants.expoConfig?.extra?.apiBaseUrl ?? 'http://localhost:8080')
  .replace(/^http/, 'ws');

export type LocationPayload = { lat: number; lng: number; driverId: string };
export type QueuePayload = { position: number; status: string };

type Callback<T> = (payload: T) => void;

class GoZoneWsClient {
  private client: Client | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private staleCallback: (() => void) | null = null;
  private readonly STALE_THRESHOLD_MS = 4_000;

  async connect(onStale?: () => void): Promise<void> {
    const token = await SecureStore.getItemAsync('accessToken');
    this.staleCallback = onStale ?? null;

    this.client = new Client({
      brokerURL: `${BASE_URL}/ws/websocket?token=${token}`,
      reconnectDelay: 3_000,
      onConnect: () => {
        if (this.staleTimer) clearTimeout(this.staleTimer);
      },
      onDisconnect: () => this.triggerStale(),
      onStompError: () => this.triggerStale(),
    });

    this.client.activate();
  }

  subscribeToRide(tripId: string, cb: Callback<LocationPayload>): void {
    this.client?.subscribe(`/topic/trip/${tripId}/location`, (msg: IMessage) => {
      this.resetStaleTimer();
      cb(JSON.parse(msg.body));
    });
  }

  subscribeToDelivery(deliveryId: string, cb: Callback<LocationPayload>): void {
    // Delivery tracking reuses the same primitive as ride tracking
    this.client?.subscribe(`/topic/delivery/${deliveryId}/location`, (msg: IMessage) => {
      this.resetStaleTimer();
      cb(JSON.parse(msg.body));
    });
  }

  subscribeToQueue(restaurantId: string, cb: Callback<QueuePayload>): void {
    this.client?.subscribe(`/topic/queue/${restaurantId}`, (msg: IMessage) => {
      cb(JSON.parse(msg.body));
    });
  }

  publishLocation(tripId: string, lat: number, lng: number): void {
    this.client?.publish({
      destination: `/app/location/${tripId}`,
      body: JSON.stringify({ lat, lng }),
    });
  }

  disconnect(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
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
