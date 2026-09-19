import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  randomAvatar,
  randomPlayerName,
  sanitizeName,
  type AvatarId,
} from '@shared/index';
import { readJson, writeJson } from '@/utils/storage';

export interface Profile {
  name: string;
  avatar: AvatarId;
  /** contadores locais, só para dar cara de progressão no perfil */
  matches: number;
  wins: number;
}

interface ProfileApi {
  profile: Profile;
  setName: (name: string) => void;
  setAvatar: (avatar: AvatarId) => void;
  randomize: () => void;
  registerResult: (won: boolean) => void;
}

const KEY = 'orelha.profile';

function initialProfile(): Profile {
  const fallback: Profile = {
    name: randomPlayerName(),
    avatar: randomAvatar(),
    matches: 0,
    wins: 0,
  };
  const stored = readJson<Profile>(KEY, fallback);
  return { ...stored, name: sanitizeName(stored.name) };
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }): JSX.Element {
  const [profile, setProfile] = useState<Profile>(initialProfile);

  const persist = useCallback((next: Profile) => {
    setProfile(next);
    writeJson(KEY, next);
  }, []);

  const api = useMemo<ProfileApi>(
    () => ({
      profile,
      setName: (name) => persist({ ...profile, name: name.slice(0, 16) }),
      setAvatar: (avatar) => persist({ ...profile, avatar }),
      randomize: () =>
        persist({ ...profile, name: randomPlayerName(), avatar: randomAvatar() }),
      registerResult: (won) =>
        persist({
          ...profile,
          matches: profile.matches + 1,
          wins: profile.wins + (won ? 1 : 0),
        }),
    }),
    [persist, profile],
  );

  return <ProfileContext.Provider value={api}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileApi {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile precisa do ProfileProvider');
  return context;
}
