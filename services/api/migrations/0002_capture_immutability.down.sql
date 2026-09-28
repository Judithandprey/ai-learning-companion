-- Never remove capture protection while originals or replay fences remain.
-- Stop capture writers and retain the deletion-aware service during rollback.
LOCK TABLE lc_backend.documents IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM lc_backend.documents WHERE left(kind, 8) = 'capture_') THEN
        RAISE EXCEPTION 'capture records or fences remain; rollback would lose lifecycle protection'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION lc_backend.protect_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.user_id, NEW.kind, NEW.doc_key) IS DISTINCT FROM (OLD.user_id, OLD.kind, OLD.doc_key) THEN
        RAISE EXCEPTION 'document identity cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'document creation time cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF OLD.kind IN ('snapshot', 'frame', 'event', 'note_revision', 'artifact')
       AND NEW.payload IS DISTINCT FROM OLD.payload THEN
        RAISE EXCEPTION 'immutable document cannot be replaced' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
