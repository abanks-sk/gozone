// Dynamic Expo config. Everything comes from app.json; this only injects the Google
// Maps API key from the environment (GOOGLE_MAPS_API_KEY, set in the gitignored
// customer-app/.env) so the key is never hardcoded in a committed file.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    config.android = {
      ...config.android,
      config: { ...(config.android && config.android.config), googleMaps: { apiKey: key } },
    };
    config.ios = {
      ...config.ios,
      config: { ...(config.ios && config.ios.config), googleMapsApiKey: key },
    };
  }
  return config;
};
