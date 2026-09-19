/**
 * Camada de ambiente do portal: manchas de cor que respiram e uma malha de
 * pontos. Sem personagens flutuando de propósito — o elenco aparece nos previews,
 * na vitrine e dentro do jogo, onde tem função. Espalhado pelo fundo de todas as
 * telas, ele empurrava o produto para "site infantil".
 */
export function BackgroundFX(): JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 -top-24 h-[26rem] w-[26rem] animate-blob-morph bg-grape-300/25 blur-3xl" />
      <div className="absolute -right-20 top-16 h-[22rem] w-[22rem] animate-blob-morph bg-bubble-200/30 blur-3xl [animation-delay:-4s]" />
      <div className="absolute bottom-[-6rem] left-1/3 h-[24rem] w-[24rem] animate-blob-morph bg-sky-200/30 blur-3xl [animation-delay:-8s]" />
      <div className="absolute inset-0 dotted opacity-40" />
    </div>
  );
}
