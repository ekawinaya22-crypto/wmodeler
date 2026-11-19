/**
 * Capacitor Native Android Configuration for WMODELER
 * Ready for `npx cap add android && npm run build && npx cap sync android`
 */
const config = {
  appId: 'com.wmodeler.app',
  appName: 'WMODELER',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#121418',
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#121418',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#121418',
    },
  },
};

export default config;
