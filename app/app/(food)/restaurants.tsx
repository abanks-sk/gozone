import { useEffect, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { foodApi, Restaurant } from '../../../src/api/food';
import { Badge, Card, Colors, Empty, Row } from '../../../src/components/ui';

export default function RestaurantsScreen() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      setRestaurants(await foodApi.listRestaurants());
    } catch (e) {
      Alert.alert('Error', 'Could not load restaurants');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {restaurants.length === 0
        ? <Empty message="No restaurants open right now" />
        : restaurants.map(r => (
          <TouchableOpacity
            key={r.id}
            onPress={() => router.push({ pathname: '/(food)/menu', params: { restaurantId: r.id, name: r.name } })}
          >
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.name}>{r.name}</Text>
                <Badge label={r.status} color={r.status === 'OPEN' ? Colors.primary : Colors.muted} />
              </Row>
              <Text style={styles.meta}>Ready in ~{r.prepMinutes} min</Text>
            </Card>
          </TouchableOpacity>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 17, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 13, color: Colors.muted, marginTop: 4 },
});
