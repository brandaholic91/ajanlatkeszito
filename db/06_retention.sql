-- Adatmegőrzés: a kérések 14 nap után törlődnek. Az adatkezelési tájékoztató (web/app/adatkezeles) ezt ígéri.
-- Ez a fájl újra lefuttatható egy már élő adatbázison is (CREATE OR REPLACE).
--
-- A törlés két lépés, és a sorrend számít: előbb a tárolt PDF, utána az adatbázis sorai.
-- Ok: a PDF helyét (pdf_key) a kérés sora őrzi. Ha a sor törlődne előbb, és a PDF törlése utána elhasalna,
-- a fájl örökre a tárolóban maradna, és már semmi nem mutatna rá. Így viszont a következő futás újra megpróbálja.

-- 1. lépés: melyik kérés járt le. Kimenet: hány van, és melyek (a tárolt PDF helyével; '' = nincs PDF).
-- Egy futás legfeljebb 50-et ad vissza; a többi a következő futásra marad.
CREATE OR REPLACE FUNCTION expired_requests(p_after_days integer DEFAULT 14) RETURNS jsonb
LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'count', count(*),
        'requests', COALESCE(jsonb_agg(
            jsonb_build_object('request_id', e.id, 'pdf_key', COALESCE(e.pdf_key, '')) ORDER BY e.id), '[]'::jsonb))
    FROM (
        SELECT id, pdf_key FROM requests
        WHERE created_at < now() - make_interval(days => p_after_days)
        ORDER BY id
        LIMIT 50
    ) e;
$$;

-- 2. lépés: egy lejárt kérés törlése a lépésnaplójával és az ajánlataival együtt.
-- A kort itt is ellenőrzi, hogy egy elírt azonosítóval ne lehessen friss kérést törölni.
-- Kimenet: igaz, ha törölt; hamis, ha nincs ilyen kérés, vagy még nem járt le.
CREATE OR REPLACE FUNCTION delete_expired_request(p_request_id bigint, p_after_days integer DEFAULT 14) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM requests
    WHERE id = p_request_id AND created_at < now() - make_interval(days => p_after_days)
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    -- A sorrend a hivatkozások miatt kötött: a napló és az ajánlatok a kérés sorára mutatnak.
    DELETE FROM request_events WHERE request_id = p_request_id;
    DELETE FROM quotes WHERE request_id = p_request_id;
    DELETE FROM requests WHERE id = p_request_id;
    RETURN true;
END;
$$;
