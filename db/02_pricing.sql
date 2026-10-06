-- Az árazás és az ellenőrzés. Ez a demó fő állítása:
-- az árat mindig ez a lekérdezés számolja, a nyelvi modell soha.

-- 4. lépés: ellenőrzés.
-- Bemenet: a nyelvi modell kimenete. Kimenet: a hibák listája; üres lista = mehet az árazás.
CREATE FUNCTION check_request(p_extracted jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    WITH items AS (
        SELECT i ->> 'sku' AS sku, i ->> 'qty' AS qty
        FROM jsonb_array_elements(coalesce(p_extracted -> 'items', '[]'::jsonb)) AS i
    ),
    problems AS (
        -- egyetlen árazható tétel sincs
        SELECT 'Nem találtam árazható tételt a kérésben.' AS problem
        WHERE NOT EXISTS (SELECT 1 FROM items)
        UNION ALL
        -- a modell jelezte, hogy valamit nem tudott az árlistához kötni
        SELECT 'Nincs az árlistán: ' || (u ->> 'text')
        FROM jsonb_array_elements(coalesce(p_extracted -> 'unknown', '[]'::jsonb)) AS u
        UNION ALL
        -- a modell olyan azonosítót adott, ami nem létezik (védelem a kitalált tétel ellen)
        SELECT 'Ismeretlen tételazonosító: ' || coalesce(items.sku, '(üres)')
        FROM items
        WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = items.sku)
        UNION ALL
        -- hiányzó vagy értelmetlen mennyiség
        SELECT 'Hiányzik a mennyiség: ' || coalesce(items.sku, '(üres)')
        FROM items
        WHERE items.qty IS NULL OR items.qty !~ '^[0-9]+$' OR items.qty::bigint NOT BETWEEN 1 AND 100000
        UNION ALL
        SELECT 'A hűségidő csak 12 vagy 24 hónap lehet.'
        WHERE jsonb_typeof(p_extracted -> 'term_months') = 'number'
          AND (p_extracted ->> 'term_months') NOT IN ('12', '24')
    )
    SELECT coalesce(jsonb_agg(problem), '[]'::jsonb) FROM problems;
$$;


-- 3. lépés: árazás.
-- Bemenet: [{"sku": "MOB-PLUS", "qty": 30}, ...] és a hűségidő (12 vagy 24).
-- Kimenet: egy JSON a sorokkal és az összesítővel. Ez megy változtatás nélkül a PDF-készítőnek.
CREATE FUNCTION price_quote(p_items jsonb, p_term integer) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    WITH asked AS (
        -- ha ugyanaz a tétel kétszer szerepel, összeadjuk
        SELECT i ->> 'sku' AS sku, sum((i ->> 'qty')::integer)::integer AS qty
        FROM jsonb_array_elements(p_items) AS i
        GROUP BY 1
    ),
    lines AS (
        SELECT
            p.sku, p.name, p.category, p.unit, p.discountable, p.one_time_net AS one_time_list,
            a.qty,
            CASE WHEN p_term = 24 THEN p.monthly_net_24 ELSE p.monthly_net_12 END AS monthly_list,
            -- a kategória összes kedvezményezhető darabszáma: ez dönti el a sávot
            coalesce(sum(a.qty) FILTER (WHERE p.discountable) OVER (PARTITION BY p.category), 0) AS category_qty
        FROM asked a
        JOIN products p USING (sku)
    ),
    discounted AS (
        SELECT
            l.*,
            CASE WHEN l.discountable THEN coalesce((
                SELECT max(d.discount_pct)
                FROM volume_discounts d
                WHERE d.category = l.category AND d.min_qty <= l.category_qty
            ), 0) ELSE 0 END AS discount_pct
        FROM lines l
    ),
    priced AS (
        -- az egységárat kerekítjük egész forintra, a sor összege egységár × mennyiség
        SELECT
            d.*,
            round(d.monthly_list * (100 - d.discount_pct) / 100)::integer AS monthly_unit,
            round(d.one_time_list * (100 - d.discount_pct) / 100)::integer AS one_time_unit
        FROM discounted d
    ),
    totals AS (
        SELECT
            coalesce(sum(one_time_unit * qty), 0)::bigint AS one_time_net,
            coalesce(sum(monthly_unit * qty), 0)::bigint AS monthly_net,
            coalesce(sum(one_time_list * qty), 0)::bigint AS one_time_list,
            coalesce(sum(monthly_list * qty), 0)::bigint AS monthly_list
        FROM priced
    )
    SELECT jsonb_build_object(
        'term_months', p_term,
        'vat_pct', 27,
        'lines', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'sku', sku,
                'name', name,
                'category', category,
                'unit', unit,
                'qty', qty,
                'discount_pct', discount_pct,
                'monthly_list', monthly_list,
                'monthly_unit', monthly_unit,
                'monthly_total', monthly_unit * qty,
                'one_time_list', one_time_list,
                'one_time_unit', one_time_unit,
                'one_time_total', one_time_unit * qty
            ) ORDER BY array_position(ARRAY['mobil', 'internet', 'eszkoz', 'felho', 'uzemeltetes'], category), sku), '[]'::jsonb)
            FROM priced
        ),
        'totals', jsonb_build_object(
            'one_time_net', t.one_time_net,
            'one_time_vat', round(t.one_time_net * 0.27),
            'one_time_gross', t.one_time_net + round(t.one_time_net * 0.27),
            'monthly_net', t.monthly_net,
            'monthly_vat', round(t.monthly_net * 0.27),
            'monthly_gross', t.monthly_net + round(t.monthly_net * 0.27),
            -- a teljes szerződéses érték: egyszeri díj + havidíj × hűségidő
            'contract_net', t.one_time_net + t.monthly_net * p_term,
            'contract_gross', t.one_time_net + t.monthly_net * p_term
                              + round((t.one_time_net + t.monthly_net * p_term) * 0.27),
            -- ennyit spórol a mennyiségi kedvezménnyel a teljes időszakra
            'discount_net', (t.one_time_list - t.one_time_net) + (t.monthly_list - t.monthly_net) * p_term
        )
    )
    FROM totals t;
$$;


-- Egy lépés beírása a lépésnaplóba. A workflow-k is ezt hívják: SELECT log_event(<kérés>, '<lépés>');
CREATE FUNCTION log_event(p_request_id bigint, p_step text) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO request_events (request_id, step) VALUES (p_request_id, p_step);
$$;


-- A 3–4. lépés egyben, ezt hívja az n8n: ellenőriz, áraz, ment, és visszaadja az eredményt.
-- Ha a kérésben nincs hűségidő, mindkét változat (12 és 24 hónap) elkészül.
-- Közben a lépésnaplóba is ír: extracted (megjött a modell válasza), checked, majd priced vagy needs_clarification.
CREATE FUNCTION process_request(p_request_id bigint, p_extracted jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_problems jsonb;
    v_terms    integer[];
    v_term     integer;
    v_number   text;
    v_quotes   jsonb := '[]'::jsonb;
BEGIN
    PERFORM log_event(p_request_id, 'extracted');
    v_problems := check_request(p_extracted);
    PERFORM log_event(p_request_id, 'checked');

    IF jsonb_array_length(v_problems) > 0 THEN
        UPDATE requests
        SET status = 'needs_clarification', extracted = p_extracted, problems = v_problems
        WHERE id = p_request_id;
        PERFORM log_event(p_request_id, 'needs_clarification');
        RETURN jsonb_build_object('status', 'needs_clarification', 'problems', v_problems, 'quotes', v_quotes);
    END IF;

    IF jsonb_typeof(p_extracted -> 'term_months') = 'number' THEN
        v_terms := ARRAY[(p_extracted ->> 'term_months')::integer];
    ELSE
        v_terms := ARRAY[12, 24];
    END IF;

    FOREACH v_term IN ARRAY v_terms LOOP
        v_number := 'AJ-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('quote_number_seq')::text, 4, '0');
        INSERT INTO quotes (request_id, number, term_months, priced)
        VALUES (p_request_id, v_number, v_term, price_quote(p_extracted -> 'items', v_term));
        v_quotes := v_quotes || (
            SELECT jsonb_build_object('number', q.number, 'term_months', q.term_months,
                                      'valid_until', q.valid_until, 'priced', q.priced)
            FROM quotes q WHERE q.number = v_number
        );
    END LOOP;

    UPDATE requests
    SET status = 'priced', extracted = p_extracted, problems = '[]'::jsonb
    WHERE id = p_request_id;
    PERFORM log_event(p_request_id, 'priced');
    RETURN jsonb_build_object('status', 'priced', 'problems', v_problems, 'quotes', v_quotes);
END;
$$;
