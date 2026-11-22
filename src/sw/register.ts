/** Registers the service worker and surfaces updates to the UI. */

export const UPDATE_EVENT = 'daymark:update-ready';
let registration: ServiceWorkerRegistration | null = null;

function watch(reg: ServiceWorkerRegistration) {
  const notify = () => window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  if (reg.waiting && navigator.serviceWorker.controller) notify();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) notify();
    });
  });
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      watch(registration);
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
      });
    } catch (e) {
      console.warn('Service worker registration failed', e);
    }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !sessionStorageSafeGet('dm.updating')) return;
    reloading = true;
    sessionStorageSafeSet('dm.updating', '');
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'NAVIGATE' && typeof e.data.route === 'string') location.hash = e.data.route;
  });
}

function sessionStorageSafeGet(k: string) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return '1';
  }
}
function sessionStorageSafeSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

/** Activate a waiting update and reload. */
export function applyUpdate() {
  const w = registration?.waiting;
  if (!w) {
    location.reload();
    return;
  }
  sessionStorageSafeSet('dm.updating', '1');
  w.postMessage('SKIP_WAITING');
}

export async function checkForUpdate(): Promise<'updating' | 'current' | 'error'> {
  try {
    const reg = registration ?? (await navigator.serviceWorker?.getRegistration());
    if (!reg) return 'error';
    registration = reg;
    await reg.update();
    if (reg.installing || reg.waiting) {
      if (reg.waiting) applyUpdate();
      else
        reg.installing?.addEventListener('statechange', function () {
          if (this.state === 'installed') applyUpdate();
        });
      return 'updating';
    }
    return 'current';
  } catch {
    return 'error';
  }
}
