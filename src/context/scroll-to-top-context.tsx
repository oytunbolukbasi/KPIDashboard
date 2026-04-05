import React, { createContext, useContext, useRef, useCallback } from 'react';

type Listener = () => void;
type ScrollToTopContextType = {
  registerListener: (screen: string, fn: Listener) => () => void;
  emit: (screen: string) => void;
};

const ScrollToTopContext = createContext<ScrollToTopContextType | null>(null);

export function ScrollToTopProvider({ children }: { children: React.ReactNode }) {
  const listeners = useRef<Record<string, Listener[]>>({});

  const registerListener = useCallback((screen: string, fn: Listener) => {
    if (!listeners.current[screen]) listeners.current[screen] = [];
    listeners.current[screen].push(fn);
    return () => {
      listeners.current[screen] = listeners.current[screen].filter((l) => l !== fn);
    };
  }, []);

  const emit = useCallback((screen: string) => {
    listeners.current[screen]?.forEach((fn) => fn());
  }, []);

  return (
    <ScrollToTopContext.Provider value={{ registerListener, emit }}>
      {children}
    </ScrollToTopContext.Provider>
  );
}

export function useScrollToTopEmitter() {
  const ctx = useContext(ScrollToTopContext);
  if (!ctx) throw new Error('ScrollToTopProvider missing');
  return ctx.emit;
}

export function useScrollToTopListener(screen: string, fn: Listener) {
  const ctx = useContext(ScrollToTopContext);
  React.useEffect(() => {
    if (!ctx) return;
    return ctx.registerListener(screen, fn);
  }, [ctx, screen, fn]);
}
