-- A második workflow (Jóváhagyás és küldés) adatbázis-oldala.

-- Állapotváltás és naplózás egyben: a kérés új állapota lesz a lépés neve a lépésnaplóban is.
CREATE FUNCTION set_status(p_request_id bigint, p_status text) RETURNS void
LANGUAGE sql AS $$
    UPDATE requests SET status = p_status WHERE id = p_request_id;
    SELECT log_event(p_request_id, p_status);
$$;


-- 5. lépés: a néző rányomott a „Mehet” gombra.
-- Kimenet: status = approved | not_found | not_approvable. Jóváhagyáskor benne van minden, ami a PDF-hez és a levélhez kell.
-- A send_email hamis, ha aznap már elment a napi keret (visszaélés ellen): ilyenkor a PDF elkészül, de levél nem megy.
CREATE FUNCTION approve_request(p_public_id uuid, p_daily_mail_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_request    requests%ROWTYPE;
    v_sent_today integer;
BEGIN
    -- FOR UPDATE: zárolja a sort, így dupla kattintásnál a második hívás megvárja az elsőt, és már 'approved' állapotot lát
    SELECT * INTO v_request FROM requests WHERE public_id = p_public_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_request.status <> 'priced' THEN
        RETURN jsonb_build_object('status', 'not_approvable', 'current_status', v_request.status);
    END IF;

    SELECT count(*) INTO v_sent_today
    FROM request_events
    WHERE step IN ('sent', 'reminded') AND at >= date_trunc('day', now()); -- az emlékeztető is levél, ugyanabból a keretből megy

    PERFORM set_status(v_request.id, 'approved');

    RETURN jsonb_build_object(
        'status', 'approved',
        'request_id', v_request.id,
        'customer_email', v_request.email,
        'request_text', v_request.raw_text,
        'send_email', v_sent_today < p_daily_mail_limit,
        'quotes', (
            SELECT jsonb_agg(
                jsonb_build_object('number', q.number, 'term_months', q.term_months,
                                   'valid_until', q.valid_until, 'priced', q.priced)
                ORDER BY q.term_months
            )
            FROM quotes q WHERE q.request_id = v_request.id
        )
    );
END;
$$;


-- 6. lépés: a PDF bekerült az objektumtárolóba. Innentől a letöltés ezt a fájlt adja vissza, nem készül új.
CREATE FUNCTION store_pdf_key(p_request_id bigint, p_key text) RETURNS void
LANGUAGE sql AS $$
    UPDATE requests SET pdf_key = p_key WHERE id = p_request_id;
    SELECT log_event(p_request_id, 'pdf_stored');
$$;
