# Orelha Games

**Jogos simples. Caos com amigos. Diversão imediata.**

Portal de minijogos multiplayer casuais para partidas de 2 a 5 pessoas. Você cria uma sala, manda
um código de 4 letras no grupo e a rodada começa em segundos — sem download, sem cadastro, sem
tutorial.

```
Entender em segundos. Entrar com amigos sem esforço.
Jogar rápido. Rir no meio da partida. Pedir revanche na hora.
```

---

## Como rodar

Requisitos: **Node 20+**.

```bash
npm install          # instala client + server
npm run dev          # sobe os dois: servidor :8787 e portal :5173
```

Abra `http://localhost:5173`.

O terminal do servidor também imprime o endereço da rede local (`http://192.168.x.x:8787`) — dá
para abrir no celular na mesma Wi-Fi e jogar de verdade com quem está na sala.

### Scripts

| Comando                | O que faz                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | Servidor (tsx watch) + portal (Vite) juntos                      |
| `npm run dev:server`   | Só o servidor de jogo                                            |
| `npm run dev:client`   | Só o portal                                                      |
| `npm run build`        | Type-check + build de produção do portal em `client/dist`         |
| `npm run typecheck`    | Type-check de client e server (inclui `shared/`)                  |
| `npm start`            | Servidor em produção; se `client/dist` existir, ele serve o site  |

### Testes e playtest

```bash
npm run test:balance                 # playtest dos 30 jogos em segundos
npm run test:balance -- push         # só um jogo
npm run test:render                  # roda todo o código de desenho headless

npm start                            # servidor em um terminal, e então:
npm run test:smoke                   # partida real de cada jogo, via rede
npm run test:smoke -- coleta gol     # só alguns
```

- **`scripts/balance.ts`** roda a simulação em velocidade máxima (sem rede, sem tempo real) com bots
  em todos os slots, para 2, 4 e 5 jogadores, com quatro seeds cada. Reporta duração, eliminações e
  placar contra o alvo declarado no catálogo. É o instrumento de ajuste do jogo: um chute de
  constante é medido em segundos, não em partidas. Foi ele que encontrou, por exemplo, o buraco do
  PUSH! nascendo embaixo de um jogador (rodada de 1 segundo), o bot do GOL! fazendo quatro gols
  contra em sete segundos, e o jogador parado "ganhando" o MINA! por nunca ter explodido.
- **`scripts/smoke.ts`** cria uma sala de verdade, enche de bots e joga até o fim pela rede,
  validando snapshots, colocações e resultados. Cobre o caminho servidor + Socket.IO + protocolo.
- **`client/scripts/render-check.ts`** usa um canvas falso para executar os 30 renderers, os 30
  previews e as 24 criaturas × 7 expressões (≈3,3 milhões de chamadas de canvas). Pega erro de
  runtime em código de desenho, que o TypeScript não vê.

---

## Arquitetura

```
shared/          simulação + tipos + catálogo  (roda no servidor E no cliente)
server/          Node + Express + Socket.IO, autoridade da partida
client/          React + TypeScript + Vite + Tailwind
scripts/         playtest headless
```

### Por que um pacote `shared/`

A lógica dos jogos é escrita uma vez e usada nos dois lados:

- o **servidor** roda a simulação a 60 Hz e é a única fonte de verdade;
- o **cliente** importa as mesmas constantes de física para prever o próprio movimento, e o mesmo
  catálogo para textos, cores e regras da interface.

Não existe "regra do jogo" duplicada entre front e back.

### Fluxo de uma partida

```
host: match:start
        │
        ▼
servidor cria o estado do jogo (seed determinística)
        │  60 Hz  →  step(state, dt, inputs)
        │  20 Hz  →  match:snapshot (posições + eventos)
        ▼
cliente  buffer de snapshots
         ├─ renderiza ~120 ms no passado, interpolando entre dois snapshots
         ├─ prevê o próprio personagem para o input parecer instantâneo
         └─ consome eventos one-shot (hit, out, explode…) em som + partículas
        │
        ▼
fim → match:end com pódio, placar e revanche em 1 clique
```

Decisões que valem destaque:

- **Snapshots fora do React.** Vinte pacotes por segundo em estado de React seriam 20 re-renders/s.
  O buffer vive em `ref` e é lido dentro do `requestAnimationFrame`; o HUD é atualizado a 10 Hz.
- **Predição só do que é previsível.** O cliente antecipa aceleração e atrito do próprio boneco.
  Dash, knockback e atordoamento vêm do servidor sem discussão — prever colisão daria divergência
  visível.
- **Eventos separados do estado.** Posição é interpolada; explosão não. Eventos one-shot viajam no
  snapshot e disparam efeito e som exatamente uma vez.
- **Grids em RLE.** O chão do PAINT! (1120 células) e os blocos do DON'T FALL! (150) são muito
  repetitivos: run-length encoding reduz o payload em ~10x mantendo JSON simples.
- **Bots de verdade.** Cada jogo implementa sua própria IA. Servem para completar a sala, para testar
  a jogabilidade sem cinco pessoas e para assumir o personagem de quem cair no meio da partida
  ("piloto automático").

### Adicionar um minijogo novo

1. `shared/src/games/meuJogo.ts` implementando `GameModule` (`create`, `step`, `isOver`, `results`,
   `snapshot`, `bot`). O `kit.ts` já entrega arena, física, colisão e resultado prontos.
2. Registrar em `shared/src/games/index.ts` e adicionar o id em `GameId`.
3. Adicionar a entrada em `shared/src/catalog.ts` (nome, textos, cores, duração, `scoreKind`, vidas).
4. Um renderer (as levas estão agrupadas em `render/extraRenderers.ts`, `wave3Renderers.ts`,
   `wave4Renderers.ts` e `wave5Renderers.ts`) e registrar em `render/index.ts`.
5. Uma cena de preview em `client/src/components/games/previews.ts`.
6. `npx tsx scripts/balance.ts meuJogo` e ajustar as constantes até a duração bater com o catálogo.

Nada mais precisa mudar: lobby, sala, HUD, resultado, previews e navegação leem o catálogo.

**Protocolo.** Os cinco primeiros jogos têm campos próprios no snapshot (`push`, `crown`, `bomb`,
`paint`, `fall`). Os 25 seguintes usam um canal genérico (`ex`) com `items` / `grid` / `n` / `s` /
`h` / `tg` / `ids`, onde cada jogo documenta os seus próprios códigos. Resultado prático: um jogo novo
não precisa mais tocar em `types.ts` além do id. Dois casos valem nota:

- **RASTRO!** — mandar o rastro inteiro a cada snapshot custaria dezenas de KB/s, então o servidor
  manda só os pontos novos e o cliente acumula e expira localmente.
- **CAÇA!** — a posição do baú **nunca** entra no snapshot. Só vai a temperatura de cada jogador; a
  posição aparece no evento de quem cavou certo. Cliente modificado não tem como saber a resposta.

---

## Os 30 minijogos

| Jogo             | Objetivo                                              | Rodada     |
| ---------------- | ----------------------------------------------------- | ---------- |
| **PUSH!**        | Último de pé na arena que encolhe                      | 45 – 95s   |
| **CROWN!**       | Acumular tempo com a coroa até a meta                  | 50 – 90s   |
| **BOMB!**        | Não estar com a bomba quando ela estourar              | 30 – 60s   |
| **PAINT!**       | Dominar a maior porcentagem do chão                    | 75s        |
| **DON'T FALL!**  | Último a não cair no vazio                             | 35 – 75s   |
| **COLETA!**      | Somar mais estrelas que todo mundo                     | 70s        |
| **ZONA!**        | Dominar a zona móvel — sozinho                         | 40 – 95s   |
| **PAREDE!**      | Achar a passagem antes da parede chegar                | 40 – 65s   |
| **GOL!**         | Empurrar a bola para o gol dos outros                  | 30 – 100s  |
| **CORRIDA!**     | Tocar o anel antes dos outros, muitas vezes            | 20 – 45s   |
| **CORES!**       | Estar na cor chamada quando o tempo zerar              | 50 – 88s   |
| **RAIO!**        | Dançar entre os feixes que giram                       | 30 – 80s   |
| **MINA!**        | Abrir blocos seguros sem achar mina                    | 20 – 60s   |
| **RASTRO!**      | Não encostar em rastro nenhum — nem no seu             | 25 – 50s   |
| **METEORO!**     | Sair de baixo da sombra antes do impacto               | 45 – 90s   |
| **SOMBRA!**      | Ficar livre; quem é pego vira caçador                  | 70s        |
| **BURACO!**      | Não ser engolido pelo buraco que puxa todos            | 30 – 80s   |
| **PESO!**        | Escolher entre leve e ágil ou pesado e brutal          | 40 – 80s   |
| **LADRÃO!**      | Depositar moedas no cofre antes de ser roubado         | 80s        |
| **CADEIRAS!**    | Garantir cadeira em cada apito                         | 25 – 70s   |
| **ONDA!**        | Estar em cima da pedra quando a água passar            | 25 – 80s   |
| **SEMÁFORO!**    | Correr no verde, andar devagar no amarelo, parar no vermelho | 70s  |
| **CARIMBO!**     | Pisar nos carimbos na ordem chamada                    | 75s        |
| **TREM!**        | Estar no seu vagão quando o apito tocar                | 78s        |
| **GANGORRA!**    | Não escorregar da prancha que inclina                  | 30 – 80s   |
| **BOLHA!**       | Encher a bolha ficando parado — e não ser furado       | 70s        |
| **ÍMÃ!**         | Sobreviver ao campo que atrai e repele                 | 25 – 75s   |
| **ESPELHO!**     | Jogar com dois corpos: você e o seu reflexo            | 68s        |
| **DOIS!**        | Formar grupos do tamanho chamado (3+ jogadores)        | 30 – 80s   |
| **CAÇA!**        | Achar o baú enterrado seguindo a temperatura           | 75s        |

Todos usam o mesmo controle: **mover** e **dash**. O significado do dash muda com o jogo (empurra,
foge, alcança, pinta grosso, atravessa buraco, chuta a bola, cava no chão, salva você da queda) — o
controle não.

### Campeonato: ninguém escolhe o jogo

A sala não tem seletor de jogo. O host define de quantas rodadas é o campeonato (de 1 até o total do
catálogo) e cada rodada sorteia um jogo que ainda não saiu. A colocação vira ponto
(`participantes - colocação + 1`), o placar aparece no lobby e no fim de cada partida, e a rodada
seguinte começa sozinha em 12 segundos — o host pode adiantar.

O sorteio respeita o `minPlayers` do catálogo: DOIS!, por exemplo, só entra em sala com três ou mais
pessoas, porque com duas não existe "sobrar alguém".

### Game feel

Os números de movimento vivem em um só lugar (`shared/src/engine.ts`) e valem para todos os jogos:
aceleração alta (controle imediato), atrito curto (o personagem para onde você soltou) e um dash que
percorre ~35% do diâmetro da arena — dash é um ataque, não um passinho. O knockback é fraco no
primeiro toque e forte depois que a vítima acumula pancada (`stagger`), o que concentra as viradas no
fim da rodada.

Uma lição que o playtest automatizado deixou explícita: **arena e dash são acoplados**. Quando o
dash ficou mais longo, a arena do PUSH! que fechava até raio 76 virou um lugar onde atacar era
suicídio — os bots paravam de se atacar e a rodada ia até o tempo limite. O piso de encolhimento
passou a respeitar ~1,6x a distância do dash.

---

## Arte e áudio

Não há um único arquivo de imagem ou de som no projeto.

- **Personagens desenhados por código** (`client/src/games/render/creature.ts`): 24 criaturas, 7
  expressões, squash & stretch, piscada. A mesma função desenha o boneco dentro da partida, no
  preview do card e no avatar do lobby — impossível a arte da interface divergir da arte do jogo. O
  elenco tem energia de meme (cachorro desconfiado, sapo de cara vazia, capivara de boa, caveirinha,
  pãozinho) sem copiar personagem de ninguém: silhueta, proporção, paleta e nome são nossos, o que
  mantém a piada e mantém o projeto utilizável comercialmente. Dá para trocar de personagem dentro do
  lobby, a qualquer momento antes da partida.
- **Áudio sintetizado com Web Audio** (`client/src/audio/SoundManager.ts`): ~30 efeitos e uma trilha
  com sequenciador próprio que acelera conforme a tensão da partida. Bundle minúsculo, latência
  zero, e cada dash sai com um pitch levemente diferente. O contexto só é criado no primeiro gesto
  do usuário, respeitando a política de autoplay.
- **Previews jogáveis nos cards**: cada minijogo tem uma cena curta em loop que explica o conceito
  sem texto, pausada por `IntersectionObserver` quando sai da tela.

---

## Acessibilidade e mobile

- Alvos de toque grandes, direcional que nasce onde o dedo encosta e botão de dash dedicado.
- `100dvh` e `env(safe-area-inset-*)` para não brigar com a barra do navegador nem com o notch.
- Sem scroll durante o gameplay (`touch-action: none`).
- Foco visível em toda a navegação, `aria-label` nos controles, `aria-live` nos avisos.
- `prefers-reduced-motion` desliga as animações decorativas.
- Nome do próprio personagem destacado em campo, com anel e etiqueta "você" — em jogo com 5 bonecos
  parecidos, saber qual é o seu é requisito de usabilidade, não enfeite.

---

## Stack

React 18 · TypeScript 5.5 · Vite 5 · Tailwind 3 · Framer Motion · Canvas 2D ·
Node 20 · Express 4 · Socket.IO 4

Os jogos usam Canvas 2D direto em vez de um engine pronto: a simulação precisava rodar igual no
servidor (autoridade) e no cliente (predição), e um engine de render no meio do caminho só
atrapalharia isso.
