export const BLOCK = 64;
const PROFILE = [0, 0, 0, 0, 1, 1, 2, 2, 1, 1, 0, 0, 0, 1, 1, 0];
export class Terrain {
  constructor(events = []) { this.events = events; }
  heightAt(x) {
    const column = Math.floor(x / BLOCK);
    if (column < 3) return 0;
    // Treasure encounters have a broad, reachable landing below them.
    if (this.events.some(e => e.kind === 'chest' && Math.abs((column + .5) * BLOCK - e.distance) < 130)) return BLOCK;
    return PROFILE[((column % PROFILE.length) + PROFILE.length) % PROFILE.length] * BLOCK;
  }
  limit(from, to, feet) {
    const direction = Math.sign(to - from);
    for (let x = from; direction && direction * (to - x) > 0; ) {
      const next = x + direction * Math.min(2, Math.abs(to - x));
      if (this.heightAt(next) > feet + .01) return x;
      x = next;
    }
    return to;
  }
}
export class Jumper {
  constructor(feet = 0) { this.feet = feet;this.velocity = 0;this.grounded = true; }
  jump() {
    if (!this.grounded) return false;
    this.velocity = 570;this.grounded = false;return true;
  }
  tick(ms, ground) {
    const dt = ms / 1000;
    if (this.grounded && this.feet === ground) return;
    this.grounded = false;
    this.feet += this.velocity * dt - 600 * dt * dt;
    this.velocity -= 1200 * dt;
    if (this.feet <= ground && this.velocity <= 0) {
      this.feet = ground;this.velocity = 0;this.grounded = true;
    }
  }
}
export function hitsHeadChest({playerX, chestX, previousHead, head, bottom, rising}) {
  return rising && Math.abs(playerX - chestX) <= 46 && previousHead <= bottom && head >= bottom;
}
export class AnswerEffect {
  constructor(event, position, elevation) {
    this.event = event;this.position = position;this.elevation = elevation;this.elapsed = 0;this.duration = 720;
  }
  tick(ms) { this.elapsed = Math.min(this.duration, this.elapsed + ms);return this.done; }
  get progress() { return this.elapsed / this.duration; }
  get done() { return this.elapsed >= this.duration; }
}
