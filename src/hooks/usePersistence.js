import { useState, useEffect } from 'react';
import { STORAGE_KEY } from '../constants.js';

export function usePersistence(defaultProjects, defaultSettings) {
  const [projects, setProjects] = useState(defaultProjects);
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.projects) setProjects(d.projects);
        if (d.settings) setSettings(d.settings);
      }
    } catch (e) {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, settings }));
    } catch (e) {}
  }, [projects, settings, loaded]);

  return { projects, setProjects, settings, setSettings, loaded };
}
