import './ui/styles.css';
import { lockZoom } from './core/lockZoom';
import { watchForUpdates } from './core/updates';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

lockZoom();

new Game(app);

// Deployed builds poll for their own replacement and offer a reload; in
// development this is a no-op.
watchForUpdates(app);
