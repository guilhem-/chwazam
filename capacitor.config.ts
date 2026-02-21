import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chwazam.app',
  appName: 'Chwazam',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
