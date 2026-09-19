import { useState } from 'react';
import { sound } from '@/audio/SoundManager';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/** Convite: código gigante, link pronto e atalho de compartilhamento. */
export function InviteModal({
  open,
  onClose,
  code,
  roomName,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  roomName: string;
}): JSX.Element {
  const toast = useToast();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const link = `${window.location.origin}/entrar?codigo=${code}`;
  const message = `Bora jogar no Orelha Games? Sala ${code}: ${link}`;

  const copy = async (value: string, kind: 'code' | 'link'): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      sound.play('copy');
      toast.success(kind === 'code' ? 'Código copiado!' : 'Link copiado!');
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error('Não deu para copiar. Selecione e copie na mão.');
    }
  };

  const share = async (): Promise<void> => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Orelha Games', text: message, url: link });
        return;
      } catch {
        /* usuário cancelou */
      }
    }
    void copy(message, 'link');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chame a galera"
      subtitle={`${roomName} · até 5 jogadores`}
      size="md"
    >
      <div className="space-y-5">
        <div className="rounded-3xl bg-gradient-to-br from-grape-500 to-bubble-500 p-1">
          <div className="rounded-[1.35rem] bg-white/95 p-5 text-center">
            <p className="label-caps">código da sala</p>
            <p className="mt-2 font-display text-5xl font-extrabold tracking-[0.28em] text-grape-700 sm:text-6xl">
              {code}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => void copy(code, 'code')}
            >
              {copied === 'code' ? 'copiado ✓' : 'copiar código'}
            </Button>
          </div>
        </div>

        <div>
          <p className="label-caps mb-2">link direto</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-2xl border-2 border-grape-100 bg-white px-3 py-2.5 text-sm font-bold text-ink-soft outline-none focus:border-grape-300"
              aria-label="Link da sala"
            />
            <Button variant="secondary" onClick={() => void copy(link, 'link')}>
              {copied === 'link' ? '✓' : 'copiar'}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => void share()} block>
            Compartilhar
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => sound.play('click')}
            className="grid h-11 place-items-center rounded-2xl bg-mint-400 font-display text-[15px] font-extrabold text-[#053B2C] shadow-pop transition hover:-translate-y-[2px]"
          >
            Mandar no WhatsApp
          </a>
        </div>

        <p className="text-center text-xs font-bold text-ink-mute">
          Quem tem o código entra direto. A sala fica viva enquanto alguém estiver nela.
        </p>
      </div>
    </Modal>
  );
}
