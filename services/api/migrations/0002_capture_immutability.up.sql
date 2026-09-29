-- Additive internal capture kinds; existing v1 originals and schema are unchanged.
CREATE OR REPLACE FUNCTION lc_backend.protect_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.user_id, NEW.kind, NEW.doc_key) IS DISTINCT FROM (OLD.user_id, OLD.kind, OLD.doc_key) THEN
        RAISE EXCEPTION 'document identity cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'document creation time cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF OLD.kind IN ('snapshot', 'frame', 'event', 'note_revision', 'artifact',
                   'capture_record', 'capture_binding', 'capture_slot', 'capture_artifact_ref')
       AND NEW.payload IS DISTINCT FROM OLD.payload THEN
        RAISE EXCEPTION 'immutable document cannot be replaced' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

