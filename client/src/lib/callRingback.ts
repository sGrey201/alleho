/**
 * Outgoing ringback: two short tones and a pause, looped until the other person joins.
 * The AudioContext is created on the call button click so the browser allows sound.
 */

let activeStop: (() => void) | null = null;

function createRingback(): () => void {
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return () => undefined;

  const ctx = new AudioContextCtor();
  let stopped = false;
  let timer: number | undefined;

  const tone = (when: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 425;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.07, when + 0.02);
    gain.gain.setValueAtTime(0.07, when + Math.max(0.03, duration - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration);
  };

  const cycle = () => {
    if (stopped) return;
    const start = ctx.currentTime + 0.02;
    tone(start, 0.4);
    tone(start + 0.55, 0.4);
    timer = window.setTimeout(cycle, 3200);
  };

  void ctx.resume().then(() => {
    if (!stopped) cycle();
  });

  return () => {
    stopped = true;
    if (timer != null) window.clearTimeout(timer);
    void ctx.close().catch(() => undefined);
  };
}

export function startOutgoingRingback(): void {
  if (activeStop) return;
  activeStop = createRingback();
}

export function stopOutgoingRingback(): void {
  activeStop?.();
  activeStop = null;
}
