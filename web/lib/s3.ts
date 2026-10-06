// Az objektumtároló (RustFS, S3-kompatibilis) elérése. Csak a szerveren fut.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { s3Config } from "./config";

// Egy tárolt PDF letöltése a kulcsa alapján. A kulcs mindig az adatbázisból jön (requests.pdf_key),
// sosem a böngészőtől: így senki nem tud tetszőleges fájlt kikérni a tárolóból.
export async function getPdfObject(key: string) {
  const config = s3Config();
  const client = new S3Client({
    endpoint: config.endpoint,
    region: "us-east-1", // a RustFS-nek mindegy, de az AWS-kliens megköveteli, hogy legyen
    // path-style: a bucket neve az útvonalba kerül (http://rustfs:9000/ajanlat-demo/...),
    // nem a gépnév elé (http://ajanlat-demo.rustfs:9000/...). Saját tárolónál csak így működik.
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });
  return client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
}
