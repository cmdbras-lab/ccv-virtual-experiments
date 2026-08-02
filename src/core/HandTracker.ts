import type { Hands as HandsType, NormalizedLandmark, Results } from '@mediapipe/hands';
import { InputSmoother } from './InputSmoother.js';
import type { HandInput, Vec2 } from './types.js';

type PoseLandmark = { x: number; y: number; z?: number; visibility?: number };
type PoseResults = { poseLandmarks?: PoseLandmark[] };
type PoseInstance = {
  setOptions(options: Record<string, unknown>): void;
  onResults(callback: (results: PoseResults) => void): void;
  initialize(): Promise<void>;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): Promise<void> | void;
};
type PoseConstructor = new (config: { locateFile: (file: string) => string }) => PoseInstance;

declare global {
  interface Window {
    Hands: typeof HandsType;
    Pose?: PoseConstructor;
  }
}

type PoseJoint =
  | 'nose'
  | 'leftShoulder' | 'rightShoulder'
  | 'leftElbow' | 'rightElbow'
  | 'leftWrist' | 'rightWrist'
  | 'leftHip' | 'rightHip'
  | 'leftKnee' | 'rightKnee'
  | 'leftAnkle' | 'rightAnkle';

type PresenceFigure = {
  center: Vec2;
  spread: Vec2;
  leftHand?: Vec2;
  rightHand?: Vec2;
  joints?: Partial<Record<PoseJoint, Vec2>>;
  source?: 'pose' | 'motion' | 'mouse';
};

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
  private pose: PoseInstance | null = null;
  private poseEnabled = false;
  private poseInitialising = false;
  private poseBusy = false;
  private latestPoseFigure: PresenceFigure | null = null;
  private lastPoseAt = 0;
  private lastPoseDetectionAt = 0;
  private lastPoseVideoTime = -1;

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
  private lastMotionFigure: PresenceFigure | null = null;

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

  private async initialisePose(): Promise<void> {
    if (this.pose || this.poseInitialising || !window.Pose) return;
    this.poseInitialising = true;
    try {
      const assetRoot = new URL('mediapipe/pose/', document.baseURI).toString();
      this.pose = new window.Pose({ locateFile: (file: string) => `${assetRoot}${file}` });
      this.pose.setOptions({
        selfieMode: false,
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this.pose.onResults(this.handlePoseResults);
      await this.pose.initialize();
    } catch {
      this.pose = null;
    } finally {
      this.poseInitialising = false;
    }
  }

  async startCamera(): Promise<void> {
    if (!this.hands) await this.initialise();
    void this.initialisePose();
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

  setPoseEnabled(enabled: boolean): void {
    this.poseEnabled = enabled;
    if (enabled) void this.initialisePose();
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
    if (this.pose) void this.pose.close();
    this.hands = null;
    this.pose = null;
    this.video.remove();
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }

  getPresenceSignal(recentSeconds = 4): boolean {
    const now = performance.now();
    return this.latest.present
      || (this.poseEnabled && now - this.lastPoseAt < recentSeconds * 1000)
      || (this.mouseMode && now - this.mouseLastSeen < recentSeconds * 1000)
      || now - this.lastMotionAt < recentSeconds * 1000;
  }

  getPresenceFigure(recentSeconds = 4): PresenceFigure | null {
    const now = performance.now();
    if (this.mouseMode && now - this.mouseLastSeen < recentSeconds * 1000) {
      return {
        center: { x: this.latest.cursor.x, y: Math.min(0.66, this.latest.cursor.y + 0.08) },
        spread: { x: 0.22, y: 0.5 },
        leftHand: { x: Math.max(0.08, this.latest.cursor.x - 0.14), y: Math.min(0.82, this.latest.cursor.y + 0.08) },
        rightHand: { x: this.latest.cursor.x, y: this.latest.cursor.y },
        source: 'mouse',
      };
    }
    if (this.poseEnabled && now - this.lastPoseAt < recentSeconds * 1000 && this.latestPoseFigure) return this.latestPoseFigure;
    if (now - this.lastMotionAt < recentSeconds * 1000) return this.lastMotionFigure;
    return null;
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
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const now = performance.now();
    this.sampleMotion(now);

    if (this.poseEnabled && this.pose && !this.poseBusy) {
      const poseInterval = 1000 / 12;
      if (now - this.lastPoseDetectionAt >= poseInterval && this.video.currentTime !== this.lastPoseVideoTime) {
        this.lastPoseDetectionAt = now;
        this.lastPoseVideoTime = this.video.currentTime;
        this.poseBusy = true;
        void this.pose.send({ image: this.video }).catch(() => undefined).finally(() => {
          this.poseBusy = false;
        });
      }
    }

    if (!this.hands || this.busy) return;
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
        let sumX = 0;
        let sumY = 0;
        let minX = this.motionCanvas.width;
        let minY = this.motionCanvas.height;
        let maxX = 0;
        let maxY = 0;
        let leftCount = 0;
        let rightCount = 0;
        let leftSumX = 0;
        let leftSumY = 0;
        let rightSumX = 0;
        let rightSumY = 0;
        for (let index = 0; index < sample.length; index += 4) {
          const current = ((sample[index] ?? 0) + (sample[index + 1] ?? 0) + (sample[index + 2] ?? 0)) / 3;
          const previous = ((this.previousMotionSample[index] ?? 0) + (this.previousMotionSample[index + 1] ?? 0) + (this.previousMotionSample[index + 2] ?? 0)) / 3;
          const difference = Math.abs(current - previous);
          totalDifference += difference;
          if (difference > 22) {
            changed += 1;
            const pixelIndex = index / 4;
            const x = pixelIndex % this.motionCanvas.width;
            const y = Math.floor(pixelIndex / this.motionCanvas.width);
            sumX += x;
            sumY += y;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (y <= this.motionCanvas.height * 0.82) {
              if (x < this.motionCanvas.width * 0.5) {
                leftCount += 1;
                leftSumX += x;
                leftSumY += y;
              } else {
                rightCount += 1;
                rightSumX += x;
                rightSumY += y;
              }
            }
          }
        }
        const pixels = sample.length / 4;
        if (changed / pixels > 0.045 && totalDifference / pixels > 7.5) {
          this.lastMotionAt = now;
          if (changed > 0) {
            const centerX = (sumX / changed + 0.5) / this.motionCanvas.width;
            const centerY = (sumY / changed + 0.5) / this.motionCanvas.height;
            const spreadX = Math.max(0.18, Math.min(0.42, ((maxX - minX + 1) / this.motionCanvas.width) * 1.55));
            const spreadY = Math.max(0.34, Math.min(0.72, ((maxY - minY + 1) / this.motionCanvas.height) * 1.7));
            const leftHand = leftCount >= 3
              ? { x: (leftSumX / leftCount + 0.5) / this.motionCanvas.width, y: (leftSumY / leftCount + 0.5) / this.motionCanvas.height }
              : undefined;
            const rightHand = rightCount >= 3
              ? { x: (rightSumX / rightCount + 0.5) / this.motionCanvas.width, y: (rightSumY / rightCount + 0.5) / this.motionCanvas.height }
              : undefined;
            this.lastMotionFigure = {
              center: { x: centerX, y: centerY },
              spread: { x: spreadX, y: spreadY },
              leftHand,
              rightHand,
              source: 'motion',
            };
          }
        }
      }
      this.previousMotionSample = new Uint8ClampedArray(sample);
    } catch {
      // O sinal de presença é complementar; uma falha não afeta a deteção da mão.
    }
  }

  private handlePoseResults = (result: PoseResults): void => {
    const landmarks = result.poseLandmarks;
    if (!landmarks || landmarks.length < 29) return;
    const jointIndex: Record<PoseJoint, number> = {
      nose: 0,
      leftShoulder: 11, rightShoulder: 12,
      leftElbow: 13, rightElbow: 14,
      leftWrist: 15, rightWrist: 16,
      leftHip: 23, rightHip: 24,
      leftKnee: 25, rightKnee: 26,
      leftAnkle: 27, rightAnkle: 28,
    };
    const previousJoints = this.latestPoseFigure?.joints ?? {};
    const joints: Partial<Record<PoseJoint, Vec2>> = {};
    for (const [name, index] of Object.entries(jointIndex) as [PoseJoint, number][]) {
      const landmark = landmarks[index];
      if (!landmark || (landmark.visibility ?? 1) < 0.25) continue;
      const point = this.clampVec({ x: this.options.mirrored ? 1 - landmark.x : landmark.x, y: landmark.y });
      joints[name] = this.smoothPoint(previousJoints[name], point, 0.42);
    }
    const ls = joints.leftShoulder;
    const rs = joints.rightShoulder;
    const lh = joints.leftHip;
    const rh = joints.rightHip;
    if (!ls || !rs || !lh || !rh) return;

    const center = this.smoothPoint(this.latestPoseFigure?.center, {
      x: (ls.x + rs.x + lh.x + rh.x) / 4,
      y: (ls.y + rs.y + lh.y + rh.y) / 4,
    }, 0.38);
    const shoulderSpan = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    const ankleY = Math.max(joints.leftAnkle?.y ?? 0, joints.rightAnkle?.y ?? 0);
    const noseY = joints.nose?.y ?? Math.min(ls.y, rs.y) - shoulderSpan * 0.55;
    const estimatedHeight = ankleY > 0 ? ankleY - noseY : Math.hypot(center.x - ((ls.x + rs.x) / 2), center.y - ((ls.y + rs.y) / 2)) * 4.2;
    const spread = {
      x: Math.max(0.16, Math.min(0.45, shoulderSpan * 1.9)),
      y: Math.max(0.35, Math.min(0.86, estimatedHeight)),
    };

    this.latestPoseFigure = {
      center,
      spread,
      leftHand: joints.leftWrist,
      rightHand: joints.rightWrist,
      joints,
      source: 'pose',
    };
    this.lastPoseAt = performance.now();
  };

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

  private smoothPoint(previous: Vec2 | undefined, next: Vec2, alpha: number): Vec2 {
    if (!previous) return next;
    return {
      x: previous.x + (next.x - previous.x) * alpha,
      y: previous.y + (next.y - previous.y) * alpha,
    };
  }

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
