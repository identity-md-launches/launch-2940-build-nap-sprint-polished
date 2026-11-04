// @ts-check
/** @type {AudioContext | null} */ let context = null;
/** Small original synthesized sounds, only after an explicit sound opt-in.
 * @param {'call'|'win'|'badge'|'miss'} kind @param {boolean} enabled */
export function playSound(kind, enabled) {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const notes = { call: [330, 440], win: [440, 554, 659, 880], badge: [659, 880, 1108], miss: [294, 247] }[kind];
    notes.forEach((frequency, i) => {
      if (!context) return;
      const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + i * .09;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.055, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + .2);
    });
  } catch { /* Sound is optional; gameplay remains available without audio. */ }
}
