const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;
const JWT_SECRET = 'your-secret-key'; // В продакшені використовувати змінну середовища

// Ініціалізація бази даних
const dbPath = path.join(__dirname, 'database', 'tournament.db');
const db = new sqlite3.Database(dbPath);

// Ініціалізація таблиць
const sqlPath = path.join(__dirname, 'database', 'data.sql');
const initSql = fs.readFileSync(sqlPath, 'utf8');
db.exec(initSql, (err) => {
    if (err) {
        console.error('Помилка ініціалізації БД:', err);
    } else {
        console.log('База даних ініціалізована');
    }
});

// Middleware
app.use(express.json());

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Middleware для перевірки JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Токен відсутній' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недійсний токен' });
        }
        req.user = user;
        next();
    });
}

// Middleware для перевірки ролі адміна
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Потрібні права адміна' });
    }
    next();
}

// Middleware для перевірки ролі організатора або адміна
function requireOrganizer(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'organizer') {
        return res.status(403).json({ error: 'Потрібні права організатора або адміна' });
    }
    next();
}

// Middleware для перевірки власника турніру або адміна
function requireTournamentOwner(req, res, next) {
    const tournamentId = req.params.id || req.body.tournamentId || req.query.id;
    
    if (!tournamentId) {
        return res.status(400).json({ error: 'Потрібен ID турніру' });
    }

    db.get('SELECT organizer_id FROM tournaments WHERE id = ?', [tournamentId], (err, tournament) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!tournament) return res.status(404).json({ error: 'Турнір не знайдено' });

        if (req.user.role !== 'admin' && req.user.id !== tournament.organizer_id) {
            return res.status(403).json({ error: 'Немає доступу до цього турніру' });
        }
        next();
    });
}

// Функції генерації
function generateCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function makeUniqueCode(callback) {
    const code = generateCode();
    db.get('SELECT id FROM tournaments WHERE code = ?', [code], (err, row) => {
        if (err) return callback(err);
        if (row) {
            makeUniqueCode(callback);
        } else {
            callback(null, code);
        }
    });
}

function generateTeamCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function makeUniqueTeamCode(callback) {
    const code = generateTeamCode();
    db.get('SELECT id FROM teams WHERE join_code = ?', [code], (err, row) => {
        if (err) return callback(err);
        if (row) {
            makeUniqueTeamCode(callback);
        } else {
            callback(null, code);
        }
    });
}

function generateMatches(tournamentId, teamNames, organizerId, callback) {
    const createdMatches = [];
    let completed = 0;
    const total = teamNames.length * (teamNames.length - 1) / 2;

    if (total === 0) return callback(null, []);

    for (let i = 0; i < teamNames.length; i++) {
        for (let j = i + 1; j < teamNames.length; j++) {
            db.run(
                'INSERT INTO matches (team1, team2, score1, score2, status, organizer_id, tournament_id, round) VALUES (?, ?, 0, 0, ?, ?, ?, 1)',
                [teamNames[i], teamNames[j], 'planned', organizerId, tournamentId],
                function(err) {
                    if (err) return callback(err);
                    createdMatches.push({ id: this.lastID, team1: teamNames[i], team2: teamNames[j], status: 'planned' });
                    completed++;
                    if (completed === total) {
                        // Зробити перший матч live
                        if (createdMatches.length > 0) {
                            db.run('UPDATE matches SET status = ? WHERE id = ?', ['live', createdMatches[0].id]);
                            createdMatches[0].status = 'live';
                        }
                        callback(null, createdMatches);
                    }
                }
            );
        }
    }
}

function createMatchesForTournament(tournament, callback) {
    db.all('SELECT name FROM teams WHERE tournament_id = ?', [tournament.id], (err, rows) => {
        if (err) return callback(err);
        const teamNames = rows.map(row => row.name);
        if (teamNames.length < 2) return callback(null, []);

        // Видалити старі матчі
        db.run('DELETE FROM matches WHERE tournament_id = ?', [tournament.id], (err) => {
            if (err) return callback(err);
            generateMatches(tournament.id, teamNames, tournament.organizer_id, callback);
        });
    });
}

// Ендпоінти для користувачів

// Реєстрація
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Всі поля обов\'язкові' });
    }

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Помилка хешування пароля' });

        db.run(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hash, 'user'],
            function(err) {
                if (err) {
                    if (err.code === 'SQLITE_CONSTRAINT') {
                        return res.status(400).json({ error: 'Користувач з таким ім\'ям або email вже існує' });
                    }
                    return res.status(500).json({ error: 'Помилка створення користувача' });
                }

                const token = jwt.sign({ id: this.lastID, username, role: 'user' }, JWT_SECRET);
                res.status(201).json({ token, user: { id: this.lastID, username, email, role: 'user' } });
            }
        );
    });
});

// Логін
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email та пароль обов\'язкові' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!user) return res.status(400).json({ error: 'Невірний email або пароль' });

        bcrypt.compare(password, user.password_hash, (err, match) => {
            if (err) return res.status(500).json({ error: 'Помилка перевірки пароля' });
            if (!match) return res.status(400).json({ error: 'Невірний email або пароль' });

            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
            res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
        });
    });
});

// Створити адміна (для тестування)
app.post('/api/create-admin', (req, res) => {
    const { username, email, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Помилка хешування пароля' });

        db.run(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hash, 'admin'],
            function(err) {
                if (err) return res.status(500).json({ error: 'Помилка створення адміна' });
                res.status(201).json({ message: 'Адмін створений', id: this.lastID });
            }
        );
    });
});

// Створити організатора (для тестування)
app.post('/api/create-organizer', (req, res) => {
    const { username, email, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Помилка хешування пароля' });

        db.run(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hash, 'organizer'],
            function(err) {
                if (err) return res.status(500).json({ error: 'Помилка створення організатора' });
                res.status(201).json({ message: 'Організатор створений', id: this.lastID });
            }
        );
    });
});

// Ендпоінти для турнірів

app.get('/api/tournaments', (req, res) => {
    // 🔴 Admin, 🟡 Organizer, 🔵 User і невідомі гості бачать ВСІ турніри
    db.all('SELECT * FROM tournaments ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Помилка отримання турнірів' });
        res.json(rows);
    });
});

app.post('/api/tournaments', authenticateToken, (req, res) => {
    const name = (req.body.name || '').trim();
    const numTeams = parseInt(req.body.teams, 10);

    if (!name) {
        return res.status(400).json({ error: 'Потрібна назва турніру.' });
    }
    if (isNaN(numTeams) || numTeams < 2) {
        return res.status(400).json({ error: 'Потрібна дійсна кількість команд (не менше 2).' });
    }

    db.get('SELECT id FROM tournaments WHERE LOWER(name) = LOWER(?)', [name], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Помилка перевірки назви турніру' });
        if (existing) {
            return res.status(400).json({ error: 'Турнір з такою назвою вже існує.' });
        }

        makeUniqueCode((err, code) => {
            if (err) return res.status(500).json({ error: 'Помилка генерації коду' });

            db.run(
                'INSERT INTO tournaments (name, teams, players, date, description, code, organizer_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [name, numTeams, req.body.players, req.body.date, req.body.description, code, req.user.id],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Помилка створення турніру' });

                    res.status(201).json({
                        id: this.lastID,
                        name,
                        teams: numTeams,
                        players: req.body.players,
                        date: req.body.date,
                        description: req.body.description,
                        code,
                        status: 'Реєстрація',
                        matches: []
                    });
                }
            );
        });
    });
});

// Ендпоінти для команд

app.get('/api/teams', (req, res) => {
    db.all(`
        SELECT t.*, tr.name as tournamentName, tr.code as tournamentCode
        FROM teams t
        JOIN tournaments tr ON t.tournament_id = tr.id
        ORDER BY t.id DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Помилка отримання команд' });
        res.json(rows.map(team => ({
            id: team.id,
            name: team.name,
            players: JSON.parse(team.players),
            tournamentId: team.tournament_id,
            tournamentName: team.tournamentName,
            tournamentCode: team.tournamentCode
        })));
    });
});

app.post('/api/teams', (req, res) => {
    const tournamentCode = String(req.body.tournamentCode || '').trim();
    const name = String(req.body.name || '').trim();
    let players = req.body.players;

    if (typeof players === 'string') {
        players = players.split(',').map(name => name.trim()).filter(Boolean);
    }

    if (!tournamentCode) {
        return res.status(400).json({ error: 'Потрібен дійсний код турніру.' });
    }
    if (!name) {
        return res.status(400).json({ error: 'Потрібна назва команди.' });
    }
    if (!Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ error: 'Потрібні імена хоча б одного гравця.' });
    }

    const normalizedPlayers = players.map(player => String(player).trim()).filter(Boolean);
    if (normalizedPlayers.length !== players.length) {
        return res.status(400).json({ error: 'У списку гравців не може бути порожніх значень.' });
    }

    const lowerCasePlayers = normalizedPlayers.map(player => player.toLowerCase());
    const uniquePlayers = new Set(lowerCasePlayers);
    if (uniquePlayers.size !== normalizedPlayers.length) {
        return res.status(400).json({ error: 'Імена гравців не повинні повторюватися.' });
    }

    db.get('SELECT * FROM tournaments WHERE UPPER(code) = UPPER(?)', [tournamentCode], (err, tournament) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!tournament) return res.status(404).json({ error: 'Турнір з таким кодом не знайдено.' });

        db.all('SELECT players FROM teams WHERE tournament_id = ?', [tournament.id], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Помилка бази даних' });

            const existingPlayerNames = new Set();
            rows.forEach(row => {
                try {
                    const teamPlayers = JSON.parse(row.players);
                    if (Array.isArray(teamPlayers)) {
                        teamPlayers.forEach(player => {
                            if (typeof player === 'string' && player.trim()) {
                                existingPlayerNames.add(player.trim().toLowerCase());
                            }
                        });
                    }
                } catch (parseError) {
                    // Ігноруємо некоректні дані
                }
            });

            const repeated = normalizedPlayers.find(player => existingPlayerNames.has(player.toLowerCase()));
            if (repeated) {
                return res.status(400).json({ error: `Гравець "${repeated}" вже зареєстрований у цьому турнірі.` });
            }

            db.get('SELECT COUNT(*) as count FROM teams WHERE tournament_id = ?', [tournament.id], (err, row) => {
                if (err) return res.status(500).json({ error: 'Помилка підрахунку команд' });
                if (row.count >= tournament.teams) {
                    return res.status(400).json({ error: `У цьому турнірі може бути максимум ${tournament.teams} команд.` });
                }

                makeUniqueTeamCode((err, joinCode) => {
                    if (err) return res.status(500).json({ error: 'Помилка генерації коду команди' });

                    db.run(
                        'INSERT INTO teams (name, players, join_code, tournament_id) VALUES (?, ?, ?, ?)',
                        [name, JSON.stringify(normalizedPlayers), joinCode, tournament.id],
                        function(err) {
                            if (err) return res.status(500).json({ error: 'Помилка створення команди' });

                            const newTeam = {
                                id: this.lastID,
                                name,
                                players: normalizedPlayers,
                                tournamentName: tournament.name,
                                tournamentCode: tournament.code,
                                joinCode
                            };

                            // Перевірити, чи всі команди зареєстровані
                            db.get('SELECT COUNT(*) as count FROM teams WHERE tournament_id = ?', [tournament.id], (err, row) => {
                                if (err) return res.status(500).json({ error: 'Помилка перевірки команд' });

                                let matches = [];
                                if (row.count === tournament.teams) {
                                    createMatchesForTournament(tournament, (err, createdMatches) => {
                                        if (err) return res.status(500).json({ error: 'Помилка створення матчів' });
                                        matches = createdMatches;
                                        res.status(201).json({ ...newTeam, matches });
                                    });
                                } else {
                                    res.status(201).json({ ...newTeam, matches });
                                }
                            });
                        }
                    );
                });
            });
        });
    });
});

app.delete('/api/teams/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неправильний ID команди' });

    db.get('SELECT t.*, tr.organizer_id FROM teams t JOIN tournaments tr ON t.tournament_id = tr.id WHERE t.id = ?', [id], (err, team) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!team) return res.status(404).json({ error: 'Команду не знайдено' });

        // Admin може видалити будь-яку команду, Organizer - тільки своєї команди з його турніру
        if (req.user.role !== 'admin' && req.user.id !== team.organizer_id) {
            return res.status(403).json({ error: 'Немає прав для видалення цієї команди' });
        }

        db.run(
            'DELETE FROM matches WHERE tournament_id = ? AND (team1 = ? OR team2 = ?)',
            [team.tournament_id, team.name, team.name],
            (err) => {
                if (err) return res.status(500).json({ error: 'Помилка видалення матчів команди' });

                db.run('DELETE FROM teams WHERE id = ?', [id], function(err) {
                    if (err) return res.status(500).json({ error: 'Помилка видалення команди' });
                    res.json({ message: 'Команду видалено' });
                });
            }
        );
    });
});

app.delete('/api/teams/:id/player', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const playerName = String(req.query.name || req.body.name || '').trim();

    if (!id) return res.status(400).json({ error: 'Неправильний ID команди' });
    if (!playerName) return res.status(400).json({ error: "Потрібне ім'я гравця" });

    db.get('SELECT t.*, tr.organizer_id FROM teams t JOIN tournaments tr ON t.tournament_id = tr.id WHERE t.id = ?', [id], (err, team) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!team) return res.status(404).json({ error: 'Команду не знайдено' });

        // Admin може видалити гравця з будь-якої команди, Organizer - тільки зі своєї команди
        if (req.user.role !== 'admin' && req.user.id !== team.organizer_id) {
            return res.status(403).json({ error: 'Немає прав для видалення гравця з цієї команди' });
        }

        let players;
        try {
            players = JSON.parse(team.players);
        } catch (parseError) {
            return res.status(500).json({ error: 'Некоректні дані гравців у команді' });
        }

        if (!Array.isArray(players)) {
            return res.status(500).json({ error: 'Некоректний формат гравців' });
        }

        const lowerName = playerName.toLowerCase();
        const filteredPlayers = players.filter(p => String(p).trim().toLowerCase() !== lowerName);
        if (filteredPlayers.length === players.length) {
            return res.status(404).json({ error: 'Гравця не знайдено у команді' });
        }

        db.run('UPDATE teams SET players = ? WHERE id = ?', [JSON.stringify(filteredPlayers), id], function(err) {
            if (err) return res.status(500).json({ error: 'Помилка оновлення команди' });
            res.json({ message: `Гравець "${playerName}" видалений`, players: filteredPlayers });
        });
    });
});

app.patch('/api/teams/:id/join', (req, res) => {
    const id = parseInt(req.params.id, 10);
    let newPlayers = req.body.players;

    if (typeof newPlayers === 'string') {
        newPlayers = newPlayers.split(',').map(name => name.trim()).filter(Boolean);
    }

    if (!id) return res.status(400).json({ error: 'Неправильний ID команди' });
    if (!Array.isArray(newPlayers) || newPlayers.length === 0) {
        return res.status(400).json({ error: 'Потрібні імена гравців' });
    }

    const normalizedNewPlayers = newPlayers.map(p => String(p).trim()).filter(Boolean);
    if (normalizedNewPlayers.length !== newPlayers.length) {
        return res.status(400).json({ error: 'У списку не може бути порожніх значень' });
    }

    db.get('SELECT t.*, tr.players as tournament_max_players FROM teams t JOIN tournaments tr ON t.tournament_id = tr.id WHERE t.id = ?', [id], (err, team) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!team) return res.status(404).json({ error: 'Команду не знайдено' });

        let currentPlayers;
        try {
            currentPlayers = JSON.parse(team.players);
        } catch (parseError) {
            return res.status(500).json({ error: 'Некоректні дані гравців' });
        }

        if (!Array.isArray(currentPlayers)) currentPlayers = [];

        const maxPlayers = parseInt(team.tournament_max_players, 10) || 1;
        if (currentPlayers.length + normalizedNewPlayers.length > maxPlayers) {
            return res.status(400).json({ error: `У команді не може бути більше ${maxPlayers} гравців` });
        }

        const existingLower = new Set(currentPlayers.map(p => String(p).trim().toLowerCase()));
        const newLower = new Set(normalizedNewPlayers.map(p => p.toLowerCase()));

        for (let player of normalizedNewPlayers) {
            if (existingLower.has(player.toLowerCase())) {
                return res.status(400).json({ error: `Гравець "${player}" вже у команді` });
            }
        }

        if (newLower.size !== normalizedNewPlayers.length) {
            return res.status(400).json({ error: 'Імена нових гравців не повинні повторюватися' });
        }

        db.all('SELECT players FROM teams WHERE tournament_id = ?', [team.tournament_id], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Помилка перевірки турніру' });

            const tournamentPlayerNames = new Set();
            rows.forEach(row => {
                try {
                    const players = JSON.parse(row.players);
                    if (Array.isArray(players)) {
                        players.forEach(p => {
                            if (typeof p === 'string' && p.trim()) {
                                tournamentPlayerNames.add(p.trim().toLowerCase());
                            }
                        });
                    }
                } catch (e) {}
            });

            for (let player of normalizedNewPlayers) {
                if (tournamentPlayerNames.has(player.toLowerCase())) {
                    return res.status(400).json({ error: `Гравець "${player}" вже зареєстрований у турнірі` });
                }
            }

            const updatedPlayers = [...currentPlayers, ...normalizedNewPlayers];
            db.run('UPDATE teams SET players = ? WHERE id = ?', [JSON.stringify(updatedPlayers), id], function(err) {
                if (err) return res.status(500).json({ error: 'Помилка оновлення команди' });
                res.json({ message: 'Гравців успішно додано до команди', players: updatedPlayers });
            });
        });
    });
});

// Ендпоінти для матчів

app.get('/api/matches', (req, res) => {
    const tournamentId = req.query.tournamentId ? parseInt(req.query.tournamentId, 10) : null;

    let query = 'SELECT id, team1, team2, score1, score2, status, organizer_id, tournament_id as tournamentId, round, created_at FROM matches';
    let params = [];

    if (tournamentId) {
        query += ' WHERE tournament_id = ?';
        params.push(tournamentId);
    }

    query += ' ORDER BY id DESC';

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Помилка отримання матчів' });
        res.json(rows || []);
    });
});

app.put('/api/matches/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);

    db.get('SELECT * FROM matches WHERE id = ?', [id], (err, match) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!match) return res.status(404).json({ error: 'Матч не знайдено' });

        // Перевірити права: адмін або організатор турніру
        if (req.user.role !== 'admin' && req.user.id !== match.organizer_id) {
            return res.status(403).json({ error: 'Ви не можете змінити цей матч' });
        }

        const updates = [];
        const values = [];
        if (req.body.score1 !== undefined) {
            updates.push('score1 = ?');
            values.push(req.body.score1);
        }
        if (req.body.score2 !== undefined) {
            updates.push('score2 = ?');
            values.push(req.body.score2);
        }
        if (req.body.status) {
            updates.push('status = ?');
            values.push(req.body.status);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'Немає полів для оновлення' });

        values.push(id);
        db.run(`UPDATE matches SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
            if (err) return res.status(500).json({ error: 'Помилка оновлення матчу' });
            res.json({ message: 'Матч оновлено' });
        });
    });
});

// Таблиця
app.get('/api/table', (req, res) => {
    const tournamentId = parseInt(req.query.id, 10);
    if (!tournamentId) return res.status(400).json({ error: 'Потрібен ID турніру' });

    db.all('SELECT * FROM matches WHERE tournament_id = ? AND status = ?', [tournamentId, 'finished'], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Помилка отримання матчів' });

        const table = {};
        rows.forEach(match => {
            if (!table[match.team1]) table[match.team1] = { games: 0, wins: 0 };
            if (!table[match.team2]) table[match.team2] = { games: 0, wins: 0 };

            table[match.team1].games++;
            table[match.team2].games++;

            if (match.score1 > match.score2) table[match.team1].wins++;
            else if (match.score2 > match.score1) table[match.team2].wins++;
        });

        res.json(table);
    });
});

// Видалення турніру (тільки організатор або адмін)
app.delete('/api/tournaments/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);

    db.get('SELECT * FROM tournaments WHERE id = ?', [id], (err, tournament) => {
        if (err) return res.status(500).json({ error: 'Помилка бази даних' });
        if (!tournament) return res.status(404).json({ error: 'Турнір не знайдено' });

        // 🔴 Admin може видалити БУДЬ-ЯКИЙ турнір
        // 🟡 Organizer може видалити ТІЛЬКИ свій турнір
        if (req.user.role !== 'admin' && req.user.id !== tournament.organizer_id) {
            return res.status(403).json({ error: 'Немає прав для видалення цього турніру' });
        }

        // Видалити матчі, команди, турнір
        db.run('DELETE FROM matches WHERE tournament_id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: 'Помилка видалення матчів' });
            db.run('DELETE FROM teams WHERE tournament_id = ?', [id], (err) => {
                if (err) return res.status(500).json({ error: 'Помилка видалення команд' });
                db.run('DELETE FROM tournaments WHERE id = ?', [id], (err) => {
                    if (err) return res.status(500).json({ error: 'Помилка видалення турніру' });
                    res.json({ message: 'Турнір видалено успішно' });
                });
            });
        });
    });
});

// Статичні файли
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'www.html'));
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущено на http://localhost:${port}`);
});
// хочу сказати,що я працював над цим сам,в мене була команда,але вона не захотіла працювати,я не здався і зробив все сам(звісно,я користувався інтренета та ші,але я не списував,я вчився і робив все сам) можливо це егоїстично казати правду,але я хочу щоб ви знали це,я не стараюсь получити плюс бал за це,даже якщо я не пройду далі,я все рівно доведу цей сайт до піку.