import React, { createContext, useContext, useState, useEffect } from 'react';

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

interface Settings {
  agreementName: string;
  defaultYearlyHours: number;
  defaultWeeklyTeachingHours: number;
  defaultAttendanceHours: number;
  state: string; 
  publicHolidays: PublicHoliday[];
}

const DEFAULT_SETTINGS: Settings = {
  agreementName: 'Custom / Other',
  defaultYearlyHours: 1000,
  defaultWeeklyTeachingHours: 25,
  defaultAttendanceHours: 38,
  state: 'VIC',
  publicHolidays: []
};

const SettingsContext = createContext<{
  settings: Settings;
  updateSettings: (newSettings: Settings) => void;
}>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
});

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const saved = localStorage.getItem('app_settings');
    if (saved) {
      // FIX: We merge the saved data with DEFAULT_SETTINGS.
      // This ensures that if new fields (like publicHolidays) are added to the code,
      // they won't be undefined even if they are missing from LocalStorage.
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    }
  }, []);

  const updateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem('app_settings', JSON.stringify(newSettings));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);