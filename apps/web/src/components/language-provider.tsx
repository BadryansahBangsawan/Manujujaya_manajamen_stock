import * as React from "react";

type Language = "id" | "en";

type LanguageContextValue = {
  language: Language;
  setLanguage: (next: Language) => void;
};

const STORAGE_KEY = "manujujaya-language";

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

function applyLanguageToDocument(language: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "id" ? "id-ID" : "en-US";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>("id");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLanguage = window.localStorage.getItem(STORAGE_KEY);
    if (savedLanguage === "id" || savedLanguage === "en") {
      setLanguageState(savedLanguage);
      applyLanguageToDocument(savedLanguage);
      return;
    }
    applyLanguageToDocument("id");
  }, []);

  const setLanguage = React.useCallback((next: Language) => {
    setLanguageState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    applyLanguageToDocument(next);
  }, []);

  const value = React.useMemo<LanguageContextValue>(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
