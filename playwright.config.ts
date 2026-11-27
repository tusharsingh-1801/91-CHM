import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  timeout:60000,
  expect:{timeout:15000},
  use: { baseURL: 'http://127.0.0.1:5174', channel: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? undefined : process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'darwin' ? 'chrome' : undefined), headless: true, trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage'] } : {},
  },
  webServer: [{
    command: 'npm run dev:server',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  }, {
    command: 'npm run dev:client -- --port 5174',
    url: 'http://127.0.0.1:5174',
    env: { VITE_GOOGLE_MAPS_API_KEY: '' },
    reuseExistingServer: false,
  }, {
    command: 'npm run dev:client -- --port 5175',
    url: 'http://127.0.0.1:5175',
    env: { VITE_GOOGLE_MAPS_API_KEY: '' },
    reuseExistingServer: false,
  },{
    command:'npm run build && npm run preview -- --port 5176',
    url:'http://127.0.0.1:5176',
    reuseExistingServer:false,
  }],
});
