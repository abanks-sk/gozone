/**
 * Subscribe to a live-location topic and report whether a message actually arrives.
 *
 * The e2e suite otherwise only exercises REST state transitions, which is how courier tracking came
 * to be completely dead while every delivery assertion passed: the socket handshake was answered
 * with 403 and no test ever opened one.
 *
 * Usage: node scripts/ws-probe.js <token> <orderId> [timeoutMs]
 * Exits 0 when a position arrives, 2 when the subscribe/connect is refused, 1 on silence.
 */
const path = require('path');
const base = path.join(__dirname, '..', 'customer-app', 'node_modules');
const { Client } = require(path.join(base, '@stomp/stompjs', 'bundles', 'stomp.umd.js'));
Object.assign(global, { WebSocket: require(path.join(base, 'ws')) });

const [token, orderId, timeout = '15000'] = process.argv.slice(2);
const host = process.env.GOZONE_FOOD_WS || 'ws://localhost:8083/food';

const client = new Client({
  brokerURL: `${host}/ws/websocket?token=${token}`,
  connectHeaders: { Authorization: `Bearer ${token}` },
  reconnectDelay: 0,
  debug: () => {},
  onStompError: () => { console.log('REFUSED'); process.exit(2); },
  onWebSocketError: (e) => { console.log('WSERROR ' + (e.message || e)); process.exit(3); },
});
client.onConnect = () => {
  client.subscribe(`/topic/delivery/${orderId}/location`, (msg) => {
    console.log('GOT ' + msg.body);
    process.exit(0);
  });
};
client.activate();
setTimeout(() => { console.log('SILENT'); process.exit(1); }, Number(timeout));
