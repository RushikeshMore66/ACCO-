"use client";

import { createContext, useContext, useState } from "react";

interface DemoModeContextValue {
  isDemoMode: boolean;
  setDemoMode: (value: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

/**
 * DemoModeProvider controls whether the application is in demo mode.
 *
 * In demo mode:
 * - Data is served from an in-memory mock store
 * - Mutations update demo state in memory only
 * - A visible banner is shown to prevent confusion with live data
 * - API failures do NOT silently fall back to mock data
 *
 * Demo mode is defaulted to true when NEXT_PUBLIC_DEMO_MODE=true or
 * when no API URL is reachable.
 */
export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setDemoMode] = useState<boolean>(
    process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  );

  return (
    <DemoModeContext.Provider value={{ isDemoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) throw new Error("useDemoMode must be used inside DemoModeProvider");
  return ctx;
}
