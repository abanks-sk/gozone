import logo from '../assets/gz-logo.png';

// The official GoZone "GZ" logo (background removed). `white` renders it
// white via a CSS filter for dark/primary surfaces; otherwise the original navy.
export default function GzMark({
  size = 24,
  white = false,
}: {
  size?: number;
  white?: boolean;
}) {
  return (
    <img
      src={logo}
      alt="GoZone"
      width={size}
      height={(size * 681) / 985}
      style={{ display: 'block', filter: white ? 'brightness(0) invert(1)' : undefined }}
    />
  );
}
