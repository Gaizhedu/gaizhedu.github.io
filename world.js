export const BLOCK = 64;
export class Terrain {
  heightAt() { return 0; }
  limit(from, to, feet) {
    const direction = Math.sign(to - from);
    for (let x = from; direction && direction * (to - x) > 0; ) {
      const next = x + direction * Math.min(2, Math.abs(to - x));
      if (this.heightAt(next) > feet + .01) return x;
      x = next;
    }
    return to;
  }
  walk(from, to, body) {
    const direction = Math.sign(to - from);
    for (let x = from; direction && direction * (to - x) > 0; ) {
      const next = x + direction * Math.min(2, Math.abs(to - x));
      const ground = this.heightAt(next);
      if (ground > body.feet + .01) {
        if (!body.grounded || ground - body.feet > BLOCK + .01) return x;
        body.feet = ground;
        body.velocity = 0;
      } else if (ground < body.feet - .01) body.grounded = false;
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
export function hitsHeadChest({playerX, chestX, playerHalfWidth = 0, chestHalfWidth = 46, previousHead, head, bottom, rising}) {
  return rising && Math.abs(playerX - chestX) <= playerHalfWidth + chestHalfWidth && previousHead <= bottom && head >= bottom;
}
export class AnswerEffect {
  constructor(event, position, elevation, isCorrect = false) {
    this.event = event;this.position = position;this.elevation = elevation;this.elapsed = 0;
    this.isCorrect = isCorrect;
    this.celebrating = isCorrect && event.kind === 'chest' && Boolean(event.head);
    this.duration = !isCorrect ? 1220 : this.celebrating ? 1100 : 720;
    this.recoveryRemaining = null;
  }
  beginRecovery() {
    if (this.isCorrect || !this.done || this.recoveryRemaining !== null) return false;
    this.recoveryRemaining = 500;
    return true;
  }
  tickRecovery(ms) {
    if (this.recoveryRemaining === null) return false;
    this.recoveryRemaining = Math.max(0, this.recoveryRemaining - ms);
    return this.recoveryRemaining === 0;
  }
  get celebrationLift() { return this.celebrating ? 4 * 150 * this.progress * (1 - this.progress) : 0; }
  get celebrationRotation() { return this.celebrating ? this.progress * Math.PI * 2 : 0; }
  tick(ms) { this.elapsed = Math.min(this.duration, this.elapsed + ms);return this.done; }
  get progress() { return this.elapsed / this.duration; }
  get done() { return this.elapsed >= this.duration; }
}
