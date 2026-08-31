import { loaderBase } from './loaderAssets';
import { appImpactAudio, playAppImpact } from '../audio/appImpactAudio';
import { connectLoaderImpactSound } from './LoaderImpactSound';

// Single shared instance: the loader starts before the large WebGL chunk.
interface LoaderRuntime {
  root: HTMLElement;
  setProgress(value: number): void;
  ready(): Promise<void>;
  complete(): Promise<void>;
  fail(title: string, message: string): void;
  destroy(): void;
}
let runtime: LoaderRuntime | null = null;
let initialization: Promise<void> | null = null;
let disconnectImpactSound: (() => void) | null = null;
export function initializeForgeLoader(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    appImpactAudio.prepare();
    const base = loaderBase;
    const moduleUrl = new URL('wanderhaym-loader.js?v=1.0.2', base).href;
    const { WanderhaymForgeLoader } = await import(/* @vite-ignore */ moduleUrl);
    runtime = new WanderhaymForgeLoader({ assetBase: new URL('assets/', base).href, soundVolume: 0 }) as LoaderRuntime;
    disconnectImpactSound = connectLoaderImpactSound(
      runtime.root,
      () => playAppImpact('loader', 0.075),
      () => appImpactAudio.stopPending(),
    );
    runtime.root.id = 'loader';
    runtime.root.dataset.loaderVersion = '1.0.2';
    document.getElementById('loaderBootstrap')?.remove();
  })();
  return initialization;
}
// Preserve the Experience contract without creating a second animation.
export class ForgeLoader {
  private readonly instance: LoaderRuntime;
  constructor(_root: HTMLElement) {
    if (!runtime) throw new Error('Wanderhaym loader has not been initialized');
    this.instance = runtime;
  }
  setProgress(value: number): void { this.instance.setProgress(value); }
  ready(): Promise<void> { return this.instance.ready(); }
  complete(): Promise<void> { return this.instance.complete(); }
  fail(title: string, message: string): void { disconnectImpactSound?.(); this.instance.fail(title, message); }
  destroy(): void { disconnectImpactSound?.(); this.instance.destroy(); }
}
export function failForgeStartup(error: unknown): void {
  console.error('Could not start Wanderhaym', error);
  disconnectImpactSound?.();
  if (runtime) {
    runtime.fail('КУЗНЯ ОСТАНОВЛЕНА', 'Не удалось открыть мир. Проверь соединение и повтори.');
    return;
  }
  const fallback = document.getElementById('loaderBootstrap');
  const status = fallback?.querySelector('[data-boot-status]');
  if (status) status.textContent = 'НЕ УДАЛОСЬ ЗАГРУЗИТЬ САЙТ';
  if (fallback && !fallback.querySelector('button')) {
    const retry = document.createElement('button');
    retry.textContent = 'ПОВТОРИТЬ';
    retry.type = 'button';
    retry.addEventListener('click', () => location.reload());
    fallback.append(retry);
  }
}
