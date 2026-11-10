# Simulador do Z4 — Brasileirão Série A 2026

Simulador das últimas rodadas do Brasileirão 2026. Mostra a chance de cada time ser **rebaixado**, ser **campeão** e se classificar para a **Libertadores**, e quanto cada jogo pesa nessas chances. Quem visita pode digitar placares e a simulação recomeça na hora, no próprio navegador.

O site é um arquivo só: [`index.html`](index.html). Não precisa de servidor nem de banco de dados.

## Como funciona o modelo

- **Força dos times:** ataque e defesa de cada clube, ajustados a todos os jogos já disputados na temporada. O modelo é Poisson com a correção de Dixon-Coles para placares baixos, mais o mando de campo.
- **Incerteza:** o ajuste é refeito 200 vezes, reamostrando os jogos, e cada simulação sorteia uma dessas versões.
- **Mercado:**
  - Jogos com odds informadas usam exatamente a probabilidade do mercado, já sem a margem das casas.
  - As odds também ajustam levemente a força dos times para os jogos seguintes.
- **Placares completos** são sorteados. Por isso o desempate oficial funciona: pontos, vitórias, saldo, gols pró e confronto direto entre dois times. Os demais critérios viram sorteio.
- **Validação:** o modelo foi testado prevendo cada rodada só com os jogos anteriores. Teve log-loss de 1,020, contra 1,099 do "1/3 para cada resultado" e 1,058 da simples frequência de mandante, empate e visitante.
- **Libertadores 2027** (regras da CBF e da Conmebol): G4 e campeão da Copa do Brasil na fase de grupos; 5º colocado e vice da Copa na preliminar. Os campeões da Libertadores e da Sul-Americana ganham vaga extra na fase de grupos. Quando um classificado já tem vaga, ela passa para o próximo da tabela (se o campeão da Copa já está no G4, o vice sobe para a fase de grupos). Rebaixado não disputa a Libertadores. Cada simulação sorteia as finais (Palmeiras x Estudiantes, Atlético-MG x Boca Juniors, Palmeiras x Grêmio na Copa do Brasil), então a zona do Brasileirão varia de G6 a G9.
- **Fatores extras** (`modelo/fatores.js`, só nos jogos sem odds, porque as odds já embutem a escalação esperada):
  - *Reservas perto das finais:* Palmeiras, Atlético-MG e Grêmio têm uma chance, jogo a jogo, de poupar titulares (maior quando não disputam mais nada no Brasileirão). Time reserva vale cerca de 10 p.p. a menos de vitória num jogo equilibrado.
  - *Sem objetivo:* quem já não pode cair, ser campeão nem pegar vaga rende um pouco menos (cerca de 3 p.p.) contra quem ainda disputa algo.
  - *"Entrega":* time sem objetivo que enfrenta o adversário direto do seu rival clássico na briga contra a queda tem 20% de chance de fazer "corpo mole" (mesmo efeito de um time reserva).
  - A situação de cada time é recalculada no início de cada rodada de cada simulação, com os pontos sorteados até ali.
  - As chances das finais (Palmeiras 62% na Libertadores, Atlético-MG 50% na Sul-Americana, Palmeiras 66% na Copa do Brasil) e as chances de reservas são estimativas, não odds; troque em `FAT` quando houver mercado.

## Publicar no GitHub Pages

1. **Settings → Pages**
2. Em *Source*, escolha **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/ (root)** e salve.
4. Em alguns minutos o site fica em `https://<seu-usuário>.github.io/<nome-do-repositório>/`.

## Atualizar depois de cada rodada

É preciso ter o [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
./atualizar.sh "26/10/2026 (32ª rodada)" dados/odds_all.txt
git add -A && git commit -m "Atualiza após a 32ª rodada" && git push
```

O script:
1. Baixa a tabela e os resultados atuais.
2. Roda 20 milhões de simulações de referência, o que leva uns 2 minutos.
3. Gera um `index.html` novo.

**Odds:** para usar odds novas, acrescente linhas em `dados/odds_all.txt` no formato `MANDANTE VISITANTE odd1 oddX odd2`, por exemplo `INT BOT 2.02 3.75 3.85`. Use os códigos de time do arquivo `modelo/model.js`. Linhas de jogos que já aconteceram continuam úteis: ajudam a calibrar a força dos times.

## Estrutura

| Pasta/arquivo | Conteúdo |
|---|---|
| `index.html` | o site pronto |
| `modelo/model.js` | modelo de gols (ajuste, matriz de placares) |
| `modelo/market.js` | conversão das odds e ajuste ao mercado |
| `modelo/fatores.js` | vagas pelas finais, reservas, falta de objetivo e "entregas" (usado pela simulação e pela página) |
| `modelo/realistic.js` | simulação de referência em várias threads |
| `modelo/build_data.js`, `montar_pagina.js` | geram os dados embutidos e o `index.html` |
| `modelo/page_template.html` | página (HTML, CSS e o simulador que roda no navegador) |
| `modelo/backtest.js`, `report2.js`, `cutoff.js` | validação, relatório e linha de corte |
| `dados/` | calendário da CBF, odds e cópia da tabela usada |

Fontes: tabela e resultados da [Wikipedia](https://en.wikipedia.org/wiki/2026_Campeonato_Brasileiro_S%C3%A9rie_A) (baseada na CBF); calendário da [CBF](https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/2026).
