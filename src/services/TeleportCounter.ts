import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref, runTransaction, type Unsubscribe } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyB2y4Rj_-Yp6l-KgDDwZOco7GpMav3OmA8',
  authDomain: 'sepnaya-reacsia.firebaseapp.com',
  projectId: 'sepnaya-reacsia',
  databaseURL: 'https://sepnaya-reacsia-default-rtdb.europe-west1.firebasedatabase.app',
  storageBucket: 'sepnaya-reacsia.firebasestorage.app',
  messagingSenderId: '854625355570',
  appId: '1:854625355570:web:e79d5039c0aded6219b92b',
};

const COUNTER_PATH = 'wanderhaymSite/teleports';

export interface TeleportCounterState {
  status: 'connecting' | 'online' | 'offline';
  total: number | null;
}

export class TeleportCounter {
  private readonly counterRef;
  private unsubscribe: Unsubscribe | null = null;
  private total: number | null = null;

  constructor() {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    this.counterRef = ref(getDatabase(app), COUNTER_PATH);
  }

  subscribe(listener: (state: TeleportCounterState) => void): () => void {
    listener({ status: 'connecting', total: this.total });
    this.unsubscribe?.();
    this.unsubscribe = onValue(
      this.counterRef,
      (snapshot) => {
        const value = snapshot.val();
        this.total = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        listener({ status: 'online', total: this.total });
      },
      () => listener({ status: 'offline', total: this.total }),
    );
    return () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
  }

  async recordTeleport(): Promise<number | null> {
    try {
      const result = await runTransaction(this.counterRef, (current) => {
        const total = typeof current === 'number' && Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
        return total + 1;
      });
      const value = result.snapshot.val();
      this.total = typeof value === 'number' ? value : this.total;
      return this.total;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
