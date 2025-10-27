
import { useState, useEffect, useCallback } from 'react';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

export const useApiKey = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        setApiKey(storedKey);
      }
    } catch (error) {
      console.error('Could not read API key from local storage', error);
    } finally {
        setIsLoaded(true);
    }
  }, []);

  const saveApiKey = useCallback((key: string) => {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      setApiKey(key);
    } catch (error) {
      console.error('Could not save API key to local storage', error);
    }
  }, []);

  const clearApiKey = useCallback(() => {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKey(null);
    } catch (error) {
      console.error('Could not clear API key from local storage', error);
    }
  }, []);

  return { apiKey, setApiKey: saveApiKey, clearApiKey, isLoaded };
};
