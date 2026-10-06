// One transactional, idempotent upgrade. Import historical rooms exactly once.
let ready: Promise<unknown> | undefined;
export function ensureRooms(db: D1Database) {
  if (!ready) ready = db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS chat_author_colors (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)'),
    db.prepare('CREATE TABLE IF NOT EXISTS chat_rooms (slug TEXT PRIMARY KEY, created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1)'),
    db.prepare('CREATE TABLE IF NOT EXISTS chat_participants (room TEXT NOT NULL, name TEXT NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room,name))'),
    db.prepare('CREATE TABLE IF NOT EXISTS chat_sessions (room TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, seen INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room,id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS chat_events (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS chat_events_room ON chat_events(room,id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS chat_room_upgrades (id TEXT PRIMARY KEY)'),
    db.prepare("INSERT OR IGNORE INTO chat_rooms (slug, created_at) SELECT room_slug, MIN(created_at) FROM messages WHERE NOT EXISTS (SELECT 1 FROM chat_room_upgrades WHERE id = 'admin-rooms') GROUP BY room_slug"),
    db.prepare("INSERT OR IGNORE INTO chat_participants(room,name) SELECT room_slug,display_name FROM messages WHERE NOT EXISTS(SELECT 1 FROM chat_room_upgrades WHERE id='participants') GROUP BY room_slug,display_name"),
    db.prepare("INSERT OR IGNORE INTO chat_room_upgrades VALUES ('participants')"),
    db.prepare("INSERT OR IGNORE INTO chat_room_upgrades VALUES ('admin-rooms')"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS require_chat_room BEFORE INSERT ON messages WHEN NOT EXISTS (SELECT 1 FROM chat_rooms WHERE slug = NEW.room_slug AND active = 1) BEGIN SELECT RAISE(ABORT, 'Room unavailable. Ask the admin to create it.'); END"),
  ]).catch(error => { ready = undefined; throw error; });
  return ready;
}
export async function roomExists(db:D1Database, slug:string) {
  await ensureRooms(db);
  return !!await db.prepare('SELECT slug FROM chat_rooms WHERE slug = ? AND active = 1').bind(slug).first();
}
