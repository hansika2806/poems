import { useEffect, useState } from 'react';
import { useSSR } from './use-ssr';

export function useDarkTheme() {
  const { isBrowser } = useSSR();
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);

  useEffect(() => {
    if (!isBrowser) return;

    const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleThemeChange() {
      setIsDarkTheme(document.documentElement.dataset.theme === 'dark');
    }

    themeMediaQuery.addEventListener('change', handleThemeChange);
    window.addEventListener('themechange', handleThemeChange);
    handleThemeChange();

    return () => {
      themeMediaQuery.removeEventListener('change', handleThemeChange);
      window.removeEventListener('themechange', handleThemeChange);
    };
  }, [isBrowser]);

  return isDarkTheme;
}
