import type { SoundEngine } from './soundEngine';
import type { ScheduledNote } from './playbackEngine';

export class WebAudioEngine implements SoundEngine {
  private ctx: AudioContext | null = null;
  private oscillators: Set<OscillatorNode> = new Set();
  private gainNodes: Set<GainNode> = new Set();
  private timeouts: Set<number> = new Set();
  private volume = 0.3;
  private tone: OscillatorType = 'sawtooth';
  private sustain = 1 / 3;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  async resume(): Promise<boolean> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  start(schedule: ScheduledNote[]): void {
    this.stop();
    const ctx = this.getContext();
    const now = ctx.currentTime;

    for (const note of schedule) {
      const tOn = now + note.time;
      const tOff = tOn + note.duration;
      const pluckEnd =
        this.sustain <= 0 ? tOn + Math.min(note.duration, 0.1) : tOff;

      const osc = ctx.createOscillator();
      osc.type = this.tone;
      osc.frequency.value = this.midiToFreq(note.midi);

      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, tOn);
      if (this.sustain <= 0) {
        envelope.gain.linearRampToValueAtTime(this.volume, tOn + 0.005);
        envelope.gain.linearRampToValueAtTime(0.001, pluckEnd);
      } else {
        const level = Math.max(0.001, this.volume * this.sustain);
        envelope.gain.linearRampToValueAtTime(this.volume, tOn + 0.01);
        envelope.gain.exponentialRampToValueAtTime(level, tOn + 0.08);
        envelope.gain.setValueAtTime(level, tOff - 0.02);
        envelope.gain.exponentialRampToValueAtTime(0.001, tOff + 0.02);
      }

      osc.connect(envelope);
      envelope.connect(ctx.destination);

      osc.start(tOn);
      osc.stop(pluckEnd + 0.03);

      this.oscillators.add(osc);
      this.gainNodes.add(envelope);

      const timeoutId = window.setTimeout(() => {
        this.oscillators.delete(osc);
        this.gainNodes.delete(envelope);
        this.timeouts.delete(timeoutId);
      }, (pluckEnd + 0.05 - now) * 1000);
      this.timeouts.add(timeoutId);
    }
  }

  stop(): void {
    for (const timeoutId of this.timeouts) {
      window.clearTimeout(timeoutId);
    }
    this.timeouts.clear();

    const ctx = this.ctx;
    const now = ctx?.currentTime ?? 0;

    for (const gain of this.gainNodes) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.gainNodes.clear();

    for (const osc of this.oscillators) {
      try {
        osc.stop(now);
      } catch {
        // already stopped
      }
    }
    this.oscillators.clear();
  }

  setVolume(gain: number): void {
    this.volume = Math.max(0, Math.min(1, gain));
  }

  setTone(type: OscillatorType): void {
    this.tone = type;
  }

  setSustain(level: number): void {
    this.sustain = Math.max(0, Math.min(1, level));
  }
}
