import type { NetworkStatus } from "../usecases/ports";

export const browserNetworkStatus: NetworkStatus = {
  subscribe(onChange) {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  },
  isOnline: () => navigator.onLine,
};
