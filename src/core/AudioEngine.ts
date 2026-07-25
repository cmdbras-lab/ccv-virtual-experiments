export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private enabled = true;
  private speechEnabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  setSpeechEnabled(enabled: boolean): void {
    this.speechEnabled = enabled;
    if (!enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  speak(text: string, interrupt = true): void {
    if (!this.enabled || !this.speechEnabled || !('speechSynthesis' in window)) return;
    if (interrupt) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-PT';
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    this.audioContext ??= new AudioContext();
    void this.audioContext.resume();
    return this.audioContext;
  }

  tone(frequency: number, duration = 0.12, gain = 0.045, type: OscillatorType = 'sine'): void {
    const context = this.getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const amplifier = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    amplifier.gain.setValueAtTime(gain, context.currentTime);
    amplifier.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(amplifier).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  launch(): void {
    this.tone(320, 0.12, 0.05, 'triangle');
    window.setTimeout(() => this.tone(520, 0.18, 0.04, 'sine'), 90);
  }

  success(): void {
    [523, 659, 784].forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, 0.22, 0.045, 'sine'), index * 110);
    });
  }

  failure(): void {
    this.tone(180, 0.35, 0.04, 'sawtooth');
  }
}
