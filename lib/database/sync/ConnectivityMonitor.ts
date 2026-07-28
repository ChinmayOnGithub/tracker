export type ConnectivityCallback = (isOnline: boolean) => void;

export class ConnectivityMonitor {
  private static instance: ConnectivityMonitor | null = null;
  private listeners: Set<ConnectivityCallback> = new Set();

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.notify(true));
      window.addEventListener('offline', () => this.notify(false));
    }
  }

  public static getInstance(): ConnectivityMonitor {
    if (!ConnectivityMonitor.instance) {
      ConnectivityMonitor.instance = new ConnectivityMonitor();
    }
    return ConnectivityMonitor.instance;
  }

  public isOnline(): boolean {
    if (typeof window === 'undefined') return false;
    return window.navigator.onLine;
  }

  public subscribe(callback: ConnectivityCallback): () => void {
    this.listeners.add(callback);
    // Execute callback immediately with current state
    callback(this.isOnline());

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(isOnline: boolean) {
    console.log(`[ConnectivityMonitor] Network status changed: ${isOnline ? 'Online' : 'Offline'}`);
    this.listeners.forEach((listener) => {
      try {
        listener(isOnline);
      } catch (err) {
        console.error('Error in connectivity listener callback:', err);
      }
    });
  }
}
