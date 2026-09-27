PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'MESA',
  status TEXT NOT NULL DEFAULT 'LIVRE',
  capacidade INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT '#FF6B00',
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  preco REAL NOT NULL CHECK (preco >= 0),
  custo REAL NOT NULL DEFAULT 0 CHECK (custo >= 0),
  tempo_preparo_min INTEGER NOT NULL DEFAULT 10 CHECK (tempo_preparo_min >= 0),
  controla_estoque INTEGER NOT NULL DEFAULT 1,
  ativo INTEGER NOT NULL DEFAULT 1,
  UNIQUE(nome, categoria_id)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id INTEGER REFERENCES mesas(id),
  status TEXT NOT NULL DEFAULT 'ABERTO',
  origem TEXT NOT NULL DEFAULT 'MESA',
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  observacao_geral TEXT,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fechado_em DATETIME
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  qtd INTEGER NOT NULL DEFAULT 1 CHECK (qtd > 0),
  preco_unit REAL NOT NULL CHECK (preco_unit >= 0),
  observacao TEXT,
  status_cozinha TEXT NOT NULL DEFAULT 'PENDENTE',
  agrupamento_key TEXT
);

CREATE TABLE IF NOT EXISTS itens_adicionais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_pedido_id INTEGER NOT NULL REFERENCES itens_pedido(id) ON DELETE CASCADE,
  produto_adicional_id INTEGER NOT NULL REFERENCES produtos(id),
  qtd INTEGER NOT NULL DEFAULT 1 CHECK (qtd > 0),
  preco REAL NOT NULL DEFAULT 0 CHECK (preco >= 0)
);

CREATE TABLE IF NOT EXISTS caixas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aberto_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fechado_em DATETIME,
  saldo_inicial REAL NOT NULL DEFAULT 0,
  saldo_final REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ABERTO'
);

CREATE TABLE IF NOT EXISTS movimentacao_caixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caixa_id INTEGER NOT NULL REFERENCES caixas(id),
  pedido_id INTEGER REFERENCES pedidos(id),
  tipo TEXT NOT NULL,
  forma TEXT NOT NULL,
  valor REAL NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS estoque_movimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  tipo TEXT NOT NULL,
  qtd REAL NOT NULL,
  pedido_id INTEGER REFERENCES pedidos(id),
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO mesas (id, numero, tipo, capacidade) VALUES
  (1,'M01','MESA',4),(2,'M02','MESA',4),(3,'M03','MESA',4),
  (4,'B01','BALCAO',2),(5,'MOTO','ENTREGA',1);

INSERT OR IGNORE INTO categorias (id, nome, cor, ordem) VALUES
  (1,'Lanches','#FF6B00',1),(2,'Bebidas','#0099FF',2),
  (3,'Porcoes','#22C55E',3),(4,'Adicionais','#A855F7',4);

INSERT OR IGNORE INTO produtos (id, nome, categoria_id, preco) VALUES
  (1,'X-Tudo',1,22.00),(2,'X-Burguer',1,15.00),(3,'X-Salada',1,18.00),
  (4,'X-Egg',1,19.00),(5,'X-Bacon',1,24.00),(6,'X-Calabresa',1,26.00),
  (7,'X-Frango',1,23.00),(8,'Misto',1,12.00),
  (9,'Coca Lata',2,5.00),(10,'Guarana 1L',2,8.00),(11,'Suco Nat.',2,7.00),(12,'Agua',2,3.00),
  (13,'Batata P',3,15.00),(14,'Batata G',3,25.00),(15,'Calabresa',3,28.00),
  (16,'Bacon',4,3.00),(17,'Ovo',4,2.00),(18,'Cheddar',4,3.50),(19,'Catupiry',4,3.00),(20,'Calabresa Extra',4,4.00),(21,'Frango Extra',4,5.00);
