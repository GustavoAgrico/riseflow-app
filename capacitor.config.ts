import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.riseflow.app',
  appName: 'RiseFlow',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    StatusBar: { backgroundColor: '#0F172A', style: 'DARK' },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0F172A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
    },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    Keyboard: { resize: 'body', resizeOnFullScreen: true },
  },
}

export default config
