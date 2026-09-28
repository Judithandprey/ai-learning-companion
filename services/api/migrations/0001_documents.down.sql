-- Destructive rollback: export/backup original records before executing.
DROP TABLE lc_backend.documents;
DROP FUNCTION lc_backend.protect_document();
DROP TABLE lc_backend.actors;
