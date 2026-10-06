-- A harmadik workflow (Utánkövetés és hibakezelés) adatbázis-oldala.
-- Ez a fájl újra lefuttatható egy már élő adatbázison is (CREATE OR REPLACE, DROP IF EXISTS):
-- a Postgres az itt lévő fájlokat csak az első indításkor tölti be, a későbbi változást kézzel kell ráfuttatni.

-- Beragadt kérések lezárása. Egy kérés akkor ragad be, ha a workflow félúton elhal:
--   'received' = bekerült, de a modell válasza sosem jutott el az árazásig,
--   'approved' = jóváhagyták, de a PDF vagy a levél nem készült el.
-- A többi állapotban a folyamat szándékosan áll (a nézőre vár, vagy véget ért), azokhoz nem nyúl.
-- Az 'approved' állapotú, de 'email_skipped' lépésű kérés kész van (a napi keret miatt levél nélkül), az sem beragadt.
-- A kor az utolsó naplózott lépéstől számít. Kimenet: hány kérést zárt le, és melyeket.
CREATE OR REPLACE FUNCTION fail_stuck_requests(p_older_than_minutes integer DEFAULT 10) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_request record;
    v_stuck   jsonb := '[]'::jsonb;
BEGIN
    FOR v_request IN
        SELECT r.id, r.status,
               (SELECT max(e.at) FROM request_events e WHERE e.request_id = r.id) AS last_step_at
        FROM requests r
        WHERE r.status IN ('received', 'approved')
          AND NOT EXISTS (SELECT 1 FROM request_events e WHERE e.request_id = r.id AND e.step = 'email_skipped')
          AND COALESCE((SELECT max(e.at) FROM request_events e WHERE e.request_id = r.id), r.created_at)
              < now() - make_interval(mins => p_older_than_minutes)
        ORDER BY r.id
        FOR UPDATE OF r SKIP LOCKED  -- ha egy sort éppen egy futó workflow fog, azt kihagyja, nem vár rá
    LOOP
        PERFORM set_status(v_request.id, 'failed');
        v_stuck := v_stuck || jsonb_build_object(
            'request_id', v_request.id, 'stuck_at', v_request.status, 'last_step_at', v_request.last_step_at);
    END LOOP;
    RETURN jsonb_build_object('count', jsonb_array_length(v_stuck), 'stuck', v_stuck);
END;
$$;


-- 8. lépés: kinek jár emlékeztető. Akinek az ajánlata legalább p_after_minutes perce elment, még érvényes,
-- és még nem kapott emlékeztetőt. A demóban ez 2 perc, hogy a néző kivárhassa; élesben 72 óra (4320 perc) lenne.
-- A demóban nincs válaszfigyelés, ezért minden kiküldött ajánlat kap egyet.
-- A függvény a 'reminded' lépést MÉG A KÜLDÉS ELŐTT beírja a naplóba. Ok: ha a levél elmegy, de a naplózás
-- utána elhasalna, a következő futás újra elküldené, és ez percenként ismétlődne. Így egy kérés legfeljebb egy
-- emlékeztetőt kap; ha a küldés nem sikerül, a workflow 'reminder_failed' lépést ír mellé, és riaszt.
-- A napi levélkeret közös az ajánlatokkal: a ma elment ajánlatok és emlékeztetők együtt számítanak.
-- A régi változat órában kapta a várakozást; paramétert átnevezni csak eldobás után lehet.
DROP FUNCTION IF EXISTS claim_due_reminders(integer, integer);
CREATE FUNCTION claim_due_reminders(p_after_minutes integer DEFAULT 2, p_daily_mail_limit integer DEFAULT 40) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_room      integer;
    v_reminders jsonb;
BEGIN
    SELECT p_daily_mail_limit - count(*) INTO v_room
    FROM request_events
    WHERE step IN ('sent', 'reminded') AND at >= date_trunc('day', now());

    WITH due AS (
        SELECT r.id, r.email
        FROM requests r
        WHERE r.status = 'sent'
          AND (SELECT max(e.at) FROM request_events e WHERE e.request_id = r.id AND e.step = 'sent')
              < now() - make_interval(mins => p_after_minutes)
          AND NOT EXISTS (SELECT 1 FROM request_events e WHERE e.request_id = r.id AND e.step = 'reminded')
          AND EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = r.id AND q.valid_until >= current_date)
        ORDER BY r.id
        LIMIT greatest(v_room, 0)
        FOR UPDATE OF r SKIP LOCKED
    ), logged AS (
        -- adatmódosító WITH-ág: akkor is lefut, ha a fő lekérdezés nem hivatkozik rá
        INSERT INTO request_events (request_id, step) SELECT id, 'reminded' FROM due
    )
    SELECT COALESCE(jsonb_agg(
               jsonb_build_object('request_id', d.id, 'customer_email', d.email, 'number', q.number,
                                  'valid_until', q.valid_until, 'days_left', q.valid_until - current_date)
               ORDER BY d.id), '[]'::jsonb)
    INTO v_reminders
    FROM due d
    -- ugyanaz a sorszám, amivel az ajánlat levele és a PDF neve készült: a rövidebb hűségidejű változaté
    CROSS JOIN LATERAL (
        SELECT number, valid_until FROM quotes WHERE request_id = d.id ORDER BY term_months LIMIT 1
    ) q;

    RETURN jsonb_build_object('count', jsonb_array_length(v_reminders), 'reminders', v_reminders);
END;
$$;
