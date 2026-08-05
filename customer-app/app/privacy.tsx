import { LegalScreen } from '../src/components/legal';

export default function PrivacyScreen() {
  return (
    <LegalScreen
      title="Privacy Policy"
      updated="1 July 2026"
      intro="This policy explains what information GoZone collects, how we use it, and the choices you have. We aim to collect only what we need to run the service."
      sections={[
        { heading: 'Information we collect', body: 'Account details you provide (name, phone or email, optional username), your booking and order history, and — while a trip or delivery is active — location so we can match you with nearby drivers and show live tracking.' },
        { heading: 'How we use it', body: 'To create your account, match you with drivers/couriers/vendors, process bookings and payments, provide live tracking and support, and keep the platform safe and reliable.' },
        { heading: 'Location', body: 'Live location is used only to power matching and tracking during an active trip, delivery or parcel. You can control location access in your device settings.' },
        { heading: 'Sharing', body: 'We share only what is needed to complete your request — for example, your pickup and drop-off with the assigned driver or courier. We do not sell your personal data.' },
        { heading: 'Data on your device', body: 'Some details (your profile, saved places, favourites and cards) are stored locally on your device for this demo and are cleared when you log out.' },
        { heading: 'Your choices', body: 'You can edit your profile, manage saved places and payment methods, and log out at any time. To request deletion of your account data, contact us.' },
        { heading: 'Contact', body: 'For privacy questions or requests, email abankwa.ok@gmail.com.' },
      ]}
    />
  );
}
