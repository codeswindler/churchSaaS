import {
  createContext,
  type ReactNode,
  useContext,
} from 'react';

interface PageActionsContextValue {
  setPageActions: (actions: ReactNode) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({
  children,
  setPageActions,
}: {
  children: ReactNode;
  setPageActions: (actions: ReactNode) => void;
}) {
  return (
    <PageActionsContext.Provider value={{ setPageActions }}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageActions() {
  const context = useContext(PageActionsContext);
  if (!context) {
    throw new Error('usePageActions must be used inside AppShell');
  }
  return context;
}
