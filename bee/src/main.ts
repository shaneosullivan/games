import './ui/styles.css';
import { lockZoom } from './core/lockZoom';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

lockZoom();

new Game(app);
