export interface KimberleyEntryState {
  distanceToStationM: number;
  routeProgress01: number;
  speedKph: number;
}

export class KimberleyEntryTrigger {
  private fired = false;

  constructor(
    private readonly triggerDistanceM = 4500,
    private readonly minimumProgress01 = 0,
  ) {}

  update(state: KimberleyEntryState): boolean {
    if (this.fired) return false;
    if (state.routeProgress01 < this.minimumProgress01) return false;
    if (state.distanceToStationM > this.triggerDistanceM) return false;

    this.fired = true;
    return true;
  }

  reset(): void {
    this.fired = false;
  }
}
