import { useEffect, useState } from 'react';
import { sound, type AudioSettings, type MusicMood } from './SoundManager';

/** Assina as configurações de áudio (som/música) para a UI de toggles. */
export function useAudioSettings(): {
  settings: AudioSettings;
  toggleSound: () => void;
  toggleMusic: () => void;
} {
  const [settings, setSettings] = useState<AudioSettings>(() => sound.getSettings());

  useEffect(() => sound.subscribe(setSettings), []);

  return {
    settings,
    toggleSound: () => sound.toggleSound(),
    toggleMusic: () => sound.toggleMusic(),
  };
}

/** Define a trilha da tela atual e devolve ao sair. */
export function useMusicMood(mood: MusicMood): void {
  useEffect(() => {
    sound.setMood(mood);
  }, [mood]);
}

/** Libera o AudioContext no primeiro gesto do usuário. */
export function useAudioUnlock(): void {
  useEffect(() => {
    const unlock = (): void => sound.unlock();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    for (const event of events) {
      window.addEventListener(event, unlock, { once: false, passive: true });
    }
    return () => {
      for (const event of events) window.removeEventListener(event, unlock);
    };
  }, []);
}
