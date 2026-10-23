// Injeta os dados do modelo no template e gera o index.html
// Uso: node modelo/montar_pagina.js modelo/page_template.html simdata.json index.html
const fs = require('fs');
const [tpl, dataPath, out] = process.argv.slice(2);
const data = fs.readFileSync(dataPath, 'utf8').replace(/</g, '\u003c');
fs.writeFileSync(out, fs.readFileSync(tpl, 'utf8').replace('/*DATA*/', () => data));
console.log('gerado', out);
