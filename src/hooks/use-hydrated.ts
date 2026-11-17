"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
/** False during server rendering and before hydration, true once React handles events in the browser. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
