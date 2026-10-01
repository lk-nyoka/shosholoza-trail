CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, event TEXT NOT NULL, actor TEXT, target TEXT, detail TEXT, ip_hash TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS activity_log_event_created ON activity_log(event, created_at);
