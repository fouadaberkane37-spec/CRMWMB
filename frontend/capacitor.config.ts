import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.team.crm',
  appName: 'Team CRM',
  // The built React app (npm run build → dist/) is bundled into the native app.
  // API calls go to VITE_API_URL (set in .env.local before building).
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    // Respects safe-area insets (notch, home bar)
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
}

export default config
