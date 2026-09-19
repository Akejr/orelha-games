import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAudioUnlock } from '@/audio/useAudio';
import { ToastProvider } from '@/components/ui/Toast';
import { RoomProvider } from '@/multiplayer/RoomProvider';
import { CreateRoomPage } from '@/pages/CreateRoomPage';
import { GameDetailPage } from '@/pages/GameDetailPage';
import { GamesPage } from '@/pages/GamesPage';
import { HomePage } from '@/pages/HomePage';
import { HowItWorksPage } from '@/pages/HowItWorksPage';
import { JoinRoomPage } from '@/pages/JoinRoomPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RoomPage } from '@/pages/RoomPage';
import { ProfileProvider } from './ProfileContext';

function ScrollToTop(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function AudioGate(): null {
  useAudioUnlock();
  return null;
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <ToastProvider>
          <RoomProvider>
            <AudioGate />
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/jogos" element={<GamesPage />} />
              <Route path="/jogos/:gameId" element={<GameDetailPage />} />
              <Route path="/criar" element={<CreateRoomPage />} />
              <Route path="/entrar" element={<JoinRoomPage />} />
              <Route path="/sala/:code" element={<RoomPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              <Route path="/como-funciona" element={<HowItWorksPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </RoomProvider>
        </ToastProvider>
      </ProfileProvider>
    </BrowserRouter>
  );
}
