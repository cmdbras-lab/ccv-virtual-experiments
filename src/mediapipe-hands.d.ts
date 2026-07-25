declare module '@mediapipe/hands' {
  export interface NormalizedLandmark { x: number; y: number; z?: number; }
  export interface Results {
    multiHandLandmarks: NormalizedLandmark[][];
    multiHandedness: Array<{ score?: number }>;
  }
  export class Hands {
    constructor(options: { locateFile(file: string): string });
    setOptions(options: Record<string, unknown>): void;
    onResults(callback: (result: Results) => void): void;
    initialize(): Promise<void>;
    send(input: { image: HTMLVideoElement }): Promise<void>;
    close(): Promise<void>;
  }
}
