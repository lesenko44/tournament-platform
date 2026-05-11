-- Створення таблиць для турнірної платформи

-- Таблиця користувачів
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'admin', 'organizer' або 'user'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблиця турнірів
CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    teams INTEGER NOT NULL,
    players INTEGER,
    date TEXT,
    description TEXT,
    code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'Реєстрація',
    organizer_id INTEGER,
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- Таблиця команд
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    players TEXT NOT NULL, -- JSON array
    join_code TEXT UNIQUE NOT NULL,
    tournament_id INTEGER NOT NULL,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Таблиця матчів
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team1 TEXT NOT NULL,
    team2 TEXT NOT NULL,
    score1 INTEGER DEFAULT 0,
    score2 INTEGER DEFAULT 0,
    status TEXT DEFAULT 'planned', -- 'planned', 'live', 'finished'
    organizer_id INTEGER,
    tournament_id INTEGER NOT NULL,
    round INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- Індекси для швидкості
CREATE INDEX IF NOT EXISTS idx_tournaments_code ON tournaments(code);
CREATE INDEX IF NOT EXISTS idx_teams_tournament_id ON teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);