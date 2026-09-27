# PitDog MVP Profissional

MVP operacional de PDV + KDS + Caixa + Estoque para PitDog.

## Rodar

```bash
npm install
npm run dev
```

Acesse `http://localhost:3333`.

## Produção local

```bash
npm run build
npm start
```

## Testes

```bash
npm test
```

## Rotas principais

- `/` — PDV.
- `/caixa.html` — operação de caixa.
- `/estoque.html` — estoque.
- `/health` — saúde do serviço.
- `/mesas`, `/categorias`, `/produtos` — cadastros.
- `/pedidos` — criação e consulta.
- `/kds/pendentes` — fila da cozinha.
- `/kds/item/:id/status` — atualização de item.
- `/pedidos/:id/fechar` — recebimento e baixa de estoque.
- `/caixa` — resumo do caixa.
- `/caixa/abrir`, `/caixa/movimentar`, `/caixa/fechar`.
- `/estoque`, `/estoque/:produtoId/movimentos`, `/estoque/movimentar`.

## Contratos

Veja `docs/API.md`.

## Estoque

O estoque é controlado por movimentos (`estoque_movimento`) e não por um campo de saldo duplicado. O fechamento do pedido registra `SAIDA_VENDA` automaticamente para produtos com `controla_estoque=1`.

## Caixa

O caixa deve estar aberto para receber pedidos. O fechamento aceita saldo conferido e retorna diferença.

## PWA Garçom

O diretório `pwa-garcom` contém o ponto de partida para transformar o protótipo em um PWA real.
