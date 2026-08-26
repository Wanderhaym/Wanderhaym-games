import bridge from '@vkontakte/vk-bridge';

export type HostPlatformKind = 'ok' | 'vk' | 'web';

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

const params = new URLSearchParams(location.search);
const DEFAULT_OK_COMMUNITY_URL = 'https://ok.ru/group/70000050799953';

function detectPlatform(): HostPlatformKind {
  const referrerHost = (() => {
    try {
      return document.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      return '';
    }
  })();
  if (params.get('vk_client') === 'ok' || referrerHost === 'ok.ru' || referrerHost.endsWith('.ok.ru')) {
    return 'ok';
  }
  if (
    params.has('vk_app_id')
    || bridge.isEmbedded()
    || typeof window.ReactNativeWebView?.postMessage === 'function'
  ) {
    return 'vk';
  }
  return 'web';
}

function approvedOkUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== 'ok.ru' && !url.hostname.endsWith('.ok.ru'))) return null;
    return url.href;
  } catch {
    return null;
  }
}

export class HostPlatform {
  readonly kind = detectPlatform();
  private readonly nativeClient = bridge.isWebView()
    || typeof window.ReactNativeWebView?.postMessage === 'function';
  private initPromise: Promise<void> | null = null;

  localStorageKey(base: string): string {
    return `${base}.${this.kind}`;
  }

  cloudStorageKey(base: string): string {
    return `wh.${this.kind}.${base}`;
  }

  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    document.documentElement.dataset.hostPlatform = this.kind;
    if (this.kind === 'web' && !bridge.isEmbedded()) {
      this.initPromise = Promise.resolve();
      return this.initPromise;
    }
    this.initPromise = this.withTimeout(
      bridge.send('VKWebAppInit').then(() => undefined),
      1800,
    ).catch(() => undefined);
    return this.initPromise;
  }

  configureLinks(home: HTMLAnchorElement, support: HTMLAnchorElement): void {
    if (this.kind !== 'ok') return;
    const communityUrl = approvedOkUrl(import.meta.env.VITE_OK_COMMUNITY_URL)
      ?? DEFAULT_OK_COMMUNITY_URL;
    const supportUrl = approvedOkUrl(import.meta.env.VITE_OK_SUPPORT_URL)
      ?? communityUrl;
    this.configureOkAnchor(home, communityUrl, 'Wanderhaym в Одноклассниках', false);
    this.configureOkAnchor(support, supportUrl, 'Поддержка Wanderhaym в Одноклассниках', true);
  }

  async openMiniApp(appId: number): Promise<boolean> {
    const vkUrl = `https://vk.ru/app${appId}`;
    if (this.kind === 'web' && !bridge.isEmbedded()) {
      window.open(vkUrl, '_blank', 'noopener,noreferrer');
      return true;
    }
    try {
      await bridge.send('VKWebAppOpenApp', { app_id: appId });
      return true;
    } catch {
      // Never send an OK or native VK visitor to an external browser session:
      // that violates OK moderation rules and can request VK authorization.
      if (this.kind === 'ok' || this.nativeClient) return false;
      location.href = vkUrl;
      return true;
    }
  }

  async readCloudValue(key: string): Promise<string | null> {
    if (this.kind === 'web') return null;
    try {
      const result = await this.withTimeout(
        bridge.send('VKWebAppStorageGet', { keys: [key] }),
        1800,
      );
      const item = result.keys.find((entry) => entry.key === key);
      return item?.value || null;
    } catch {
      return null;
    }
  }

  async writeCloudValue(key: string, value: string): Promise<boolean> {
    if (this.kind === 'web') return false;
    try {
      await this.withTimeout(
        bridge.send('VKWebAppStorageSet', { key, value }),
        1800,
      );
      return true;
    } catch {
      return false;
    }
  }

  private configureOkAnchor(
    anchor: HTMLAnchorElement,
    url: string | null,
    label: string,
    hideWithoutUrl: boolean,
  ): void {
    if (url) {
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.setAttribute('aria-label', label);
      return;
    }
    anchor.removeAttribute('href');
    anchor.removeAttribute('target');
    anchor.setAttribute('aria-disabled', 'true');
    anchor.hidden = hideWithoutUrl;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Bridge timeout')), timeoutMs);
      promise.then(
        (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}

export const hostPlatform = new HostPlatform();
