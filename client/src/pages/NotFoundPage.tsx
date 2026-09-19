import { AVATARS } from '@shared/index';
import { Creature } from '@/components/avatar/Creature';
import { PageShell } from '@/components/layout/PageShell';
import { ButtonLink } from '@/components/ui/Button';

export function NotFoundPage(): JSX.Element {
  return (
    <PageShell>
      <div className="container-page grid place-items-center py-20 text-center">
        <div className="max-w-md">
          <div className="mx-auto w-fit animate-bounce-soft">
            <Creature avatar={AVATARS[3].id} slot={1} size={120} expression="dizzy" label={null} />
          </div>
          <p className="mt-4 font-display text-6xl font-extrabold text-grape-500">404</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-ink">
            Essa página caiu da arena
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            O link pode estar errado ou a sala já acabou. Bora voltar para o caos?
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/" size="lg">
              Voltar para a home
            </ButtonLink>
            <ButtonLink to="/jogos" size="lg" variant="secondary">
              Ver os jogos
            </ButtonLink>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
