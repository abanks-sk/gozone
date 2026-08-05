import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, TextInput, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentLocation } from '../../src/lib/location';
import { shopApi, Order, QueuePosition , LeaveTime } from '../../src/api/shop';
import { clearPending, getPending, setPending } from '../../src/lib/pendingPayment';
import { walletApi } from '../../src/api/wallet';
import { wsClient } from '../../src/realtime/wsClient';
import { useTheme } from '../../src/theme/ThemeProvider';
import { usePaymentStore, PAY_METHODS, isPaystack, isSavedCard, cardIdOf } from '../../src/store/paymentStore';
import { useProfileStore } from '../../src/store/profileStore';
import { apiBaseUrl } from '../../src/lib/host';
import { LeafletMap } from '../../src/components/LeafletMap';
import { Badge, Card, Divider, Row, StarRating } from '../../src/components/ui';

const STAGES: Record<string, string[]> = {
  DELIVERY: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'],
  PICKUP: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'],
  WALKIN: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'],
};

function statusInfo(status: string, mode: string): { title: string; sub: string; icon: any } {
  switch (status) {
    case 'PLACED': return { title: 'Order placed', sub: 'Waiting for the vendor to confirm', icon: 'receipt-outline' };
    case 'CONFIRMED': return { title: 'Order confirmed', sub: 'The vendor is getting started', icon: 'checkmark-circle-outline' };
    case 'PREPARING': return { title: 'Preparing your order', sub: 'Your order is being prepared', icon: 'cube-outline' };
    case 'READY': return { title: mode === 'DELIVERY' ? 'Ready for pickup' : 'Ready', sub: mode === 'DELIVERY' ? 'A courier is being assigned' : mode === 'PICKUP' ? 'Head over to collect it' : 'Listen for your number', icon: 'bag-check-outline' };
    case 'OUT_FOR_DELIVERY': return { title: 'On the way', sub: 'Your courier is heading to you', icon: 'bicycle' };
    case 'COMPLETED': return { title: mode === 'DELIVERY' ? 'Delivered' : 'Completed', sub: 'Thanks for your order!', icon: 'checkmark-done' };
    case 'CANCELLED': return { title: 'Order cancelled', sub: 'This order was cancelled', icon: 'close-circle-outline' };
    default: return { title: status, sub: '', icon: 'ellipse-outline' };
  }
}

function eta(status: string): string {
  switch (status) {
    case 'PLACED': case 'CONFIRMED': return 'Estimated 20–30 min';
    case 'PREPARING': return 'Estimated 15–20 min';
    case 'READY': return 'Almost there';
    case 'OUT_FOR_DELIVERY': return 'Arriving in ~10 min';
    default: return '';
  }
}

/**
 * Why the estimate is standing still before the kitchen starts.
 *
 * The number only counts down once the food is actually being cooked, because until then nothing
 * is happening to count down — the vendor hasn't picked the order up. Saying so is better than a
 * figure that ticks away and implies progress that isn't being made.
 */
function NotStartedNote({ status, color }: { status: string; color: string }) {
  if (status !== 'PLACED' && status !== 'CONFIRMED') return null;
  return (
    <Text style={{ fontSize: 12.5, color, marginTop: 6, fontStyle: 'italic' }}>
      The kitchen hasn't started yet — the countdown begins when they do.
    </Text>
  );
}

export default function OrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [queue, setQueue] = useState<QueuePosition | null>(null);
  const [leave, setLeave] = useState<LeaveTime | null>(null);
  // Fires once. Real push needs a development build, so until then the alert is what actually
  // interrupts someone who is looking at the app — and being told twice is worse than not at all.
  const leaveAlerted = useRef(false);
  const [courierLoc, setCourierLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const payMethod = usePaymentStore((s) => s.selected);
  const savedMethods = usePaymentStore((s) => s.cards);
  const profilePhone = useProfileStore((s) => s.phone);
  const [momoNumber, setMomoNumber] = useState(profilePhone || '');
  const [paying, setPaying] = useState(false);
  const [payRef, setPayRef] = useState<string | null>(null); // pending Paystack reference
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const o = await shopApi.getOrder(orderId);
      setOrder(o);
      if (o.mode === 'WALKIN') {
        setQueue(await shopApi.queuePosition(orderId).catch(() => null));
      }
      // Anyone collecting has a journey to time — a pickup customer as much as a walk-in; only a
      // delivery customer stays put. This poll is also what makes the estimate count down, since
      // the server recomputes it against how long the food has actually been cooking.
      if (o.mode === 'WALKIN' || o.mode === 'PICKUP') {
        // Where they are NOW is what decides when to set off, so the position is read on each
        // refresh rather than once. Best-effort: no permission still gives a ready time.
        const here = await getCurrentLocation().catch(() => null);
        const lt = await shopApi.leaveTime(orderId, here?.lat, here?.lng).catch(() => null);
        setLeave(lt);
        if (lt && lt.leaveInMinutes != null && lt.leaveInMinutes <= 0
            && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && !leaveAlerted.current) {
          leaveAlerted.current = true;
          Alert.alert('Time to set off',
            `Your order at ${o.restaurantName ?? 'the restaurant'} should be ready as you arrive`
            + (lt.travelMinutes != null ? ` — you're about ${lt.travelMinutes} min away.` : '.'));
        }
      }
    } catch {}
  }
  useEffect(() => { load(); }, [orderId]);

  // Auto-poll status so the tracker advances live as the restaurant moves it,
  // until the order reaches a terminal state.
  useEffect(() => {
    if (!order) return;
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return;
    const poll = setInterval(load, 4000);
    return () => clearInterval(poll);
  }, [order?.status, orderId]);

  // Listen from READY, not from OUT_FOR_DELIVERY.
  //
  // The courier's app starts pushing GPS the moment they accept the job, which happens while the
  // order is still READY — they then drive to the restaurant, collect, and only *then* does the
  // order flip to OUT_FOR_DELIVERY. Subscribing at OUT_FOR_DELIVERY threw away the whole first
  // leg, so the customer saw nothing during the part of the wait they most want to watch.
  useEffect(() => {
    if (!order || order.mode !== 'DELIVERY') return;
    if (order.status !== 'READY' && order.status !== 'OUT_FOR_DELIVERY') return;
    const stop = wsClient.subscribeToDelivery(orderId, (loc) => {
      setCourierLoc({ lat: loc.lat, lng: loc.lng });
      setIsStale(false);
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
      staleTimerRef.current = setInterval(() => setIsStale(true), 6000);
    });
    // Drop the subscription with the screen. Without this each order left one behind, so a second
    // delivery drove the marker on a screen showing somebody else's.
    return () => { stop(); if (staleTimerRef.current) clearInterval(staleTimerRef.current); };
  }, [order?.status]);

  useEffect(() => {
    if (!order || order.mode !== 'WALKIN') return;
    const stop = wsClient.subscribeToQueue(order.restaurantId, () => { shopApi.queuePosition(orderId).then(setQueue).catch(() => {}); });
    return () => stop();
  }, [order?.restaurantId]);

  // Choosing a score and sending it are separate now — see the note on the ride screens.
  const [rateSent, setRateSent] = useState(false);
  /**
   * Nobody took the delivery — the customer decides what happens next.
   *
   * Both of these can legitimately lose a race against a courier finally accepting the job, which
   * the server answers with a 409. Showing that message is the right outcome: the food is on its
   * way, which is what they wanted in the first place.
   */
  const [switching, setSwitching] = useState(false);

  async function switchToPickup() {
    setSwitching(true);
    try {
      setOrder(await shopApi.switchToPickup(orderId));
      Alert.alert('Collect it yourself', 'Your order is now a pickup. Head to the vendor when it’s ready.');
    } catch (e: any) {
      Alert.alert('Couldn’t switch', e?.response?.data?.message ?? 'Please try again.');
      await load();
    } finally { setSwitching(false); }
  }

  function cancelForNoCourier() {
    Alert.alert('Cancel this order?', 'We haven’t found a courier. You can cancel and order again later.', [
      { text: 'Keep waiting', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: async () => {
          setSwitching(true);
          try { setOrder(await shopApi.cancelOrder(orderId)); }
          catch (e: any) {
            Alert.alert('Couldn’t cancel', e?.response?.data?.message ?? 'Please try again.');
            await load();
          } finally { setSwitching(false); }
        },
      },
    ]);
  }

  async function rate() {
    if (!myRating || rateSent) return;
    try { await shopApi.rateOrder(orderId, myRating); setRateSent(true); Alert.alert('Thanks for rating!'); } catch {}
  }

  // Cash awaits the vendor/courier's confirmation — poll until PAID.
  useEffect(() => {
    if (!order || order.paymentStatus !== 'AWAITING') return;
    const poll = setInterval(load, 4000);
    return () => clearInterval(poll);
  }, [order?.paymentStatus, orderId]);

  // Wallet/cash pay in one tap; Paystack (added card/momo) opens the checkout, then verifies.

  /**
   * Finish an order paid for in the Paystack browser.
   *
   * Coming back from checkout usually means a cold start, so `payRef` is gone and the customer
   * would be staring at an unpaid order they have already been charged for. payOrder re-verifies
   * the reference server-side, so replaying one that never completed simply fails and leaves the
   * Pay button where it was.
   */
  useEffect(() => {
    if (!order || order.paymentStatus === 'PAID') return;
    let active = true;
    (async () => {
      const p = await getPending('order');
      if (!p || p.targetId !== orderId || !active) return;
      try {
        const o = await shopApi.payOrder(orderId, p.method ?? payMethod, p.reference);
        if (!active) return;
        setOrder(o); setPayRef(null);
        await clearPending();
      } catch {
        if (active) setPayRef(p.reference);
      }
    })();
    return () => { active = false; };
  }, [order?.id, order?.paymentStatus]);

  async function pay() {
    if (!order) return;
    setPaying(true);
    try {
      // A saved card charges server-side — no browser, no re-entering anything, which is the
      // whole point of having saved it. Was wired into the ride flow only, so a customer who had
      // saved a card still got bounced out to Paystack for every food order. The reference this
      // returns goes through exactly the same verification as a checkout payment, so nothing
      // gains a second trust path.
      if (isSavedCard(payMethod) && !payRef) {
        const { reference } = await walletApi.chargeCard(cardIdOf(payMethod), Number(order.total));
        setOrder(await shopApi.payOrder(orderId, 'card', reference));
        await clearPending();
      } else if (viaPaystack && !payRef) {
        const { reference, authorizationUrl } = await walletApi.payInitialize(Number(order.total));
        const url = authorizationUrl.startsWith('http') ? authorizationUrl : `${apiBaseUrl()}${authorizationUrl}`;
        setPayRef(reference);
        // Survive the browser hand-off: returning from Paystack routinely reloads the app, and a
        // reference held only in React state dies with it — the customer pays and it stays unpaid.
        await setPending({ kind: 'order', reference, amount: Number(order.total), targetId: orderId, method: payMethod });
        await Linking.openURL(url);
      } else {
        const o = await shopApi.payOrder(orderId, payMethod, payRef ?? undefined);
        setOrder(o);
        // Paid by card through checkout — offer it as one tap next time.
        if (payRef) walletApi.rememberCard(payRef, Number(order.total));
        setPayRef(null);
        await clearPending();
      }
    } catch (e: any) {
      Alert.alert('Payment', e?.response?.data?.message ?? 'Please try again');
    } finally { setPaying(false); }
  }

  if (!order) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const paid = order.paymentStatus === 'PAID';
  const awaitingCash = order.paymentStatus === 'AWAITING';
  const methodMeta = [...PAY_METHODS, ...savedMethods].find((m) => m.key === payMethod) ?? PAY_METHODS[0];
  const viaPaystack = isPaystack(payMethod);
  const confirmer = order.mode === 'DELIVERY' ? 'courier' : 'vendor';

  // ── Courier tracking geometry ──────────────────────────────────────────────
  // Before collection the useful view is courier → restaurant; after it, restaurant → your door.
  const collected = order.status === 'OUT_FOR_DELIVERY';
  const vendorPt = order.restaurantLat != null && order.restaurantLng != null
    ? { lat: Number(order.restaurantLat), lng: Number(order.restaurantLng) } : null;
  const destPt = order.deliveryLat != null && order.deliveryLng != null
    ? { lat: Number(order.deliveryLat), lng: Number(order.deliveryLng) } : null;
  const courierMarkers = [
    ...(vendorPt ? [{ ...vendorPt, kind: 'pickup' as const, label: order.restaurantName }] : []),
    // Older orders have no stored destination, so the map shows the pickup end only rather than
    // inventing a pin. Nothing breaks; there is simply one fewer marker.
    ...(destPt ? [{ ...destPt, kind: 'dest' as const, label: order.deliveryAddr || 'Your address' }] : []),
  ];
  // Centre on whichever leg is live: the courier's approach, or the journey to you.
  const mapCenter = courierLoc && vendorPt && !collected
    ? { lat: (courierLoc.lat + vendorPt.lat) / 2, lng: (courierLoc.lng + vendorPt.lng) / 2 }
    : destPt && vendorPt
      ? { lat: (vendorPt.lat + destPt.lat) / 2, lng: (vendorPt.lng + destPt.lng) / 2 }
      : courierLoc ?? vendorPt;

  const stages = STAGES[order.mode] ?? STAGES.PICKUP;
  const cancelled = order.status === 'CANCELLED';
  const currentIdx = stages.indexOf(order.status);
  const info = statusInfo(order.status, order.mode);
  const etaText = eta(order.status);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, flex: 1 }} numberOfLines={1}>{order.restaurantName}</Text>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {/* Status hero */}
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              {etaText && !cancelled ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.6 }}>{etaText}</Text> : null}
              <Text style={{ fontSize: 23, fontWeight: '800', color: c.text, marginTop: 4 }}>{info.title}</Text>
              {/* The server's reason when a timeout ended it. "This order was cancelled" with no
                  explanation reads as the app having lost it. */}
              <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, lineHeight: 20 }}>
                {(cancelled && order.cancelReason) ? order.cancelReason : info.sub}
              </Text>
            </View>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: cancelled ? `${c.danger}1A` : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={info.icon} size={28} color={cancelled ? c.danger : c.primary} />
            </View>
          </Row>

          {!cancelled && (
            <Row style={{ gap: 5, marginTop: 18 }}>
              {stages.map((s, i) => (
                <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= currentIdx ? c.primary : c.border }} />
              ))}
            </Row>
          )}
        </Card>

        {/* No courier is coming. Offered rather than imposed: the food may already be cooked, so
            the choice between fetching it and giving up belongs to the customer, not to a sweep. */}
        {order.awaitingCourier && !cancelled && (
          <Card>
            <Row style={{ gap: 10, alignItems: 'flex-start' }}>
              <Ionicons name="alert-circle" size={20} color={c.warning} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: c.text }}>No courier yet</Text>
                <Text style={{ fontSize: 13.5, color: c.textMuted, marginTop: 3, lineHeight: 19 }}>
                  We haven’t found a courier for your order. You can collect it yourself
                  {order.deliveryFee > 0 ? ` and get the GH₵ ${order.deliveryFee.toFixed(2)} delivery fee back` : ''}, or cancel.
                </Text>
              </View>
            </Row>
            <Row style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={switchToPickup} disabled={switching} activeOpacity={0.9}
                style={{ flex: 1, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 13, alignItems: 'center', opacity: switching ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>
                  {switching ? 'Switching…' : 'I’ll collect it'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelForNoCourier} disabled={switching} activeOpacity={0.9}
                style={{ flex: 1, borderRadius: 999, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 14.5 }}>Cancel order</Text>
              </TouchableOpacity>
            </Row>
          </Card>
        )}

        {/* Courier — shown from READY, so the run to the restaurant is visible too, not just the
            leg to your door. `collected` is what splits those two phases. */}
        {order.mode === 'DELIVERY' && (order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY') && (
          <Card>
            <Row style={{ gap: 14 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bicycle" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>
                  {collected ? 'Your courier is on the way'
                    : courierLoc ? 'Courier heading to the restaurant'
                    : 'Finding you a courier'}
                </Text>
                <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>
                  {collected ? 'Delivering your order to you'
                    : courierLoc ? 'They’ll collect your order, then bring it to you'
                    : 'Your order is ready and waiting for collection'}
                </Text>
              </View>
              {courierLoc && <Badge label={isStale ? 'Stale' : 'Live'} color={isStale ? c.textMuted : c.success} />}
            </Row>

            {/* The map only means anything once we have at least the vendor to anchor it. Raw
                coordinates used to be printed here, which told the customer nothing at all. */}
            {vendorPt && (
              <View style={{ height: 220, borderRadius: 16, overflow: 'hidden', marginTop: 14, backgroundColor: c.surfaceAlt }}>
                <LeafletMap
                  style={{ flex: 1 }}
                  mode="view"
                  center={mapCenter!}
                  zoom={14}
                  markers={courierMarkers}
                  driver={courierLoc}
                  vehicleKind="bike"
                />
              </View>
            )}
            {!courierLoc && (
              <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 10 }}>
                The courier will appear on the map as soon as one accepts your delivery.
              </Text>
            )}
          </Card>
        )}

        {/* Walk-in queue */}
        {order.mode === 'WALKIN' && queue && (
          <Card>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your position in the queue</Text>
            <Text style={{ fontSize: 56, fontWeight: '800', color: c.primary, textAlign: 'center', marginVertical: 6 }}>#{queue.position}</Text>
            <View style={{ alignItems: 'center' }}><Badge label={queue.status} /></View>
          </Card>
        )}

        {/* When to set off — for walk-in and pickup alike. "Your food is ready" arrives too late
            to be useful when you still have to travel; the moment to leave is the useful figure. */}
        {order.mode !== 'DELIVERY' && leave && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
          <Card>
            {leave.leaveInMinutes == null ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ready in</Text>
                <Text style={{ fontSize: 30, fontWeight: '800', color: c.text, marginTop: 4 }}>
                  about {leave.readyInMinutes} min
                </Text>
                <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 6 }}>
                  Turn on location and we'll tell you exactly when to set off.
                </Text>
                <NotStartedNote status={leave.status} color={c.textMuted} />
              </>
            ) : leave.leaveInMinutes <= 0 ? (
              <>
                <Row style={{ gap: 8, alignItems: 'center' }}>
                  <Ionicons name="walk" size={20} color={c.success} />
                  <Text style={{ fontSize: 20, fontWeight: '800', color: c.success }}>Time to set off</Text>
                </Row>
                <Text style={{ fontSize: 13.5, color: c.textMuted, marginTop: 6 }}>
                  About {leave.travelMinutes} min away · your order should be ready as you arrive.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Leave in</Text>
                <Text style={{ fontSize: 34, fontWeight: '800', color: c.primary, marginTop: 2 }}>
                  {leave.leaveInMinutes} min
                </Text>
                <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 6 }}>
                  {leave.peopleAhead > 0
                    ? `${leave.peopleAhead} ahead of you · ready in about ${leave.readyInMinutes} min`
                    : `Ready in about ${leave.readyInMinutes} min`}
                  {leave.travelMinutes != null ? ` · ${leave.travelMinutes} min away` : ''}
                </Text>
                <NotStartedNote status={leave.status} color={c.textMuted} />
              </>
            )}
          </Card>
        )}

        {/* Summary */}
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Order summary</Text>
          {order.items.map((item, i) => (
            <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
              <Text style={{ flex: 1, color: c.text }}>{item.name} × {item.qty}</Text>
              <Text style={{ color: c.text, fontWeight: '600' }}>GH₵ {(item.unitPrice * item.qty).toFixed(2)}</Text>
            </Row>
          ))}
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: c.textMuted }}>Subtotal</Text>
            <Text style={{ color: c.text }}>
              GH₵ {(order.total - (order.serviceFee ?? 0) - order.deliveryFee + (order.discount ?? 0)).toFixed(2)}
            </Text>
          </Row>
          {(order.discount ?? 0) > 0 && (
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Row style={{ gap: 6, alignItems: 'center', flex: 1 }}>
                <Ionicons name="pricetag" size={14} color={c.success} />
                <Text style={{ color: c.success, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {order.promoLabel || 'Discount'}
                </Text>
              </Row>
              <Text style={{ color: c.success, fontWeight: '700' }}>− GH₵ {(order.discount ?? 0).toFixed(2)}</Text>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: c.textMuted }}>Service fee</Text>
            <Text style={{ color: c.text }}>GH₵ {(order.serviceFee ?? 0).toFixed(2)}</Text>
          </Row>
          {order.mode === 'DELIVERY' && (
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: c.textMuted }}>Delivery fee</Text>
              <Text style={{ color: c.text }}>GH₵ {order.deliveryFee.toFixed(2)}</Text>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>Total</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.primary }}>GH₵ {order.total.toFixed(2)}</Text>
          </Row>

          {/* Offers the vendor honours in person — shown so the customer knows
              what to expect, and matches what the vendor sees on their board. */}
          {order.promoNotes ? (
            <Row style={{ gap: 8, marginTop: 12, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12 }}>
              <Ionicons name="gift" size={16} color={c.primary} />
              <Text style={{ flex: 1, fontSize: 13, color: c.text, lineHeight: 18 }}>{order.promoNotes}</Text>
            </Row>
          ) : null}
        </Card>

        {/* Payment */}
        {order.status === 'COMPLETED' && (
          <Card>
            {paid ? (
              <Row style={{ justifyContent: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={18} color={c.success} />
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.success }}>Payment received · {methodMeta.label}</Text>
              </Row>
            ) : (
              <>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>Pay GH₵ {order.total.toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => router.push('/wallet' as any)}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>Change · {methodMeta.label}</Text>
                  </TouchableOpacity>
                </Row>

                {viaPaystack && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>
                    {payRef
                      ? 'Finish paying in the Paystack checkout, then tap Verify to confirm.'
                      : `You’ll pay GH₵ ${order.total.toFixed(2)} securely via Paystack (${methodMeta.label}).`}
                  </Text>
                )}
                {payMethod === 'wallet' && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay from your GoZone Wallet balance.</Text>
                )}
                {payMethod === 'cash' && awaitingCash && (
                  <Row style={{ gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <ActivityIndicator color={c.primary} />
                    <Text style={{ fontSize: 13.5, color: c.text, flex: 1 }}>Pay the {confirmer} in cash — waiting for them to confirm.</Text>
                  </Row>
                )}
                {payMethod === 'cash' && !awaitingCash && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay the {confirmer} in cash. They’ll confirm it in their app.</Text>
                )}

                {!(payMethod === 'cash' && awaitingCash) && (
                  <TouchableOpacity onPress={pay} disabled={paying} activeOpacity={0.9}
                    style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: paying ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                      {paying ? 'Processing…'
                        : viaPaystack ? (payRef ? 'Verify payment' : `Pay with ${methodMeta.label}`)
                        : payMethod === 'cash' ? 'Pay with cash'
                        : `Pay GH₵ ${order.total.toFixed(2)}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Card>
        )}

        {/* Rating */}
        {order.status === 'COMPLETED' && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 10 }}>How was your order?</Text>
            <Row style={{ gap: 8 }}>
              <StarRating value={myRating} onChange={setMyRating} disabled={rateSent} />
            </Row>
            {!rateSent && myRating > 0 && (
              <TouchableOpacity onPress={rate} activeOpacity={0.85}
                style={{ marginTop: 12, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 11, borderRadius: 999, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary }}>
                <Text style={{ color: c.primary, fontWeight: '800', fontSize: 14 }}>Submit rating</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

