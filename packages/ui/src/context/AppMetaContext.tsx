// packages/ui/src/context/AppMetaContext.tsx
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface AppMeta {
  version: string;
}

const AppMetaContext = createContext<AppMeta | null>(null);

export function AppMetaProvider({
  version,
  children,
}: AppMeta & { children: ReactNode }) {
  return (
    <AppMetaContext.Provider value={{ version }}>
      {children}
    </AppMetaContext.Provider>
  );
}

export function useAppMeta(): AppMeta {
  const ctx = useContext(AppMetaContext);
  if (!ctx) throw new Error('useAppMeta must be used within <AppMetaProvider>');
  return ctx;
}
