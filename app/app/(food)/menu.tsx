import { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { foodApi, MenuItem, Order } from '../../../src/api/food';
import { Btn, Card, Colors, Divider, Empty, Row, Section } from '../../../src/components/ui';

const MODES = ['DELIVERY', 'PICKUP', 'WALKIN'] as const;

export default function MenuScreen() {
  const router = useRouter();
  const { restaurantId, name } = useLocalSearchParams<{ restaurantId: string; name: string }>();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [mode, setMode] = useState<'DELIVERY' | 'PICKUP' | 'WALKIN'>('DELIVERY');
  const [deliveryAddr, setDeliveryAddr] = useState('15 Oxford Street, Osu');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    foodApi.getMenu(restaurantId).then(setMenu).catch(() => {});
  }, [restaurantId]);

  function addToCart(item: MenuItem) {
    setCart(prev => new Map(prev).set(item.id, (prev.get(item.id) ?? 0) + 1));
  }

  function removeFromCart(itemId: string) {
    setCart(prev => {
      const next = new Map(prev);
      const qty = (next.get(itemId) ?? 1) - 1;
      if (qty <= 0) next.delete(itemId); else next.set(itemId, qty);
      return next;
    });
  }

  function cartTotal(): number {
    let total = 0;
    cart.forEach((qty, id) => {
      const item = menu.find(m => m.id === id);
      if (item) total += item.price * qty;
    });
    return total;
  }

  async function placeOrder() {
    if (cart.size === 0) return Alert.alert('Add items to your cart first');
    setLoading(true);
    try {
      const items = Array.from(cart.entries()).map(([menuItemId, qty]) => ({ menuItemId, qty }));
      const order = await foodApi.placeOrder({
        restaurantId,
        mode,
        deliveryAddr: mode === 'DELIVERY' ? deliveryAddr : undefined,
        items,
      });
      router.push({ pathname: '/(food)/order', params: { orderId: order.id } });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not place order');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.restaurant}>{name}</Text>

      {/* Mode selector */}
      <Row style={{ gap: 8, marginBottom: 12 }}>
        {MODES.map(m => (
          <Btn
            key={m}
            label={m}
            variant={mode === m ? 'primary' : 'outline'}
            onPress={() => setMode(m)}
            style={{ flex: 1 }}
          />
        ))}
      </Row>

      {/* Menu items */}
      <Section title="Menu">
        {menu.length === 0
          ? <Empty message="No items available" />
          : menu.map(item => (
            <Card key={item.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>GH₵ {item.price.toFixed(2)}</Text>
                </View>
                <Row style={{ gap: 8 }}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => removeFromCart(item.id)}>
                    <Text style={styles.qtyText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qty}>{cart.get(item.id) ?? 0}</Text>
                  <TouchableOpacity style={[styles.qtyBtn, styles.qtyBtnAdd]} onPress={() => addToCart(item)}>
                    <Text style={[styles.qtyText, { color: '#fff' }]}>+</Text>
                  </TouchableOpacity>
                </Row>
              </Row>
            </Card>
          ))
        }
      </Section>

      {/* Cart summary */}
      {cart.size > 0 && (
        <>
          <Divider />
          <Card style={{ backgroundColor: Colors.primary }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {Array.from(cart.values()).reduce((a, b) => a + b, 0)} items
              </Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>
                GH₵ {cartTotal().toFixed(2)}
              </Text>
            </Row>
            <Btn label="Place order" onPress={placeOrder} loading={loading} variant="outline"
              style={{ borderColor: '#fff' }} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  restaurant: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  itemPrice: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  qtyBtnAdd: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  qtyText: { fontSize: 18, fontWeight: '700', color: Colors.text },
  qty: { fontSize: 16, fontWeight: '700', color: Colors.text, minWidth: 20, textAlign: 'center' },
});
