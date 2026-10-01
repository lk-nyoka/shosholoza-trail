export class CapeTownEntryTrigger {
  private fired = false;

  constructor(
    private readonly triggerDistanceMeters: number,
    private readonly onEnter: () => Promise<void> | void,
  ) {}

  async update(distanceToStationMeters: number): Promise<boolean> {
    if (this.fired) return false;
    if (!Number.isFinite(distanceToStationMeters)) return false;

    if (distanceToStationMeters <= this.triggerDistanceMeters) {
      this.fired = true;
      await this.onEnter();
      return true;
    }

    return false;
  }

  reset(): void {
    this.fired = false;
  }
}
