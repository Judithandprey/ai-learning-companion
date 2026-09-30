-- Stop raw-frame writers first. Rollback never deletes originals or fences.
-- Shared tombstones cannot reveal which frame kind was erased, so retain this
-- migration while ANY frame tombstone remains, including legacy tombstones.
LOCK TABLE lc_backend.documents IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM lc_backend.documents
               WHERE kind IN ('raw_capture_frame', 'frame_tombstone')) THEN
        RAISE EXCEPTION 'raw frames or shared frame tombstones remain; rollback would lose lifecycle protection'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

DROP TRIGGER documents_frame_lifecycle ON lc_backend.documents;
DROP FUNCTION lc_backend.protect_frame_lifecycle();
DROP INDEX lc_backend.documents_frame_identity;

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
