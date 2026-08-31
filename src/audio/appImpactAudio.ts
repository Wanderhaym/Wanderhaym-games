import { ImpactAudio } from './ImpactAudio';
import { loaderAsset } from '../ui/loaderAssets';

// One approved WAV player for the splash and the 3D world. Music stays separate.
export const appImpactAudio = new ImpactAudio(loaderAsset('hammer-hit.wav'), {
  report(state, error) {
    document.documentElement.dataset.impactAudio = state;
    if (error) document.documentElement.dataset.impactAudioError = error;
    else delete document.documentElement.dataset.impactAudioError;
  },
});

export function playAppImpact(source: 'loader' | 'world', volume: number): void {
  if (document.hidden) return;
  const data = document.documentElement.dataset;
  data.impactAudioSource = source;
  data.impactAudioAttempts = String(Number(data.impactAudioAttempts || 0) + 1);
  appImpactAudio.play(volume);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) appImpactAudio.stop();
});
window.addEventListener('pagehide', () => appImpactAudio.stop());
