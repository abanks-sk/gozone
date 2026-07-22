import { Alert, Platform } from 'react-native';

// React Native Web's Alert.alert is a no-op, so "coming soon" stubs and confirm
// dialogs look like dead buttons in a browser. Patch it once to use the DOM
// equivalents (window.alert / window.confirm). Native is untouched.
if (Platform.OS === 'web') {
  (Alert as any).alert = (
    title: string,
    message?: string,
    buttons?: { text?: string; onPress?: () => void; style?: string }[],
  ) => {
    const body = message ? `${title}\n\n${message}` : title;
    if (buttons && buttons.length > 1) {
      const confirmed = window.confirm(body);
      if (confirmed) {
        (buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1])?.onPress?.();
      } else {
        buttons.find((b) => b.style === 'cancel')?.onPress?.();
      }
    } else {
      window.alert(body);
      buttons?.[0]?.onPress?.();
    }
  };
}
