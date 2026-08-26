import * as THREE from 'three';
import type { GameData } from '../../data/games';

export type EnvironmentKind = 'compatibility' | 'ideas' | 'boundaries' | 'constellation' | 'relic';

export interface WorldTheme {
  index: number;
  kind: EnvironmentKind;
  accent: THREE.Color;
  secondary: THREE.Color;
  background: THREE.Color;
  fog: THREE.Color;
  particleMode: number;
  particleDensity: number;
  lightEnergy: number;
}

export function createWorldTheme(index: number, game: GameData): WorldTheme {
  const profile = game.profile;
  const background = new THREE.Color(profile.background);
  return {
    index,
    kind: profile.environment,
    accent: new THREE.Color(game.accent),
    secondary: new THREE.Color(profile.secondary),
    background,
    fog: background.clone().lerp(new THREE.Color(game.accent), game.secret ? 0.075 : 0.055),
    particleMode: profile.particleMode,
    particleDensity: profile.particleDensity,
    lightEnergy: profile.lightEnergy,
  };
}
