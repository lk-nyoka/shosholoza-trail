import type { CapeTownPhase } from './types.js';

const order: CapeTownPhase[] = ['IDLE', 'PRELOAD', 'MOUNTAIN_APPROACH', 'STATION_ARRIVAL', 'CITY_UNFOLD', 'BO_KAAP', 'CABLEWAY_TRANSFER', 'CABLEWAY_ASCENT', 'SUMMIT_REVEAL', 'PANORAMA_DISCOVERY', 'MOUNTAIN_TO_SEA', 'WATERFRONT', 'SUNSET_FINALE', 'JOURNEY_RECAP', 'REWARD', 'COMPLETE'];
export class PhaseMachine {
  phase: CapeTownPhase = 'IDLE';
  reset() { this.phase = 'IDLE'; }
  enter(next: CapeTownPhase) {
    const recovery = next === 'RECOVERY' && ['CABLEWAY_ASCENT', 'SUMMIT_REVEAL', 'PANORAMA_DISCOVERY'].includes(this.phase);
    if (!recovery && !(this.phase === 'RECOVERY' && next === 'MOUNTAIN_TO_SEA') && order.indexOf(next) !== order.indexOf(this.phase) + 1) {
      throw new Error(`Illegal chapter transition: ${this.phase} → ${next}`);
    }
    this.phase = next;
  }
}
