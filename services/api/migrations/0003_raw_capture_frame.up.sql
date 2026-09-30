-- Raw descriptors share the actor archive and the legacy frame-ID namespace.
-- The unique index also fences SQL writers racing across the two document kinds.
CREATE UNIQUE INDEX documents_frame_identity ON lc_backend.documents (user_id, doc_key)
WHERE kind IN ('frame', 'raw_capture_frame');

CREATE OR REPLACE FUNCTION lc_backend.protect_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.user_id, NEW.kind, NEW.doc_key) IS DISTINCT FROM (OLD.user_id, OLD.kind, OLD.doc_key) THEN
        RAISE EXCEPTION 'document identity cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'document creation time cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF OLD.kind IN ('snapshot', 'frame', 'raw_capture_frame', 'event', 'note_revision', 'artifact',
                   'capture_record', 'capture_binding', 'capture_slot', 'capture_artifact_ref')
       AND NEW.payload IS DISTINCT FROM OLD.payload THEN
        RAISE EXCEPTION 'immutable document cannot be replaced' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION lc_backend.protect_frame_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind IN ('frame', 'raw_capture_frame') AND EXISTS (
        SELECT 1 FROM lc_backend.documents
        WHERE user_id = NEW.user_id AND kind = 'frame_tombstone' AND doc_key = NEW.doc_key
    ) THEN
        RAISE EXCEPTION 'deleted frame identity cannot be reused' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER documents_frame_lifecycle BEFORE INSERT OR UPDATE ON lc_backend.documents
FOR EACH ROW EXECUTE FUNCTION lc_backend.protect_frame_lifecycle();
