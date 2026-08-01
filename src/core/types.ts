export type Vec2 = { x: number; y: number };

export interface HandLandmark extends Vec2 {
  z: number;
}

export interface HandInput {
  present: boolean;
  cursor: Vec2;
  rawCursor: Vec2;
  velocity: Vec2;
  landmarks: HandLandmark[];
  pinch: boolean;
  pinchStarted: boolean;
  pinchEnded: boolean;
  pinchRatio: number;
  confidence: number;
  timestampMs: number;
}

export interface AppConfig {
  schoolName: string;
  installationTitle: string;
  cameraMirrored: boolean;
  handDetectionFps: number;
  idleResetSeconds: number;
  autonomous: {
    autoStartCamera: boolean;
    presenceRecentSeconds: number;
    greetingCooldownSeconds: number;
    voiceEnabled: boolean;
  };
  branding: {
    schoolMark: string;
    scienceMark: string;
    coordinator: string;
    developmentCredit: string;
  };
  menu: {
    dwellSeconds: number;
    initialDelaySeconds: number;
    stableRadiusPx: number;
    cardInsetFraction: number;
    allowPinchShortcut: boolean;
  };
  leaderboard: {
    globalLimit: number;
    displayLimit: number;
    nameLength: number;
    nameEntrySeconds: number;
  };
  orbit: {
    challengeSeconds: number;
    maximumFlightSeconds: number;
    launchVelocityScale: number;
    gravityStrength: number;
    targetRadiusFraction: number;
    assistanceStrength: number;
    successQualityThreshold: number;
    showHandSkeleton: boolean;
    showTrajectoryPreview: boolean;
    successObservationOrbits: number;
    observationSpeedMultiplier: number;
    starRadiusFraction: number;
    planetRadiusFraction: number;
    planetMassRelative: number;
  };
  molecules: {
    successObservationSeconds: number;
  };
  laser: {
    aimHoldSeconds: number;
    observationSeconds: number;
    quizDwellSeconds: number;
  };
  waves: {
    successHoldSeconds: number;
    targetAmplitude: number;
  };
  vectorMaze: {
    maximumSeconds: number;
    accelerationScale: number;
    dragPerSecond: number;
    maximumSpeedFraction: number;
    massFactor: number;
    controlResponsePerSecond: number;
  };
  gravitationalDuel: {
    shotsPerPlayer: number;
    planetLives: number;
    maximumFlightSeconds: number;
    launchVelocityScale: number;
    gravityStrength: number;
    trajectoryPreviewSeconds: number;
    captureRadiusMultiplier: number;
    captureHoldSeconds: number;
    captureObservationSeconds: number;
    turnPauseSeconds: number;
    assistanceStrength: number;
    showTrajectoryPreview: boolean;
    showForceComponents: boolean;
  };
}

export interface ExperienceResult {
  score: number;
  title: string;
  explanation: string;
  details: string[];
}
