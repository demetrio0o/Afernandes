// Copia a biblioteca de PDF e a logo para a pasta www antes de gerar o app.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const lib = path.join(root, 'www', 'lib');
fs.mkdirSync(lib, { recursive: true });

fs.copyFileSync(
  path.join(root, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js'),
  path.join(lib, 'jspdf.umd.min.js')
);

const logo = path.join(root, 'logo.png');
if (fs.existsSync(logo)) {
  fs.copyFileSync(logo, path.join(root, 'www', 'logo.png'));
}
console.log('www pronto (jsPDF + logo).');
