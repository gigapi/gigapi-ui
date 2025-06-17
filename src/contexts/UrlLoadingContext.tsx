import { createContext, useContext, useState, type ReactNode } from 'react';

interface UrlLoadingContextType {
  isLoadingFromUrl: boolean;
  setIsLoadingFromUrl: (loading: boolean) => void;
}

const UrlLoadingContext = createContext<UrlLoadingContextType | undefined>(undefined);

export function UrlLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(false);

  return (
    <UrlLoadingContext.Provider value={{ isLoadingFromUrl, setIsLoadingFromUrl }}>
      {children}
    </UrlLoadingContext.Provider>
  );
}

export function useUrlLoading() {
  const context = useContext(UrlLoadingContext);
  if (context === undefined) {
    throw new Error('useUrlLoading must be used within a UrlLoadingProvider');
  }
  return context;
}
