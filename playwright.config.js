import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:1000},headless:true,
    launchOptions:{...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{}),args:['--enable-unsafe-swiftshader']},
    screenshot:'only-on-failure'},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:true},
});
