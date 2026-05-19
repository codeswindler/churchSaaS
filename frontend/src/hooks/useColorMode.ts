import { useEffect, useState } from 'react';

export type ColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'church_saas_color_mode';
export const PUBLIC_COLOR_MODE_STORAGE_KEY = 'church_saas_public_color_mode';

export function useColorMode(
  defaultMode: ColorMode = 'light',
  storageKey = COLOR_MODE_STORAGE_KEY,
) {
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const savedMode = localStorage.getItem(storageKey);
    return savedMode === 'dark' || savedMode === 'light'
      ? savedMode
      : defaultMode;
  });

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
    localStorage.setItem(storageKey, colorMode);
  }, [colorMode, storageKey]);

  const toggleColorMode = () => {
    setColorMode((current) => (current === 'light' ? 'dark' : 'light'));
  };

  return {
    colorMode,
    isLightMode: colorMode === 'light',
    toggleColorMode,
  };
}
