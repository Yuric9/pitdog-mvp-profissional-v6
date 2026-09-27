# Estrutura do PitDog MVP

## O que foi corrigido

- `server.ts` e `db.ts` deixaram de ser placeholders.
- Duplicações de arquivos de versões anteriores foram removidas.
- O banco passou a usar uma pasta `.data` para o SQLite.
- O seed passou a usar IDs fixos e `INSERT OR IGNORE`, evitando duplicação a cada inicialização.
- Foram adicionadas validações de pedido, produto, adicional e pagamento.
- O fechamento de pedido agora registra `fechado_em`.
- O KDS valida os estados permitidos.
- O protótipo HTML passou a ser servido em `/`.
- Foram adicionados build e smoke test.

## Fluxo atual

```text
PDV/protótipo
   -> API Fastify
      -> SQLite + WAL
      -> Socket.IO
      -> KDS
      -> Caixa
```

## O que falta para o MVP operacional

### Fase 1 — Integração do frontend
1. **Concluído:** trocar os produtos hardcoded do protótipo por `GET /produtos`.
2. **Concluído:** trocar as mesas hardcoded por `GET /mesas`.
3. **Concluído:** enviar o carrinho para `POST /pedidos`.
4. **Concluído:** confirmação baseada no ID real do pedido.
5. **Concluído nesta etapa:** KDS consulta os pedidos reais por API; Socket.IO permanece preparado para evolução em tempo real.

### Fase 2 — Operação
1. Tela de abertura/fechamento de caixa.
2. Formas de pagamento: dinheiro, PIX e cartão.
3. Sangria e suprimento.
4. Histórico de pedidos.
5. Cancelamento/estorno com registro.

### Fase 3 — Estoque
1. Cadastro de estoque mínimo.
2. Entrada e saída manual.
3. Baixa automática ao fechar pedido.
4. Relatório de estoque baixo.

### Fase 4 — Garçom/PWA
1. PWA real.
2. Seleção de mesa.
3. Envio de pedido.
4. Atualização de status.
5. Modo de contingência/offline.

### Fase 5 — Produção
1. Autenticação e perfis.
2. Auditoria.
3. Backup do banco.
4. Configuração de CORS por ambiente.
5. Observabilidade e logs.

## Fluxo operacional atual

1. PDV carrega mesas e produtos do SQLite.
2. Atendente monta o pedido e envia para `/pedidos`.
3. Pedido entra no KDS em `NA_COZINHA`.
4. Ao concluir todos os itens, o pedido passa para `PRONTO`.
5. Caixa lista pedidos abertos e recebe em Dinheiro, PIX ou Cartão.
6. Dinheiro exige valor recebido e calcula troco.
7. Ao fechar o pedido, a mesa volta para `LIVRE`.
8. Fechamento do caixa considera dinheiro físico: saldo inicial + vendas em dinheiro + suprimentos - sangrias.

A tela operacional do caixa está disponível em `/caixa.html`.

## Estoque — fase atual

O estoque do MVP é controlado por produto. Cada produto pode ter `controla_estoque=1`. O saldo é calculado pela soma dos movimentos:

- `ENTRADA`: quantidade positiva;
- `SAIDA`: quantidade negativa;
- `AJUSTE`: diferença necessária para chegar ao novo saldo;
- `SAIDA_VENDA`: baixa automática no recebimento do pedido.

A venda é recusada quando o saldo controlado é insuficiente. Produtos sem controle de estoque continuam vendendo normalmente.
