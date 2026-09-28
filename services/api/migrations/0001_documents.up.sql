CREATE TABLE lc_backend.actors (
    user_id text PRIMARY KEY CHECK (length(user_id) > 0)
);

CREATE TABLE lc_backend.documents (
    user_id text NOT NULL REFERENCES lc_backend.actors(user_id),
    kind text NOT NULL CHECK (length(kind) > 0),
    doc_key text NOT NULL CHECK (length(doc_key) > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, kind, doc_key)
);

CREATE FUNCTION lc_backend.protect_document() RETURNS trigger
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

CREATE TRIGGER documents_immutable BEFORE UPDATE ON lc_backend.documents
FOR EACH ROW EXECUTE FUNCTION lc_backend.protect_document();

COMMENT ON TABLE lc_backend.documents IS
'Canonical archive and mutable heads. Application operations require the owning actor row lock; explicit erasure may delete immutable rows.';
