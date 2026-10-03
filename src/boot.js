import { loading } from './loading.js';
// Paint the lightweight loader before downloading Three.js and the game bundle.
await loading.paint();
try { await import('./main.js'); }
catch (error) { console.error(error); loading.fail('Unable to load the game. Check your connection and reload.'); }
