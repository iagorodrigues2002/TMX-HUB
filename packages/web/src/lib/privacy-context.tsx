'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type PrivacyContextValue = {
  isPrivate: boolean;
  togglePrivacy: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);
const STORAGE_KEY = 'tmx-hub-privacy-mode';

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    setIsPrivate(window.localStorage.getItem(STORAGE_KEY) === 'on');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tmxPrivacy = isPrivate ? 'on' : 'off';
    window.localStorage.setItem(STORAGE_KEY, isPrivate ? 'on' : 'off');
  }, [isPrivate]);

  const togglePrivacy = () => setIsPrivate((current) => !current);

  return (
    <PrivacyContext.Provider value={{ isPrivate, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error('usePrivacy must be used inside PrivacyProvider');
  return context;
}
