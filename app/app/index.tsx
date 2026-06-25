import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { accessToken } = useAuthStore();
  return <Redirect href={accessToken ? '/(rider)/home' : '/auth/register'} />;
}
