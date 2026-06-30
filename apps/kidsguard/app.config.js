// Dynamic Expo config. The Google Maps Android key is injected from a CI/env
// secret (GOOGLE_MAPS_ANDROID_KEY) so it never lives in this PUBLIC repo. Every
// other field comes from app.json verbatim. react-native-maps (PROVIDER_GOOGLE)
// reads android.config.googleMaps.apiKey at prebuild -> AndroidManifest meta-data
// (com.google.android.geo.API_KEY).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
});
