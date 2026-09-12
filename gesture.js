// Pure gesture recognition, shared by the content script and regression tests.
(() => {
  const QUIET_MS = 140;
  const SETTLE_MS = 65;
  class BackGesture {
    constructor() { this.reset(); }
    reset() {
      this.start = null;
      this.distance = 0;
      this.vertical = 0;
      this.samples = 0;
      this.peak = 0;
      this.decelerating = 0;
      this.previous = 0;
      this.rejected = false;
    }
    add({ x, y, time, blocked = false }) {
      if (this.start === null) this.start = time;
      this.samples++;
      if (blocked || x > 4) this.rejected = true;
      this.distance += -x;
      this.vertical += Math.abs(y);
      if (this.vertical > 24 && this.vertical > this.distance / 2) this.rejected = true;
      const speed = Math.max(0, -x);
      this.peak = Math.max(this.peak, speed);
      if (speed < this.previous && speed < this.peak * 0.9) this.decelerating++;
      else if (speed > this.previous + 2) this.decelerating = 0;
      this.previous = speed;
      return this.qualifies() && time - this.start >= 90 && this.decelerating >= 3;
    }
    qualifies() {
      return !this.rejected && this.samples >= 3 && this.distance >= 180 && this.distance > this.vertical * 2;
    }
  }
  globalThis.SwipeGesture = { BackGesture, QUIET_MS, SETTLE_MS };
  if (typeof module !== 'undefined') module.exports = globalThis.SwipeGesture;
})();
