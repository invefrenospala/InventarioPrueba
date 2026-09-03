-- ============================================================
-- INVENTARIO FRENOS PALA — Esquema Supabase (versión limpia)
-- Ejecuta todo esto en: SQL Editor → New query → Run
--
-- Este script borra las tablas si ya existían y las crea de cero.
-- Es seguro ejecutarlo varias veces.
-- ============================================================

-- 1. Borrar tablas si existen (en orden inverso para respetar las FK)
DROP TABLE IF EXISTS barras      CASCADE;
DROP TABLE IF EXISTS movimientos CASCADE;
DROP TABLE IF EXISTS productos   CASCADE;

-- 2. Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: productos
-- ============================================================
CREATE TABLE productos (
  ref      TEXT         NOT NULL,
  cat      TEXT         NOT NULL DEFAULT '',
  nombre   TEXT         NOT NULL DEFAULT '',
  marca    TEXT         NOT NULL DEFAULT '',
  precio   NUMERIC(12,2) NOT NULL DEFAULT 0,
  minimo   INT          NOT NULL DEFAULT 0,
  stock    JSONB        NOT NULL DEFAULT '{"1":null,"2":null,"3":null,"4":null,"5":null}',
  CONSTRAINT productos_pkey PRIMARY KEY (ref)
);

-- ============================================================
-- TABLA: movimientos
-- ============================================================
CREATE TABLE movimientos (
  id        UUID         NOT NULL DEFAULT gen_random_uuid(),
  ref       TEXT         NOT NULL,
  tipo      TEXT         NOT NULL,
  cantidad  INT          NOT NULL DEFAULT 0,
  bodega    INT          NOT NULL,
  destino   INT,
  anterior  INT,
  fecha     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT movimientos_pkey   PRIMARY KEY (id),
  CONSTRAINT movimientos_tipo   CHECK (tipo IN ('ENTRADA','SALIDA','TRASLADO','CONTEO')),
  CONSTRAINT movimientos_bodega CHECK (bodega BETWEEN 1 AND 5),
  CONSTRAINT movimientos_ref_fk FOREIGN KEY (ref) REFERENCES productos (ref) ON DELETE CASCADE
);

CREATE INDEX idx_movimientos_ref   ON movimientos (ref);
CREATE INDEX idx_movimientos_fecha ON movimientos (fecha DESC);

-- ============================================================
-- TABLA: barras
-- ============================================================
CREATE TABLE barras (
  codigo TEXT NOT NULL,
  ref    TEXT NOT NULL,
  CONSTRAINT barras_pkey   PRIMARY KEY (codigo),
  CONSTRAINT barras_ref_fk FOREIGN KEY (ref) REFERENCES productos (ref) ON DELETE CASCADE
);

-- ============================================================
-- SEGURIDAD (RLS) — acceso abierto con clave anon
-- ============================================================
ALTER TABLE productos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE barras      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "productos_all"   ON productos   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "movimientos_all" ON movimientos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "barras_all"      ON barras      FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- DATOS INICIALES — 164 referencias de Frenos Pala
-- ============================================================
INSERT INTO productos (ref, cat, nombre, marca, precio, stock) VALUES
('FP-AMFD1','AMORTIGUADOR','ford fiesta titanium derecho','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMFD2','AMORTIGUADOR','ford fiesta titanium izquierdo','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMRE16','AMORTIGUADOR','renault kwid delantero','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":7}'),
('FP-AMHY1','AMORTIGUADOR','hyundai atos del der','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('FP-AMHY2','AMORTIGUADOR','hyundai atos del izq','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('FP-AMMZ6','AMORTIGUADOR','mazda 2 skyactive del derecho','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":3}'),
('FP-AMMZ7','AMORTIGUADOR','mazda 2 skyactive del izquierdo','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('FP-AMZU1','AMORTIGUADOR','suzuki swift dezire del derecho','',252100.84,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMZU2','AMORTIGUADOR','suzuki swift dezire del izquierdo','',252100.84,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMRE15','AMORTIGUADOR','renault duster 4x4 trasero','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('FP-AMMZ3','AMORTIGUADOR','mazda 2 del derecho','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMMZ4','AMORTIGUADOR','mazda 2 del izquiero','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMCH16','AMORTIGUADOR','chevrolet onix turbo del derecho','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMCH17','AMORTIGUADOR','chevrolet onix turbo del izquierda','',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMKI1','AMORTIGUADOR','kia picanto morning-i10 del derecho','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":3}'),
('FP-AMKI2','AMORTIGUADOR','kia picanto morning-i10 del izquierdo','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('FP-AMRE14','AMORTIGUADOR','renault duster 4x2 trasero','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('FP-AMRE9','AMORTIGUADOR','renault logan-sandero m/n del','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('FP-AMNI1','AMORTIGUADOR','nissan march del derecho','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('FP-AMRE11','AMORTIGUADOR','renault sandero-stepway m/n del','',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('FP-AMRE13','AMORTIGUADOR','renault duster 4x2-4x4 del','',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":8}'),
('FP-AMNI2','AMORTIGUADOR','nissan march del izquierdo','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('FP-AMKI4','AMORTIGUADOR','kia picanto ion del derecho','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('FP-AMKI5','AMORTIGUADOR','kia picanto ion del izquierdo','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":7}'),
('FP-AMRE6','AMORTIGUADOR','renault logan-sandero m/v del','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":11}'),
('FP-AMCH1','AMORTIGUADOR','chevrolet cronos del derecho','',126050.42,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('FP-AMCH2','AMORTIGUADOR','chevrolet cronos del izquierdo','',126050.42,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('FP-AMCH3','AMORTIGUADOR','chevrolet aveo-sail del derecho','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":19}'),
('FP-AMCH4','AMORTIGUADOR','chevrolet aveo-sail del izquierdo','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":18}'),
('FP-AMCH10','AMORTIGUADOR','chevrolet spark gt del derecho','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('FP-AMCH11','AMORTIGUADOR','chevrolet spark gt del izquierdo','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":8}'),
('FP-AMMZ8','AMORTIGUADOR','mazda 2 skyactive trasero','',117647.06,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMMZ9','AMORTIGUADOR','mazda 3 skyactive del izq','',201680.67,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMMZ11','AMORTIGUADOR','mazda 3 skyactive trasero','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMMZ12','AMORTIGUADOR','mazda cx5 sky m/n del der','',235294.11,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMCH30','AMORTIGUADOR','chevrolet tracker turbo del der','',218487.39,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMCH31','AMORTIGUADOR','chevrolet tracker turbo del izq','',218487.39,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMKI7','AMORTIGUADOR','kia grand ion del derecho','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('FP-AMKI8','AMORTIGUADOR','kia grand ion del izquierdo','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":3}'),
('FP-AMRE10','AMORTIGUADOR','renault logan-sandero 8V m/n del','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('FP-AMRE1','AMORTIGUADOR','renault clio II-simbol delantero','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":8}'),
('96482901','CAJA DE DIRECCION','cronos completa gti','GTI',319327.73,'{"1":null,"2":null,"3":null,"4":null,"5":3}'),
('06I031931','CAJA DE DIRECCION','hyundai i10 gti','GTI',294117.65,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('51712-G6000','DISCO','kia picanto gran ion all new apc','APC',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":41}'),
('BXDI-3602HL','DISCO','hiperventilado txl izq tras bex usa','BEX USA',252100.85,'{"1":null,"2":null,"3":null,"4":null,"5":5}'),
('BXDI-3602HR','DISCO','hiperventilado txl der tras bex usa','BEX USA',252100.85,'{"1":null,"2":null,"3":null,"4":null,"5":5}'),
('BXDI-3607HL','DISCO','hiperventilado txl izq del bex usa','BEX USA',285714.28,'{"1":null,"2":null,"3":null,"4":null,"5":3}'),
('FP-DI0523BR','DISCO','toyota prado txl-del brake usa','BRAKE USA',218487.40,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('FP-DI076BRH','DISCO','toyota vigo-fortuner del 4x4 hiper brake usa','BRAKE USA',352941.18,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('BXDI-3602','DISCO','toyota prado -txl TRAS bex usa','BEX USA',201680.68,'{"1":null,"2":null,"3":null,"4":null,"5":8}'),
('KBR-9009','DISCO','chevrolet sail-gt-beat ktc','KTC',0,'{"1":null,"2":null,"3":null,"4":null,"5":58}'),
('D-1038','DISCO','spark gt sail mb','MB',84033.61,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('D17B','DISCO','chevrolet spark gt mds','MDS',84033.64,'{"1":null,"2":null,"3":null,"4":null,"5":98}'),
('BXDI-3607HR','DISCO','hiperventilado txl der del bex usa','BEX USA',285714.28,'{"1":null,"2":null,"3":null,"4":null,"5":7}'),
('D-1021-V','DISCO','toyota txl del mb','MB',201680.67,'{"1":null,"2":null,"3":null,"4":null,"5":8}'),
('D327A','DISCO','grand ion del mds','MDS',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":92}'),
('FPDI0228BR','DISCO','hilux vigo-fortuner m/v hiperv del','',0,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('FPDI0345BR','DISCO','tucson sportage trasero solido','',0,'{"1":null,"2":null,"3":null,"4":null,"5":8}'),
('FPDI0523BR','DISCO','toyota prado txl tras','',0,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('FPDI076BRH','DISCO','fortuner-vigo hiperventilado del','',0,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('HBD0376L','DISCO','prado land c -j250 hiper del izq bapco','BAPCO',420168.07,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('HBD0376R','DISCO','prado land c-j250 hiper del der bapco','BAPCO',420168.07,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('KBR9007','DISCO','chevrolet aveo ktc','KTC',100840.33,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('KBR9214','DISCO','logan-sandero m/n ktc','KTC',100840.34,'{"1":null,"2":null,"3":null,"4":null,"5":17}'),
('KBR9737','DISCO','toyota tundra-sahara del ktc','KTC',403361.35,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('PBD0376','DISCO','prado land cruiser j250 del bapco','BAPCO',378151.27,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('D28G','DISCO','chevrolet cobalt-onix sin abs','',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":64}'),
('D705E','DISCO','logan-sandero m/n mds','MDS',100840.33,'{"1":null,"2":null,"3":null,"4":null,"5":44}'),
('D253G','DISCO','mazda 3 sky tras emer palanca mds','MDS',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('D192G','DISCO','chevrolet tracker del mds','MDS',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('D343G','DISCO','fortuner M/N-prado txl del mds','MDS',294117.64,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('D-904-V','DISCO','hyundai atos mb','MB',67226.90,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('BD03-2467','DISCO','chevrolet aveo del kmx','KMX',100840.34,'{"1":null,"2":null,"3":null,"4":null,"5":88}'),
('DR-685-V','DISCO','chevrolet aveo del mb','MB',100840.34,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('D17','DISCO','chevrolet corsa del mds','MDS',100840.33,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('D-906-V','DISCO','hyundai i10-kia picanto ion mb','MB',75630.26,'{"1":null,"2":null,"3":null,"4":null,"5":200}'),
('D251D','DISCO','hyundai i10-kia picanto ion mds','MDS',75630.26,'{"1":null,"2":null,"3":null,"4":null,"5":100}'),
('BD05-2258','DISCO','hyundai i10-kia picanto ion kmx','KMX',75630.26,'{"1":null,"2":null,"3":null,"4":null,"5":116}'),
('BD01-9408','DISCO','renault twingo del kmx','KMX',84033.61,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('18540 (10237)','PASTAS','hyundai atos','',42016.80,'{"1":null,"2":null,"3":null,"4":null,"5":108}'),
('7994-D1521H','PASTAS','honda crv del 7994 bex usa hd','BEX USA',210084.04,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('8825-D1612H','PASTAS','ford explorer tras 8825 bx','',252100.85,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('9135-D1906H','PASTAS','dodge ram 700 bex usa','BEX USA',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K4A00-TAXI','PASTAS','gran i10 ktc taxi','KTC',58823.53,'{"1":null,"2":null,"3":null,"4":null,"5":50}'),
('K9997-TAXI','PASTAS','gran ion ktc','KTC',58823.53,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('TIJERA10','TIJERA','mazda 2- ford fiesta izq','',134453.79,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('TIJERA9','TIJERA','mazda 2-ford fiesta der','',134453.79,'{"1":null,"2":null,"3":null,"4":null,"5":7}'),
('TIJERA38','TIJERA','renault logan-sandero m/n izq','',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('TIJERA39','TIJERA','renault logan-sandero m/n der','',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":6}'),
('TIJERA42','TIJERA','renault kwid izquierda','',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('TIJERA43','TIJERA','renault kwid derecha','',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('TIJERA28','TIJERA','chevrolet aveo-sail derecha','',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('TIJERA7','TIJERA','mazda 3-6-cx5 skyactive der','',252100.85,'{"1":null,"2":null,"3":null,"4":null,"5":1}'),
('TIJERA8','TIJERA','mazda 3-6-cx5 skyactive izq','',252100.85,'{"1":null,"2":null,"3":null,"4":null,"5":2}'),
('TIJERA34','TIJERA','renault duster 4x4-4x2 der','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('TIJERA35','TIJERA','renault duster 4x4-4x2 izq','',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('TIJERA32','TIJERA','chevrolet onix-cobalt der','',151260.51,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('TIJERA33','TIJERA','chevrolet onix-cobalt izq','',151260.51,'{"1":null,"2":null,"3":null,"4":null,"5":4}'),
('FP-LIMPIA1','LIMPIADOR','frenos y partes','',0,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('TIJERA29','TIJERA','chevrolet aveo-sail izquierda','',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('K1971-CR','PASTAS','i25-rio space 9197-8806(pata peq) ktc','KTC',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K0797-CR','PASTAS','chevrolet aveo-optra del 7667 ktc','KTC',92436.98,'{"1":null,"2":null,"3":null,"4":null,"5":90}'),
('K1678-CR','PASTAS','chevrolet captiva del 8381 ktc','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1275-CR','PASTAS','chevrolet captiva tras 8391 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K10208-CR','PASTAS','chevrolet corsa corta 10208 KTC','KTC',100840.34,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K10298-HD','PASTAS','chevrolet dmax 10298 hd ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K10298-CR','PASTAS','chevrolet luv dmax 10298 ktc','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('K1039-CR','PASTAS','chevrolet dmax larga 7943 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K99039','PASTAS','chevrolet n400','KTC',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K8947-CR','PASTAS','chevrolet onix-joy ktc','KTC',117647.06,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K99003-CR','PASTAS','chevrolet onix turbo ktc','KTC',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K99003-COF','PASTAS','chevrolet onix turbo ktc cof','KTC',168067.22,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1661-CR','PASTAS','chevrolet sail del 10316 ktc','KTC',92436.98,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1467-CR','PASTAS','chevrole traker-orlando del 8667 ktc','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K2019-CR','PASTAS','chevrolet tracker delantera 9144 ktc','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1834-CR','PASTAS','ford edge-duster M/N tras 8893 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1911-CR','PASTAS','nissan frontier alaskan 9141','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1593-CR','PASTAS','i25-i35-santa fe 8806-8751 ktc','KTC',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":40}'),
('K0768-CR','PASTAS','vwg jetta 7709 del ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1590-CR','PASTAS','chevrolet spark gt-beat 10313 ktc','KTC',92436.98,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('K1414-CR','PASTAS','ford truck 150/raptor 8528 ktc','KTC',294117.65,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1848-CR','PASTAS','kia soul trasera 8428 ktc ceramica','KTC',134453.79,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K0924-CR','PASTAS','kia sportage del 7825 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K10287-CR','PASTAS','mazda 2 del 10287 ktc','KTC',117647.06,'{"1":null,"2":null,"3":null,"4":null,"5":50}'),
('K1852-CR','PASTAS','mazda 2 skyactive del 9081 ktc','KTC',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1044-CR','PASTAS','mazda 3 del 10257 KTC','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('K1095-CR','PASTAS','mazda 3 tras 7957 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K1679-CR','PASTAS','mazda 3 skyactive tras 8908 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K2219-CR','PASTAS','mazda 3 skyactive-cx30 tras 2219 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K99080-CR','PASTAS','mazda bt 50 ranger 10254 CER ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1728-CR','PASTAS','mazda cx3-cx30 del 8952 ktc','KTC',142857.14,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1258-CR','PASTAS','mazda cx9 cx7 del ktc 8377','KTC',210084.04,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1623-CR','PASTAS','mazda cx5 del 8836 ktc','KTC',210084.04,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1846-CR','PASTAS','mazda cx5 tras 9073 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K2218-CR','PASTAS','mazda 3 skyactive del 2218 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K2426-CR','PASTAS','mazda cx50 del 9651 ktc','KTC',235294.11,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K22032-CR','PASTAS','mercedes C200 del 9066 ktc','KTC',235294.12,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1435-CR','PASTAS','micra-duster del 8553 ktc','KTC',134453.78,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1592-CR','PASTAS','nissan march del 8804 ktc','KTC',109243.70,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1965-CR','PASTAS','nissan qashqai tras 9190','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K0008-CR','PASTAS','kia picanto ion 10318 ktc','KTC',100840.34,'{"1":null,"2":null,"3":null,"4":null,"5":null}'),
('K99056-CR','PASTAS','renault kardian del 9852 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K10243-CR','PASTAS','renault clio-simbol del 10243 ktc','KTC',92436.99,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K1627-CR','PASTAS','renault duster 4x4 8844 ktc','KTC',134453.79,'{"1":null,"2":null,"3":null,"4":null,"5":40}'),
('K0905-CR','PASTAS','renault koleos-murano 7784 tras ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K99008-CR','PASTAS','renault kwid del ktc','KTC',109243.69,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K9222-CR','PASTAS','renault logan m/n 9061 ktc','KTC',92436.97,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1917-CR','PASTAS','hyundai santafe 8400-8322 ktc','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K0866-CR','PASTAS','mitsubishi montero del 7741 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1519-CR','PASTAS','mitsubishi sportero 10296 ktc','KTC',184873.95,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1676-CR','PASTAS','ford ranger-bt 50 del 8905 ktc','KTC',235294.12,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K99055-CR','PASTAS','renault arkana del 9851 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1968-CR','PASTAS','vw taos-t cross-golf 9193 ktc','KTC',210084.04,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K0602-CR','PASTAS','terios-lancer del 7417 ktc','KTC',126050.42,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K2076-CR','PASTAS','toyota rav4 del 9311 ktc','KTC',184873.94,'{"1":null,"2":null,"3":null,"4":null,"5":90}'),
('K1211-CR','PASTAS','toyota rav del 8331 ktc','KTC',184873.95,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K99024-CR','PASTAS','tucson hybrid 2022 del 9538 ktc','KTC',210084.03,'{"1":null,"2":null,"3":null,"4":null,"5":30}'),
('K99026-CR','PASTAS','tucson hybrid 2022 tras 9744 ktc','KTC',168067.23,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K2096-CR','PASTAS','suzuki vitara cross 9331 del ktc','KTC',184873.95,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K0606-CR','PASTAS','toyota prado txl 7487 tras ktc','KTC',218487.40,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K1641-CR','PASTAS','vwg gol new del 8868 ktc','KTC',151260.50,'{"1":null,"2":null,"3":null,"4":null,"5":20}'),
('K1855-CR','PASTAS','tucson-i35 4x4 del 8412 ktc','KTC',184873.96,'{"1":null,"2":null,"3":null,"4":null,"5":40}'),
('K10235-CR','PASTAS','corsa evolution 10235 ktc','KTC',100840.33,'{"1":null,"2":null,"3":null,"4":null,"5":10}'),
('K0497-CR','PASTAS','hyundai accent del 7376 ktc','KTC',100840.33,'{"1":null,"2":null,"3":null,"4":null,"5":10}');

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM productos)   AS total_productos,
  (SELECT COUNT(*) FROM movimientos) AS total_movimientos,
  (SELECT COUNT(*) FROM barras)      AS total_barras;
