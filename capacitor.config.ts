import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Placeholder bundle ID: change before registering with Apple / Google.
  appId: 'com.adibotz.famitie',
  appName: 'FamiTie',
  webDir: 'dist',
  // Needed by the background-location plugin so Android keeps sending updates after 5 minutes in the background.
  android: {
    useLegacyBridge: true,
  },
}

export default config
