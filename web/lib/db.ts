// Az egyetlen hely, ahol az alkalmazás az adatbázishoz kapcsolódik. Csak a szerveren fut.
import { Pool } from "pg";
import { databaseUrl } from "./config";

// A Pool néhány nyitott kapcsolatot tart készenlétben, és kérésenként kölcsönad egyet.
// Így nem kell minden lekérdezéshez újra kapcsolódni (az oldal fél másodpercenként kérdez).
let pool: Pool | undefined;

function getPool(): Pool {
  // Az első lekérdezéskor jön létre, utána mindig ugyanazt adja vissza.
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl(), max: 5 });
  }
  return pool;
}

// Lekérdezés futtatása. A paraméterek ($1, $2, ...) mindig külön mennek, sosem a szövegbe fűzve:
// az adatbázis így adatként kezeli őket, és nem lehet velük SQL-t becsempészni (SQL injection).
//
// A <Row> típusparaméter azt mondja meg, milyen mezői vannak egy eredménysornak,
// pl. query<{ count: number }>(...). Ez csak a fordítónak szól, az adatbázis nem ellenőrzi.
export async function query<Row>(text: string, params: unknown[] = []): Promise<Row[]> {
  const result = await getPool().query(text, params);
  return result.rows as Row[];
}
