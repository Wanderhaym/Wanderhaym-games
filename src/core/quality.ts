export type QualityPreset = 'low' | 'medium' | 'high';

export interface QualitySettings {
  preset: QualityPreset;
  pixelRatio: number;
  bloom: boolean;
  shadows: boolean;
  sparks: number;
  stars: number;
  fluidSize: number;
  antialias: boolean;
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

export function detectQuality(): QualitySettings {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = navigator as NavigatorWithMemory;
  const memory = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mobile = matchMedia('(max-width: 900px)').matches;
  const weak = memory <= 4 || cores <= 4;

  if (reducedMotion || (mobile && weak)) {
    return {
      preset: 'low',
      pixelRatio: Math.min(devicePixelRatio, 1.15),
      bloom: false,
      shadows: false,
      sparks: 42,
      stars: 280,
      fluidSize: 72,
      antialias: false,
    };
  }

  if (mobile || weak) {
    return {
      preset: 'medium',
      pixelRatio: Math.min(devicePixelRatio, 1.45),
      bloom: true,
      shadows: false,
      sparks: 144,
      stars: 520,
      fluidSize: 128,
      antialias: true,
    };
  }

  return {
    preset: 'high',
    pixelRatio: Math.min(devicePixelRatio, 1.8),
    bloom: true,
    shadows: true,
    sparks: 240,
    stars: 850,
    fluidSize: 192,
    antialias: true,
  };
}
