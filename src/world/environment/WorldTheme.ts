import * as THREE from 'three';
import type { GameData } from '../../data/games';

export type EnvironmentKind = 'compatibility' | 'ideas' | 'boundaries' | 'constellation';

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

const SECONDARY = [
  0x76d9ff,
  0xff5d72,
  0xffd46b,
  0x75ffe0,
  0x8f7cff,
  0xff6fd8,
  0xffe29a,
  0xff7b58,
  0xffb03a,
  0x5ce7ff,
];

const BACKGROUNDS = [
  0x09040d,
  0x100704,
  0x0e0308,
  0x02100d,
  0x020b12,
  0x070515,
  0x100c03,
  0x100604,
  0x110302,
  0x020e0d,
];

export function createWorldTheme(index: number, game: GameData): WorldTheme {
  const kind: EnvironmentKind = index === 0
    ? 'compatibility'
    : index === 1
      ? 'ideas'
      : index === 6
        ? 'boundaries'
      : 'constellation';
  const background = new THREE.Color(BACKGROUNDS[index % BACKGROUNDS.length]);
  return {
    index,
    kind,
    accent: new THREE.Color(game.accent),
    secondary: new THREE.Color(SECONDARY[index % SECONDARY.length]),
    background,
    fog: background.clone().lerp(new THREE.Color(game.accent), 0.055),
    particleMode: kind === 'compatibility' ? 0 : kind === 'ideas' ? 1 : 2 + (index % 3),
    particleDensity: kind === 'compatibility'
      ? 0.26
      : kind === 'ideas'
        ? 0.28
        : kind === 'boundaries'
          ? 0.16
          : 0.18,
    lightEnergy: kind === 'compatibility'
      ? 0.65
      : kind === 'ideas'
        ? 0.62
        : kind === 'boundaries'
          ? 0.38
          : 0.42,
  };
}
