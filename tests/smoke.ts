import fs from 'node:fs';
import path from 'node:path';

const files = ['src/core/server.ts', 'src/core/db.ts', 'schema.sql', 'public/index.html', 'public/caixa.html', 'public/estoque.html'];
for (const file of files) {
  if (!fs.existsSync(path.resolve(file))) throw new Error(`Arquivo ausente: ${file}`);
}
const schema = fs.readFileSync('schema.sql', 'utf8');
for (const table of ['produtos', 'pedidos', 'caixas', 'movimentacao_caixa', 'estoque_movimento']) {
  if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) throw new Error(`Tabela ausente no schema: ${table}`);
}
const server = fs.readFileSync('src/core/server.ts', 'utf8');
for (const route of ["'/estoque'", "'/estoque/:produtoId/movimentos'", "'/estoque/movimentar'", "'/pedidos/:id/fechar'"]) {
  if (!server.includes(route)) throw new Error(`Rota ausente: ${route}`);
}
if (!server.includes("'SAIDA_VENDA'")) throw new Error('Baixa automática de estoque ausente');
console.log('Smoke tests OK: estrutura, estoque e baixa automática presentes.');
