/** Arrival is triggered by crossing the stop time, including a deliberate seek. */
export class ArrivalMoment {
  private previous = 0;
  private dismissed = false;
  update(time: number) {
    if (time < 24) this.dismissed = false;
    const show = time >= 24 && this.previous < 24 && !this.dismissed;
    this.previous = time;
    return { show, hide: time < 24 };
  }
  dismiss() { this.dismissed = true; }
}
