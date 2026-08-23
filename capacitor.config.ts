import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.nmr.configurator',
  appName: 'NMR Configurator',
  webDir: 'dist',
  // While developing you can point the native shell at the Vite dev server:
  // server: { url: 'http://192.168.1.10:5173', cleartext: true },
}

export default config
