-- Kitalált árlista. Egyik ár sem valós szolgáltató díja.

INSERT INTO products (sku, name, category, unit, monthly_net_12, monthly_net_24, one_time_net, discountable, hint) VALUES
-- mobil
('MOB-START',      'Mobil Start (5 GB)',                 'mobil',       'db',        3990,  3490,      0, true,  'alap mobil-előfizetés kevés adattal'),
('MOB-PLUS',       'Mobil Plusz (30 GB)',                'mobil',       'db',        6290,  5490,      0, true,  'általános mobil-előfizetés; ez az alapértelmezett, ha nincs megadva adatkeret'),
('MOB-MAX',        'Mobil Korlátlan',                    'mobil',       'db',        9990,  8990,      0, true,  'korlátlan adat'),
-- internet
('NET-300',        'Üzleti internet 300 Mbit/s',         'internet',    'telephely', 14900, 12900,  25000, false, 'kis iroda, 300 megabit'),
('NET-1000',       'Üzleti internet 1 Gbit/s',           'internet',    'telephely', 22900, 19900,  25000, false, 'gigabites internet'),
('NET-2000',       'Üzleti internet 2 Gbit/s',           'internet',    'telephely', 39900, 34900,  45000, false, '2 gigabit, nagy telephely'),
('NET-FIXIP',      'Fix IP-cím',                         'internet',    'db',         2500,  2500,      0, false, 'fix vagy statikus IP'),
-- eszköz
('DEV-LAPTOP-STD', 'Üzleti laptop 14" (16 GB, 512 GB)',  'eszkoz',      'db',            0,     0, 289000, true,  'általános irodai laptop; ez az alapértelmezett laptop'),
('DEV-LAPTOP-PRO', 'Üzleti laptop 15" Pro (32 GB, 1 TB)','eszkoz',      'db',            0,     0, 459000, true,  'erős laptop fejlesztőnek, tervezőnek'),
('DEV-PHONE-STD',  'Okostelefon Standard',               'eszkoz',      'db',            0,     0, 119000, true,  'általános céges telefon'),
('DEV-PHONE-PRO',  'Okostelefon Pro',                    'eszkoz',      'db',            0,     0, 329000, true,  'felső kategóriás telefon'),
('DEV-MONITOR',    'Monitor 24" Full HD',                'eszkoz',      'db',            0,     0,  54900, true,  'monitor, kijelző'),
('DEV-DOCK',       'USB-C dokkoló',                      'eszkoz',      'db',            0,     0,  39900, true,  'dokkoló laptophoz'),
('DEV-ROUTER',     'Irodai WiFi 6 router',               'eszkoz',      'db',            0,     0,  69900, true,  'wifi, vezeték nélküli hálózat az irodában'),
-- felhő
('CLD-MAIL',       'Céges levelezés (50 GB postafiók)',  'felho',       'fő',         1890,  1690,      0, true,  'céges e-mail, levelezés'),
('CLD-OFFICE',     'Irodai csomag (levelezés + office)', 'felho',       'fő',         4390,  3990,      0, true,  'levelezés és irodai programok együtt'),
('CLD-BACKUP',     'Felhős mentés (200 GB)',             'felho',       'fő',         1490,  1290,      0, true,  'mentés, backup'),
('CLD-VPS',        'Virtuális szerver (4 vCPU, 8 GB)',   'felho',       'db',        16900, 14900,      0, true,  'szerver, hoszting'),
-- üzemeltetés
('OPS-HELPDESK',   'Távoli üzemeltetés és helpdesk',     'uzemeltetes', 'fő',         5500,  4900,      0, true,  'rendszergazda, üzemeltetés, helpdesk'),
('OPS-SECURITY',   'Végpontvédelem',                     'uzemeltetes', 'fő',         1390,  1190,      0, true,  'vírusvédelem, biztonság'),
('OPS-INSTALL',    'Eszköz beüzemelése',                 'uzemeltetes', 'db',            0,     0,   9900, true,  'laptopok, telefonok beállítása, telepítése'),
('OPS-NETWORK',    'Irodai hálózat kiépítése',           'uzemeltetes', 'telephely',     0,     0, 149000, false, 'kábelezés, hálózatépítés az irodában');

INSERT INTO volume_discounts (category, min_qty, discount_pct) VALUES
('mobil',        10,  5), ('mobil',        25, 10), ('mobil',        50, 15), ('mobil',       100, 20),
('eszkoz',       10,  3), ('eszkoz',       25,  5), ('eszkoz',       50,  8),
('felho',        25,  5), ('felho',        50, 10), ('felho',       100, 15),
('uzemeltetes',  25,  5), ('uzemeltetes',  50, 10);
