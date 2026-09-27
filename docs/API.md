# Contrato inicial da API

## GET /health

Retorna o estado do serviço e do SQLite.

## GET /mesas

Lista mesas e estados (`LIVRE`, `OCUPADA`).

## GET /categorias

Lista categorias ordenadas.

## GET /produtos

Lista somente produtos ativos, com categoria.

## POST /pedidos

Exemplo:

```json
{
  "mesa_id": 1,
  "origem": "MESA",
  "observacao_geral": "Sem cebola",
  "itens": [
    {
      "produto_id": 1,
      "qtd": 2,
      "observacao": "Sem tomate",
      "adicionais": [
        { "id": 7, "qtd": 1 }
      ]
    }
  ]
}
```

## GET /kds/pendentes

Lista os itens ainda pendentes na cozinha.

## POST /kds/item/:id/status

Estados aceitos:

- `PENDENTE`
- `EM_PREPARO`
- `PRONTO`
- `CANCELADO`

## POST /pedidos/:id/fechar

Exemplo:

```json
{
  "forma": "DINHEIRO",
  "valor_pago": 50
}
```

O backend registra a venda no caixa, fecha o pedido e libera a mesa.

### Operação

- `GET /pedidos?status=NA_COZINHA&limite=50`
- `GET /caixa`
- `POST /caixa/abrir` `{ "saldo_inicial": 100 }`
- `POST /caixa/movimentar` `{ "tipo": "SANGRIA", "forma": "DINHEIRO", "valor": 20 }`
- `POST /caixa/fechar`

## Estoque

- `GET /estoque?busca=` — lista produtos com saldo calculado a partir dos movimentos.
- `GET /estoque/:produtoId/movimentos` — histórico e saldo de um produto.
- `POST /estoque/movimentar` — registra `ENTRADA`, `SAIDA` ou `AJUSTE`.
- Ao fechar um pedido, produtos marcados com `controla_estoque=1` geram automaticamente `SAIDA_VENDA` e a operação é atômica com o recebimento.

O saldo não é armazenado em duplicidade: ele é derivado da soma de `estoque_movimento.qtd`. Isso mantém histórico e facilita auditoria.
