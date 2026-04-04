import React, { createContext, useContext, useEffect, useState } from 'react';
import { Storage } from '@/lib/storage';

type OnboardingContextType = {
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [onboardingCompleted, setOnboardingCompletedState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const completed = Storage.getItem('onboardingCompleted') === 'true';
      setOnboardingCompletedState(completed);
    } catch (error) {
      console.error('Error reading onboarding status:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const setOnboardingCompleted = async (completed: boolean) => {
    try {
      Storage.setItem('onboardingCompleted', completed.toString());
      setOnboardingCompletedState(completed);
    } catch (error) {
      console.error('Error writing onboarding status:', error);
    }
  };

  if (!isLoaded) {
    return null; // Or a splash screen
  }

  return (
    <OnboardingContext.Provider value={{ onboardingCompleted, setOnboardingCompleted }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return context;
};
