// Injeta os dados do modelo no template e gera o index.html
// Uso: node modelo/montar_pagina.js modelo/page_template.html simdata.json index.html
const fs = require('fs');
const [tpl, dataPath, out] = process.argv.slice(2);
const data = fs.readFileSync(dataPath, 'utf8').replace(/</g, '\u003c');
// fatores.js (finais, reservas, motivação, "entregas") roda igual no worker da página
const fat = fs.readFileSync(require('path').join(__dirname, 'fatores.js'), 'utf8');
fs.writeFileSync(out, fs.readFileSync(tpl, 'utf8').replace('/*FATORES*/', () => fat).replace('/*DATA*/', () => data));
console.log('gerado', out);
