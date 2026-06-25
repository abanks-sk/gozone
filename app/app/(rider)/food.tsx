import { Redirect } from 'expo-router';

// Rider's food tab just redirects to the food stack
export default function RiderFoodTab() {
  return <Redirect href="/(food)/restaurants" />;
}
