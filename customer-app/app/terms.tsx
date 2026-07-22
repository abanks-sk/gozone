import { LegalScreen } from '../src/components/legal';

export default function TermsScreen() {
  return (
    <LegalScreen
      title="Terms of Service"
      updated="1 July 2026"
      intro="Welcome to GoZone. By creating an account or using the app to book rides, order from shops, or send parcels, you agree to these Terms. Please read them carefully."
      sections={[
        { heading: 'Using GoZone', body: 'GoZone connects you with independent drivers, couriers and vendors across Ghana. You must be at least 18 and provide accurate account details. You are responsible for activity on your account and for keeping your login secure.' },
        { heading: 'Bookings & fares', body: 'Ride fares are quoted before you book; on bargainable ride types you may set or negotiate your fare with drivers. Shop and parcel prices are shown at checkout. Fares may vary with distance, demand (peak-time pricing) and the option you choose.' },
        { heading: 'Payments', body: 'You can pay with your GoZone wallet, mobile money, card, or cash. For cash, the driver or vendor confirms receipt in the app. Cards added in the app are stored on your device for the demo and are not charged.' },
        { heading: 'Conduct', body: 'Treat drivers, couriers, vendors and other users with respect. Do not use GoZone for anything unlawful, and do not misuse the platform, attempt fraud, or interfere with the service.' },
        { heading: 'Cancellations', body: 'You may cancel a booking before it is accepted at no charge. Once a driver or courier is on the way, a cancellation fee may apply to cover their time.' },
        { heading: 'Liability', body: 'GoZone provides the platform that connects you with independent providers. To the extent permitted by law, GoZone is not liable for the acts of those independent providers, and the service is provided on an "as is" basis.' },
        { heading: 'Changes', body: 'We may update these Terms from time to time. Continued use of GoZone after an update means you accept the revised Terms.' },
      ]}
    />
  );
}
