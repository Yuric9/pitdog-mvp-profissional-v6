import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyIO from 'fastify-socket.io';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, dbPath, initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');
const app = Fastify({ logger: true });

const allowedOrigin = process.env.CORS_ORIGIN ?? true;
await app.register(cors, { origin: allowedOrigin });
await app.register(fastifyIO, { cors: { origin: allowedOrigin } });
await app.register(fastifyStatic, { root: publicDir, prefix: '/' });

initDb();

type OrderItemInput = {
  produto_id: number;
  qtd: number;
  observacao?: string;
  adicionais?: Array<{ id: number; qtd: number }>;
};
type CreateOrderBody = { mesa_id: number; itens: OrderItemInput[]; observacao_geral?: string; origem?: string };
type CloseOrderBody = { forma: string; valor_pago?: number };

function bad(message: string): never {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  throw error;
}

app.get('/', async (_req, reply) => reply.sendFile('index.html'));
app.get('/health', async () => ({ status: 'ok', db: 'sqlite-wal', dbPath }));
app.get('/mesas', async () => db.prepare('SELECT * FROM mesas ORDER BY id').all());
app.get('/produtos', async () => db.prepare(`SELECT p.*, c.nome AS categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.ativo=1 ORDER BY c.ordem,p.nome`).all());
app.get('/categorias', async () => db.prepare('SELECT * FROM categorias ORDER BY ordem,nome').all());

app.get('/pedidos/:id', async (req, reply) => {
  const id = Number((req.params as {id:string}).id);
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id=?').get(id);
  if (!pedido) return reply.code(404).send({error:'Pedido não encontrado'});
  const itens = db.prepare(`SELECT ip.*,p.nome AS produto_nome FROM itens_pedido ip JOIN produtos p ON p.id=ip.produto_id WHERE ip.pedido_id=? ORDER BY ip.id`).all(id);
  return {pedido,itens};
});

app.post<{Body:CreateOrderBody}>('/pedidos', async (req, reply) => {
  const {mesa_id,itens,observacao_geral,origem='MESA'}=req.body??{};
  if(!Number.isInteger(mesa_id)) bad('mesa_id inválido');
  if(!Array.isArray(itens)||!itens.length) bad('O pedido precisa ter pelo menos um item');
  const mesa=db.prepare('SELECT id,status FROM mesas WHERE id=?').get(mesa_id);
  if(!mesa) return reply.code(404).send({error:'Mesa não encontrada'});
  const createOrder=db.transaction(()=>{
    const ped=db.prepare('INSERT INTO pedidos (mesa_id,status,origem,observacao_geral,total) VALUES (?,?,?,?,0)').run(mesa_id,'NA_COZINHA',origem,observacao_geral??null);
    const pedidoId=Number(ped.lastInsertRowid); let total=0;
    for(const input of itens){
      if(!Number.isInteger(input.produto_id)||!Number.isInteger(input.qtd)||input.qtd<=0) bad('Item de pedido inválido');
      const prod=db.prepare('SELECT id,nome,preco,ativo FROM produtos WHERE id=?').get(input.produto_id) as {id:number;nome:string;preco:number;ativo:number}|undefined;
      if(!prod) bad(`Produto ${input.produto_id} não encontrado`);
      if(!prod.ativo) bad(`Produto ${prod.nome} está inativo`);
      const item=db.prepare('INSERT INTO itens_pedido (pedido_id,produto_id,qtd,preco_unit,observacao,agrupamento_key) VALUES (?,?,?,?,?,?)').run(pedidoId,prod.id,input.qtd,prod.preco,input.observacao??null,`${prod.nome}|${input.observacao??''}`.toLowerCase());
      total+=prod.preco*input.qtd;
      for(const ad of input.adicionais??[]){
        if(!Number.isInteger(ad.id)||!Number.isInteger(ad.qtd)||ad.qtd<=0) bad('Adicional inválido');
        const adP=db.prepare(`SELECT p.id,p.preco,p.nome,p.ativo FROM produtos p JOIN categorias c ON c.id=p.categoria_id WHERE p.id=? AND c.nome='Adicionais'`).get(ad.id) as {id:number;preco:number;nome:string;ativo:number}|undefined;
        if(!adP) bad(`Adicional ${ad.id} não encontrado`);
        if(!adP.ativo) bad(`Adicional ${adP.nome} está inativo`);
        db.prepare('INSERT INTO itens_adicionais (item_pedido_id,produto_adicional_id,qtd,preco) VALUES (?,?,?,?)').run(Number(item.lastInsertRowId),adP.id,ad.qtd,adP.preco);
        total+=adP.preco*ad.qtd;
      }
    }
    db.prepare('UPDATE pedidos SET total=? WHERE id=?').run(total,pedidoId);
    db.prepare("UPDATE mesas SET status='OCUPADA' WHERE id=?").run(mesa_id);
    return db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId);
  });
  try{const criado=createOrder();app.io.emit('cozinha:novo_pedido',criado);return reply.code(201).send(criado)}
  catch(error){return reply.code((error as {statusCode?:number}).statusCode??400).send({error:(error as Error).message})}
});

app.get('/kds/pendentes',async()=>db.prepare(`SELECT p.id AS pedido_id,p.criado_em,p.total,m.numero AS mesa_numero,prod.nome AS produto_nome,ip.qtd,ip.observacao,ip.id AS item_id,ip.status_cozinha FROM pedidos p JOIN mesas m ON m.id=p.mesa_id JOIN itens_pedido ip ON ip.pedido_id=p.id JOIN produtos prod ON prod.id=ip.produto_id WHERE p.status='NA_COZINHA' AND ip.status_cozinha NOT IN ('PRONTO','CANCELADO') ORDER BY p.criado_em,ip.id`).all());

app.post<{Params:{id:string};Body:{status:string}}>('/kds/item/:id/status',async(req,reply)=>{
  const allowed=new Set(['PENDENTE','EM_PREPARO','PRONTO','CANCELADO']);
  const novoStatus=req.body?.status;
  if(!allowed.has(novoStatus)) return reply.code(400).send({error:'Status de cozinha inválido'});
  const itemId=Number(req.params.id);
  const item=db.prepare('SELECT pedido_id,qtd,preco_unit,status_cozinha FROM itens_pedido WHERE id=?').get(itemId) as {pedido_id:number;qtd:number;preco_unit:number;status_cozinha:string}|undefined;
  if(!item) return reply.code(404).send({error:'Item não encontrado'});
  const foiCanceladoAgora=novoStatus==='CANCELADO'&&item.status_cozinha!=='CANCELADO';
  const aplicarCancelamento=db.transaction(()=>{
    const result=db.prepare('UPDATE itens_pedido SET status_cozinha=? WHERE id=?').run(novoStatus,itemId);
    if(foiCanceladoAgora){
      const adicionais=db.prepare('SELECT COALESCE(SUM(qtd*preco),0) AS total FROM itens_adicionais WHERE item_pedido_id=?').get(itemId) as {total:number};
      const valorItem=item.preco_unit*item.qtd+Number(adicionais.total);
      db.prepare('UPDATE pedidos SET total=MAX(0,total-?) WHERE id=?').run(valorItem,item.pedido_id);
    }
    return result;
  });
  const result=aplicarCancelamento();
  if(!result.changes) return reply.code(404).send({error:'Item não encontrado'});
  const pendentes=db.prepare("SELECT COUNT(*) AS total FROM itens_pedido WHERE pedido_id=? AND status_cozinha!='PRONTO' AND status_cozinha!='CANCELADO'").get(item.pedido_id) as {total:number};
  if(Number(pendentes.total)===0){db.prepare("UPDATE pedidos SET status='PRONTO' WHERE id=? AND status!='FECHADO'").run(item.pedido_id);app.io.emit('pedido:pronto',{pedidoId:item.pedido_id})}
  app.io.emit('kds:atualizado',{id:itemId,pedidoId:item.pedido_id,status:novoStatus});
  return {ok:true,pedido_pronto:Number(pendentes.total)===0};
});

function estoqueAtual(produtoId:number){const row=db.prepare('SELECT COALESCE(SUM(qtd),0) AS saldo FROM estoque_movimento WHERE produto_id=?').get(produtoId) as {saldo:number};return Number(row.saldo??0)}

app.get('/estoque',async(req)=>{
  const q=(req.query as {busca?:string;baixo?:string})??{};const busca=(q.busca??'').trim();
  const rows=db.prepare(`SELECT p.id,p.nome,p.preco,p.custo,p.controla_estoque,p.ativo,c.nome AS categoria_nome,COALESCE((SELECT SUM(em.qtd) FROM estoque_movimento em WHERE em.produto_id=p.id),0) AS saldo FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE (?='' OR p.nome LIKE ?) ORDER BY c.ordem,p.nome`).all(busca,`%${busca}%`) as Array<Record<string,unknown>>;
  return q.baixo==='1'?rows.filter(r=>Number(r.saldo)<=0&&Number(r.controla_estoque)===1):rows;
});

app.get('/estoque/:produtoId/movimentos',async(req,reply)=>{
  const produtoId=Number((req.params as {produtoId:string}).produtoId);const produto=db.prepare('SELECT id,nome FROM produtos WHERE id=?').get(produtoId);
  if(!produto)return reply.code(404).send({error:'Produto não encontrado'});
  const movimentos=db.prepare('SELECT em.*,p.nome AS produto_nome FROM estoque_movimento em JOIN produtos p ON p.id=em.produto_id WHERE em.produto_id=? ORDER BY em.id DESC LIMIT 100').all(produtoId);
  return {produto,saldo:estoqueAtual(produtoId),movimentos};
});

app.post<{Body:{produto_id:number;tipo:string;qtd?:number;novo_saldo?:number;observacao?:string}}>('/estoque/movimentar',async(req,reply)=>{
  const {produto_id,tipo,qtd,novo_saldo}=req.body??{};
  if(!Number.isInteger(produto_id))return reply.code(400).send({error:'produto_id inválido'});
  if(!['ENTRADA','SAIDA','AJUSTE'].includes(tipo))return reply.code(400).send({error:'Tipo de estoque inválido'});
  const produto=db.prepare('SELECT id,nome,controla_estoque,ativo FROM produtos WHERE id=?').get(produto_id) as {id:number;nome:string;controla_estoque:number;ativo:number}|undefined;
  if(!produto)return reply.code(404).send({error:'Produto não encontrado'});if(!produto.ativo)return reply.code(400).send({error:`Produto ${produto.nome} está inativo`});
  let delta=0;
  if(tipo==='AJUSTE'){if(!Number.isFinite(Number(novo_saldo))||Number(novo_saldo)<0)return reply.code(400).send({error:'Novo saldo inválido'});delta=Number(novo_saldo)-estoqueAtual(produto_id);if(delta===0)return {ok:true,saldo:Number(novo_saldo)}}
  else{if(!Number.isFinite(Number(qtd))||Number(qtd)<=0)return reply.code(400).send({error:'Quantidade inválida'});delta=tipo==='ENTRADA'?Number(qtd):-Number(qtd);if(estoqueAtual(produto_id)+delta<0)return reply.code(409).send({error:`Estoque insuficiente para ${produto.nome}`})}
  db.prepare('INSERT INTO estoque_movimento (produto_id,tipo,qtd) VALUES (?,?,?)').run(produto_id,tipo,delta);return {ok:true,saldo:estoqueAtual(produto_id)};
});

app.post<{Params:{id:string};Body:CloseOrderBody}>('/pedidos/:id/fechar',async(req,reply)=>{
  const pedidoId=Number(req.params.id);const {forma,valor_pago=0}=req.body??{};
  if(!['DINHEIRO','PIX','CARTAO'].includes(forma))return reply.code(400).send({error:'Forma de pagamento inválida'});
  const result=db.transaction(()=>{
    const ped=db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId) as {id:number;mesa_id:number|null;total:number;status:string}|undefined;
    if(!ped)bad('Pedido não encontrado');if(ped.status==='FECHADO')bad('Pedido já está fechado');if(forma==='DINHEIRO'&&valor_pago<ped.total)bad('Valor pago insuficiente');
    const caixa=db.prepare("SELECT * FROM caixas WHERE status='ABERTO' ORDER BY id DESC LIMIT 1").get() as {id:number}|undefined;if(!caixa)bad('Nenhum caixa aberto. Abra o caixa antes de receber pagamentos.');
    const itens=db.prepare(`SELECT ip.produto_id,ip.qtd,p.nome,p.controla_estoque FROM itens_pedido ip JOIN produtos p ON p.id=ip.produto_id WHERE ip.pedido_id=? AND ip.status_cozinha!='CANCELADO'`).all(pedidoId) as Array<{produto_id:number;qtd:number;nome:string;controla_estoque:number}>;
    const adicionais=db.prepare(`SELECT ia.produto_adicional_id AS produto_id,ia.qtd,p.nome,p.controla_estoque FROM itens_adicionais ia JOIN itens_pedido ip ON ip.id=ia.item_pedido_id JOIN produtos p ON p.id=ia.produto_adicional_id WHERE ip.pedido_id=? AND ip.status_cozinha!='CANCELADO'`).all(pedidoId) as Array<{produto_id:number;qtd:number;nome:string;controla_estoque:number}>;
    const consumo=new Map<number,{nome:string;qtd:number;controla_estoque:number}>();
    for(const item of [...itens,...adicionais]){if(!item.controla_estoque)continue;const atual=consumo.get(item.produto_id);consumo.set(item.produto_id,{nome:item.nome,qtd:(atual?.qtd??0)+item.qtd,controla_estoque:1})}
    for(const [produtoId,item] of consumo){if(estoqueAtual(produtoId)<item.qtd)bad(`Estoque insuficiente para ${item.nome}. Disponível: ${estoqueAtual(produtoId)}`)}
    for(const [produtoId,item] of consumo)db.prepare("INSERT INTO estoque_movimento (produto_id,tipo,qtd,pedido_id) VALUES (?,?,?,?)").run(produtoId,'SAIDA_VENDA',-item.qtd,pedidoId);
    db.prepare('INSERT INTO movimentacao_caixa (caixa_id,pedido_id,tipo,forma,valor) VALUES (?,?,?,?,?)').run(caixa.id,pedidoId,'VENDA',forma,ped.total);
    db.prepare("UPDATE pedidos SET status='FECHADO',fechado_em=CURRENT_TIMESTAMP WHERE id=?").run(pedidoId);if(ped.mesa_id!==null)db.prepare("UPDATE mesas SET status='LIVRE' WHERE id=?").run(ped.mesa_id);
    return {ok:true,troco:Math.max(0,valor_pago-ped.total)};
  });
  try{const closed=result();app.io.emit('pedido:fechado',{pedidoId});return closed}catch(error){return reply.code((error as {statusCode?:number}).statusCode??400).send({error:(error as Error).message})}
});

app.get('/pedidos',async(req)=>{
  const q=(req.query as {status?:string;limite?:string})??{};const limite=Math.min(Math.max(Number(q.limite??50)||50,1),200);
  if(q.status==='ABERTOS')return db.prepare("SELECT p.*,m.numero AS mesa_numero FROM pedidos p LEFT JOIN mesas m ON m.id=p.mesa_id WHERE p.status!='FECHADO' ORDER BY p.id DESC LIMIT ?").all(limite);
  if(q.status)return db.prepare('SELECT p.*,m.numero AS mesa_numero FROM pedidos p LEFT JOIN mesas m ON m.id=p.mesa_id WHERE p.status=? ORDER BY p.id DESC LIMIT ?').all(q.status,limite);
  return db.prepare('SELECT p.*,m.numero AS mesa_numero FROM pedidos p LEFT JOIN mesas m ON m.id=p.mesa_id ORDER BY p.id DESC LIMIT ?').all(limite);
});

app.get('/caixa',async()=>{
  const caixa=db.prepare("SELECT * FROM caixas WHERE status='ABERTO' ORDER BY id DESC LIMIT 1").get();
  if(!caixa)return {aberto:false,caixa:null,resumo:null};
  const resumo=db.prepare('SELECT forma,SUM(valor) AS total,COUNT(*) AS quantidade FROM movimentacao_caixa WHERE caixa_id=? GROUP BY forma ORDER BY forma').all((caixa as {id:number}).id);
  return {aberto:true,caixa,resumo};
});
app.post<{Body:{saldo_inicial?:number}}>('/caixa/abrir',async(req,reply)=>{
  const saldo=Number(req.body?.saldo_inicial??0);if(!Number.isFinite(saldo)||saldo<0)return reply.code(400).send({error:'Saldo inicial inválido'});
  if(db.prepare("SELECT id FROM caixas WHERE status='ABERTO' LIMIT 1").get())return reply.code(409).send({error:'Já existe um caixa aberto'});
  const result=db.prepare("INSERT INTO caixas (status,saldo_inicial) VALUES ('ABERTO',?)").run(saldo);return reply.code(201).send(db.prepare('SELECT * FROM caixas WHERE id=?').get(Number(result.lastInsertRowid)));
});
app.post<{Body:{tipo:string;forma?:string;valor:number;observacao?:string}}>('/caixa/movimentar',async(req,reply)=>{
  const {tipo,forma='DINHEIRO',valor}=req.body??{};
  if(!['SANGRIA','SUPRIMENTO'].includes(tipo))return reply.code(400).send({error:'Tipo de movimentação inválido'});
  if(!['DINHEIRO','PIX','CARTAO'].includes(forma))return reply.code(400).send({error:'Forma de pagamento inválida'});
  if(!Number.isFinite(Number(valor))||Number(valor)<=0)return reply.code(400).send({error:'Valor inválido'});
  const caixa=db.prepare("SELECT id FROM caixas WHERE status='ABERTO' ORDER BY id DESC LIMIT 1").get() as {id:number}|undefined;
  if(!caixa)return reply.code(409).send({error:'Nenhum caixa aberto'});
  db.prepare('INSERT INTO movimentacao_caixa (caixa_id,tipo,forma,valor) VALUES (?,?,?,?)').run(caixa.id,tipo,forma,Number(valor));return {ok:true};
});
app.post<{Body:{saldo_conferido?:number}}>('/caixa/fechar',async(req,reply)=>{
  const caixa=db.prepare("SELECT * FROM caixas WHERE status='ABERTO' ORDER BY id DESC LIMIT 1").get() as {id:number;saldo_inicial:number}|undefined;
  if(!caixa)return reply.code(409).send({error:'Nenhum caixa aberto'});
  const vendas=db.prepare("SELECT COALESCE(SUM(valor),0) AS total FROM movimentacao_caixa WHERE caixa_id=? AND tipo='VENDA'").get(caixa.id) as {total:number};
  const vendasDinheiro=db.prepare("SELECT COALESCE(SUM(valor),0) AS total FROM movimentacao_caixa WHERE caixa_id=? AND tipo='VENDA' AND forma='DINHEIRO'").get(caixa.id) as {total:number};
  const suprimentos=db.prepare("SELECT COALESCE(SUM(valor),0) AS total FROM movimentacao_caixa WHERE caixa_id=? AND tipo='SUPRIMENTO' AND forma='DINHEIRO'").get(caixa.id) as {total:number};
  const sangrias=db.prepare("SELECT COALESCE(SUM(valor),0) AS total FROM movimentacao_caixa WHERE caixa_id=? AND tipo='SANGRIA' AND forma='DINHEIRO'").get(caixa.id) as {total:number};
  const saldoFinal=caixa.saldo_inicial+vendasDinheiro.total+suprimentos.total-sangrias.total;const saldoConferido=req.body?.saldo_conferido;
  if(saldoConferido!==undefined&&(!Number.isFinite(Number(saldoConferido))||Number(saldoConferido)<0))return reply.code(400).send({error:'Saldo conferido inválido'});
  const diferenca=saldoConferido===undefined?null:Number(saldoConferido)-saldoFinal;
  db.prepare("UPDATE caixas SET status='FECHADO',fechado_em=CURRENT_TIMESTAMP,saldo_final=? WHERE id=?").run(saldoFinal,caixa.id);
  return {ok:true,saldo_final:saldoFinal,saldo_conferido:saldoConferido??null,diferenca,vendas:vendas.total,vendas_dinheiro:vendasDinheiro.total,suprimentos:suprimentos.total,sangrias:sangrias.total};
});

app.setErrorHandler((error,_req,reply)=>{app.log.error(error);return reply.code(error.statusCode??500).send({error:error.message||'Erro interno'})});
const port=Number(process.env.PORT??3333);await app.listen({port,host:'0.0.0.0'});console.log(`PitDog em http://localhost:${port}`);
