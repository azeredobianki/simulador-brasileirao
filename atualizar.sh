#!/usr/bin/env bash
# Atualiza o site com os resultados mais recentes.
# Uso: ./atualizar.sh "data dos resultados" [arquivo de odds]
# Ex.: ./atualizar.sh "26/10/2026 (32ª rodada)" dados/odds_all.txt
set -euo pipefail
cd "$(dirname "$0")"
LABEL="${1:?informe a data dos resultados, ex.: \"26/10/2026 (32ª rodada)\"}"
ODDS="${2:-dados/odds_all.txt}"
mkdir -p saida
# 1. resultados e tabela atuais (Wikipedia, baseada na CBF)
curl -sSL "https://en.wikipedia.org/w/index.php?title=2026_Campeonato_Brasileiro_S%C3%A9rie_A&action=raw" -o dados/wiki.txt \
  || curl -sSL --ssl-no-revoke "https://en.wikipedia.org/w/index.php?title=2026_Campeonato_Brasileiro_S%C3%A9rie_A&action=raw" -o dados/wiki.txt
# 2. simulação de referência (20 milhões de temporadas)
node modelo/realistic.js dados/wiki.txt dados/turno1.txt 20000000 saida/referencia.json "$ODDS"
# 3. dados embutidos na página e index.html
node modelo/build_data.js dados/wiki.txt dados/turno1.txt "$ODDS" dados/rounds.txt saida/simdata.json saida/referencia.json "$LABEL"
node modelo/montar_pagina.js modelo/page_template.html saida/simdata.json index.html
# 4. relatório em texto
node modelo/report2.js saida/referencia.json dados/result_modelo_terco.json dados/wiki.txt dados/turno1.txt saida/jogos.json > saida/relatorio.txt
echo "Pronto: index.html atualizado; relatório em saida/relatorio.txt"
