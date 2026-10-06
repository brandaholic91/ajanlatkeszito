// Minden beállítás környezeti változóból jön (lásd .env.example). Ez a fájl csak a szerveren fut.

// Kötelező változó: ha hiányzik, érthető hibával álljon meg, ne egy későbbi, rejtélyes hibával.
// Függvény, nem konstans, mert így csak akkor olvas, amikor egy kérés tényleg használja,
// és a build (ahol nincsenek beállítva a változók) nem hasal el rajta.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Hiányzik a(z) ${name} környezeti változó.`);
  }
  return value;
}

export function databaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

// Az n8n címe a belső hálózaton, pl. http://n8n:5678
export function n8nBaseUrl(): string {
  return requireEnv("N8N_BASE_URL");
}

export function s3Config() {
  return {
    endpoint: requireEnv("S3_ENDPOINT"),
    accessKey: requireEnv("S3_ACCESS_KEY"),
    secretKey: requireEnv("S3_SECRET_KEY"),
    bucket: requireEnv("S3_BUCKET"),
  };
}

// Ennyi új kérést enged naponta. Ez a nyelvi modell költségét védi: minden kérés egy modellhívás.
export function dailyRequestLimit(): number {
  const parsed = Number.parseInt(process.env.DAILY_REQUEST_LIMIT ?? "", 10);
  // Ha nincs megadva vagy nem szám, a parseInt NaN-t ad: ilyenkor marad az alapérték.
  return Number.isNaN(parsed) ? 50 : parsed;
}
