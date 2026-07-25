import type { Hands as HandsType, NormalizedLandmark, Results } from '@mediapipe/hands';

declare global {
  interface Window {
    Hands: typeof HandsType;
  }
}
import { InputSmoother } from './InputSmoother.js';
import type { HandInput, Vec2 } from './types.js';

const EMPTY_INPUT: HandInput = {
  present: false,
  cursor: { x: 0.5, y: 0.5 },
  rawCursor: { x: 0.5, y: 0.5 },
  velocity: { x: 0, y: 0 },
  landmarks: [],
  pinch: false,
  pinchStarted: false,
  pinchEnded: false,
  pinchRatio: 1,
  confidence: 0,
  timestampMs: 0,
};

export interface HandTrackerOptions {
  mirrored: boolean;
  detectionFps: number;
}

export class HandTracker {
  private hands: HandsType | null = null;
  private readonly video = document.createElement('video');
  private readonly smoother = new InputSmoother();
  private latest: HandInput = { ...EMPTY_INPUT };
  private previousPinch = false;
  private lastDetectionAt = 0;
  private lastVideoTime = -1;
  private stream: MediaStream | null = null;
  private running = false;
  private busy = false;
  private animationFrame = 0;
  private mouseMode = false;
  private mousePinch = false;
  private mouseLastSeen = 0;
  private readonly motionCanvas = document.createElement('canvas');
  private readonly motionContext: CanvasRenderingContext2D | null;
  private previousMotionSample: Uint8ClampedArray | null = null;
  private lastMotionSampleAt = 0;
  private lastMotionAt = 0;

  constructor(private readonly options: HandTrackerOptions) {
    this.motionCanvas.width = 24;
    this.motionCanvas.height = 14;
    this.motionContext = this.motionCanvas.getContext('2d', { willReadFrequently: true });
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('aria-hidden', 'true');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
  }

  async initialise(): Promise<void> {
    const assetRoot = new URL('mediapipe/hands/', document.baseURI).toString();
    if (!window.Hands) throw new Error('A biblioteca local MediaPipe Hands não foi carregada.');
    this.hands = new window.Hands({ locateFile: (file: string) => `${assetRoot}${file}` });
    this.hands.setOptions({
      selfieMode: false,
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    this.hands.onResults(this.handleResults);
    await this.hands.initialize();
  }

  async startCamera(): Promise<void> {
    if (!this.hands) await this.initialise();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.loop();
  }


  startMouseSimulation(): void {
    this.mouseMode = true;
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.hands) void this.hands.close();
    this.hands = null;
    this.video.remove();
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }

  getPresenceSignal(recentSeconds = 4): boolean {
    const now = performance.now();
    return this.latest.present
      || (this.mouseMode && now - this.mouseLastSeen < recentSeconds * 1000)
      || now - this.lastMotionAt < recentSeconds * 1000;
  }

  getInput(): HandInput {
    const current = this.latest;
    if (current.pinchStarted || current.pinchEnded) {
      this.latest = { ...current, pinchStarted: false, pinchEnded: false };
    }
    return current;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.animationFrame = requestAnimationFrame(this.loop);
    if (!this.hands || this.busy || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const now = performance.now();
    this.sampleMotion(now);
    const minimumInterval = 1000 / Math.max(8, this.options.detectionFps);
    if (now - this.lastDetectionAt < minimumInterval || this.video.currentTime === this.lastVideoTime) return;
    this.lastDetectionAt = now;
    this.lastVideoTime = this.video.currentTime;
    this.busy = true;
    void this.hands.send({ image: this.video }).catch(() => {
      this.latest = { ...EMPTY_INPUT, timestampMs: performance.now() };
    }).finally(() => {
      this.busy = false;
    });
  };



  private sampleMotion(now: number): void {
    if (!this.motionContext || now - this.lastMotionSampleAt < 360 || this.video.videoWidth < 1) return;
    this.lastMotionSampleAt = now;
    try {
      this.motionContext.drawImage(this.video, 0, 0, this.motionCanvas.width, this.motionCanvas.height);
      const sample = this.motionContext.getImageData(0, 0, this.motionCanvas.width, this.motionCanvas.height).data;
      if (this.previousMotionSample) {
        let changed = 0;
        let totalDifference = 0;
        for (let index = 0; index < sample.length; index += 4) {
          const current = ((sample[index] ?? 0) + (sample[index + 1] ?? 0) + (sample[index + 2] ?? 0)) / 3;
          const previous = ((this.previousMotionSample[index] ?? 0) + (this.previousMotionSample[index + 1] ?? 0) + (this.previousMotionSample[index + 2] ?? 0)) / 3;
          const difference = Math.abs(current - previous);
          totalDifference += difference;
          if (difference > 22) changed += 1;
        }
        const pixels = sample.length / 4;
        if (changed / pixels > 0.045 && totalDifference / pixels > 7.5) this.lastMotionAt = now;
      }
      this.previousMotionSample = new Uint8ClampedArray(sample);
    } catch {
      // O sinal de presença é complementar; uma falha não afeta a deteção da mão.
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.mouseMode) return;
    const now = performance.now();
    const rawCursor = {
      x: Math.min(1, Math.max(0, event.clientX / Math.max(window.innerWidth, 1))),
      y: Math.min(1, Math.max(0, event.clientY / Math.max(window.innerHeight, 1))),
    };
    const smoothed = this.smoother.push(rawCursor, now);
    this.mouseLastSeen = now;
    this.latest = {
      present: true,
      cursor: smoothed.position,
      rawCursor,
      velocity: smoothed.velocity,
      landmarks: [],
      pinch: this.mousePinch,
      pinchStarted: false,
      pinchEnded: false,
      pinchRatio: this.mousePinch ? 0.35 : 1,
      confidence: 1,
      timestampMs: now,
    };
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.mouseMode) return;
    this.mousePinch = true;
    this.handlePointerMove(event);
    this.latest = { ...this.latest, pinch: true, pinchStarted: true, pinchEnded: false, pinchRatio: 0.35 };
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.mouseMode) return;
    this.mousePinch = false;
    this.handlePointerMove(event);
    this.latest = { ...this.latest, pinch: false, pinchStarted: false, pinchEnded: true, pinchRatio: 1 };
  };

  private handleResults = (result: Results): void => {
    const now = performance.now();
    const landmarks = result.multiHandLandmarks[0];
    if (!landmarks) {
      this.previousPinch = false;
      this.smoother.reset();
      this.latest = { ...EMPTY_INPUT, timestampMs: now };
      return;
    }

    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    if (!indexTip || !thumbTip || !wrist || !middleMcp) return;

    const rawCursor = {
      x: this.options.mirrored ? 1 - indexTip.x : indexTip.x,
      y: indexTip.y,
    };
    const normalizedLandmarks = landmarks.map((landmark) => ({
      x: this.options.mirrored ? 1 - landmark.x : landmark.x,
      y: landmark.y,
      z: landmark.z ?? 0,
    }));
    const smoothed = this.smoother.push(rawCursor, now);
    const palmSize = Math.max(this.distance(wrist, middleMcp), 0.035);
    const pinchRatio = this.distance(indexTip, thumbTip) / palmSize;
    const pinch = this.previousPinch ? pinchRatio < 0.58 : pinchRatio < 0.48;
    const confidence = result.multiHandedness[0]?.score ?? 1;

    this.latest = {
      present: true,
      cursor: this.clampVec(smoothed.position),
      rawCursor: this.clampVec(rawCursor),
      velocity: smoothed.velocity,
      landmarks: normalizedLandmarks.map((landmark) => ({
        x: Math.min(1, Math.max(0, landmark.x)),
        y: Math.min(1, Math.max(0, landmark.y)),
        z: landmark.z,
      })),
      pinch,
      pinchStarted: pinch && !this.previousPinch,
      pinchEnded: !pinch && this.previousPinch,
      pinchRatio,
      confidence,
      timestampMs: now,
    };
    this.previousPinch = pinch;
  };

  private distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private clampVec(value: Vec2): Vec2 {
    return {
      x: Math.min(1, Math.max(0, value.x)),
      y: Math.min(1, Math.max(0, value.y)),
    };
  }
}
