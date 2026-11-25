// /flywheel: dedicated BaseCity Flywheel ($BASECITY / WETH) telemetry & Epoch payout page.
import { mountSite } from './site.js';
import { loadFlywheel } from './flywheel-panel.js';

mountSite('flywheel');
loadFlywheel();
setInterval(loadFlywheel, 60000);
