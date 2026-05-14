// Збереження токена
let currentToken = localStorage.getItem('token');
let currentUser = null;

function setToken(token) {
    currentToken = token;
    localStorage.setItem('token', token);
    updateCreateTournamentAuthState();
}

function clearToken() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    updateCreateTournamentAuthState();
    loadTournaments();
}

function getAuthHeaders() {
    return currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {};
}

function closeModal(modalId) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (modalInstance && typeof modalInstance.hide === 'function') {
        modalInstance.hide();
    } else {
        modalEl.classList.remove('show');
        modalEl.style.display = 'none';
    }

    if (modalEl.contains(document.activeElement)) {
        document.activeElement.blur();
    }

    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
}

function updateCreateTournamentAuthState() {
    const authAlert = document.getElementById('createTournamentAuthAlert');
    const createSubmit = document.getElementById('createTournamentSubmit');
    const canCreate = currentToken && currentUser;

    if (authAlert) {
        if (canCreate) {
            authAlert.classList.add('d-none');
        } else {
            authAlert.classList.remove('d-none');
        }
    }

    if (createSubmit) {
        createSubmit.disabled = !canCreate;
    }
}

function decodeBase64Url(base64UrlString) {
    let base64 = base64UrlString.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding === 2) base64 += '==';
    else if (padding === 3) base64 += '=';
    else if (padding !== 0) throw new Error('Неправильне вирівнювання Base64');
    return atob(base64);
}

// Перевірка авторизації при завантаженні
async function checkAuth() {
    if (!currentToken) {
        currentUser = null;
        updateAuthUI();
        updateCreateTournamentAuthState();
        return;
    }

    try {
        // Декодуємо JWT для отримання користувача
        if (typeof currentToken !== 'string') {
            throw new Error('Токен не є рядком');
        }

        const parts = currentToken.split('.');
        if (parts.length !== 3) {
            throw new Error('Невалідний формат токена');
        }

        const payload = JSON.parse(decodeBase64Url(parts[1]));
        currentUser = payload;
        updateAuthUI();
        updateCreateTournamentAuthState();
    } catch (error) {
        console.error('Помилка декодування токена:', error, 'token=', currentToken);
        clearToken();
        updateAuthUI();
    }
}

function customAlert(message) {
    return new Promise((resolve) => {
        const alertDiv = document.getElementById('customAlert');
        const alertMessage = document.getElementById('alertMessage');
        const alertCloseBtn = document.getElementById('alertCloseBtn');
        
        if (!alertDiv || !alertMessage || !alertCloseBtn) {
            alert(message);
            resolve();
            return;
        }
        
        alertMessage.textContent = message;
        alertDiv.setAttribute('aria-hidden', 'false');
        alertDiv.classList.remove('d-none');
        alertDiv.classList.add('show');
        alertDiv.style.display = 'flex';
        alertCloseBtn.focus();
        
        const handleClose = () => {
            cleanup();
            resolve();
        };
        
        const cleanup = () => {
            alertCloseBtn.removeEventListener('click', handleClose);
            alertDiv.classList.add('d-none');
            alertDiv.classList.remove('show');
            alertDiv.style.display = 'none';
            alertDiv.setAttribute('aria-hidden', 'true');
            if (document.activeElement === alertCloseBtn) {
                alertCloseBtn.blur();
            }
        };
        
        alertCloseBtn.addEventListener('click', handleClose);
    });
}

function customConfirm(message) {
    return new Promise((resolve) => {
        const confirmDiv = document.getElementById('customConfirm');
        const messageDiv = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        
        if (!confirmDiv || !messageDiv || !okBtn || !cancelBtn) {
            const result = window.confirm(message);
            resolve(result);
            return;
        }
        
        messageDiv.textContent = message;
        confirmDiv.setAttribute('aria-hidden', 'false');
        confirmDiv.classList.remove('d-none');
        confirmDiv.classList.add('show');
        confirmDiv.style.display = 'flex';
        okBtn.focus();
        
        const handleOk = () => {
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            confirmDiv.classList.add('d-none');
            confirmDiv.classList.remove('show');
            confirmDiv.style.display = 'none';
            confirmDiv.setAttribute('aria-hidden', 'true');
            if (document.activeElement === okBtn || document.activeElement === cancelBtn) {
                document.activeElement.blur();
            }
        };
        
        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

let tournaments = [];
let teams = [];
let matches = [];

function generateRandomPassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

async function createTestAdmin() {
    const username = 'admin' + Math.floor(Math.random() * 1000);
    const email = username + '@test.com';
    const password = 'admin123';

    try {
        const response = await fetch('/api/create-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (response.ok) {
            await customAlert(`Admin створений!\nEmail: ${email}\nПароль: ${password}`);
        } else {
            await customAlert('Помилка створення admin: ' + data.error);
        }
    } catch (error) {
        await customAlert('Помилка з\'єднання');
    }
}

async function createTestOrganizer() {
    const username = 'organizer' + Math.floor(Math.random() * 1000);
    const email = username + '@test.com';
    const password = 'org123';

    try {
        const response = await fetch('/api/create-organizer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (response.ok) {
            await customAlert(`Organizer створений!\nEmail: ${email}\nПароль: ${password}`);
        } else {
            await customAlert('Помилка створення organizer: ' + data.error);
        }
    } catch (error) {
        await customAlert('Помилка з\'єднання');
    }
}

async function loadTeams() {
    try {
        const response = await fetch('/api/teams');
        teams = await response.json();
        const container = document.getElementById('teamsContainer');
        const placeholder = document.getElementById('teamsPlaceholder');
        container.innerHTML = '';

        if (teams.length === 0) {
            placeholder.textContent = 'Зараз команд нема';
            return;
        }

        placeholder.textContent = '';

        teams.forEach(team => {
            const canModifyTeam = currentUser && (currentUser.role === 'admin' || (currentUser.role === 'organizer' && String(currentUser.id) === String(team.tournamentOrganizerId)));
            const card = document.createElement('div');
            card.className = 'col-md-4';

            const playersHtml = (team.players || []).length > 0
                ? team.players.map(player => `
                    <div class="player-entry">
                        <span>${player}</span>
                        ${canModifyTeam ? `<button class="btn-remove-player" data-team-id="${team.id}" data-player="${encodeURIComponent(player)}" type="button" aria-label="Видалити гравця ${player}">✕</button>` : ''}
                    </div>
                `).join('')
                : '<div class="player-entry">Немає гравців</div>';

            card.innerHTML = `
                <div class="tournament-card">
                    <div class="tournament-header">
                        <span class="badge bg-success mb-2">Команда</span>
                        ${canModifyTeam ? `<button class="btn-delete btn-delete-team" data-id="${team.id}" type="button" title="Видалити команду">✕</button>` : ''}
                    </div>
                    <h4>${team.name}</h4>
                    <p><strong>Турнір:</strong> ${team.tournamentName}</p>
                    <div><strong>Гравці:</strong></div>
                    ${playersHtml}
                </div>
            `;

            container.appendChild(card);

            if (canModifyTeam) {
                const deleteBtn = card.querySelector('.btn-delete-team');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async () => {
                        const confirmed = await customConfirm('Ви дійсно хочете видалити цю команду?');
                        if (!confirmed) return;
                        await deleteTeam(team.id);
                    });
                }

                card.querySelectorAll('.btn-remove-player').forEach(button => {
                    button.addEventListener('click', async () => {
                        const player = decodeURIComponent(button.dataset.player);
                        const confirmed = await customConfirm(`Видалити гравця "${player}"?`);
                        if (!confirmed) return;
                        await removeTeamPlayer(team.id, player);
                    });
                });
            }
        });
    } catch (error) {
        console.error('Помилка завантаження команд:', error);
    }
}

function populateWatchSelect() {
    const select = document.getElementById('watchTournamentSelect');
    if (!select) return;

    if (!tournaments.length) {
        select.innerHTML = '<option value="" disabled selected>Турнірів ще нема</option>';
        return;
    }

    select.innerHTML = tournaments
        .map(tournament => `<option value="${tournament.id}">${tournament.name} — ${tournament.teams} команд</option>`)
        .join('');
    select.selectedIndex = 0;
}

async function loadMatches(tournamentId = null) {
    try {
        let url = '/api/matches';
        if (tournamentId) {
            url += `?tournamentId=${tournamentId}`;
        }
        const response = await fetch(url);
        matches = await response.json();
        renderMatches();
        renderResults();
        renderEvaluation();
    } catch (error) {
        console.error('Помилка завантаження матчів:', error);
    }
}

async function loadTable(tournamentId) {
    try {
        const response = await fetch(`/api/table?id=${tournamentId}`);
        return await response.json();
    } catch (error) {
        console.error('Помилка завантаження таблиці:', error);
        return {};
    }
}

function getRegisteredTeamNames(tournamentId) {
    return teams
        .filter(team => team.tournamentId === tournamentId)
        .map(team => team.name);
}

function getDisplayTeamName(match, teamLabel) {
    const tournamentTeamNames = getRegisteredTeamNames(match.tournamentId);
    const placeholderMatch = /^Команда ([A-Z])$/.exec(teamLabel);
    if (placeholderMatch) {
        const index = placeholderMatch[1].charCodeAt(0) - 65;
        if (tournamentTeamNames[index]) {
            return tournamentTeamNames[index];
        }
    }
    return teamLabel || '—';
}

function getMatchDisplayNames(match) {
    return {
        team1: getDisplayTeamName(match, match.team1),
        team2: getDisplayTeamName(match, match.team2)
    };
}

function mapTeamNameForTable(teamName, tournamentId) {
    const tournamentTeamNames = getRegisteredTeamNames(tournamentId);
    const placeholderMatch = /^Команда ([A-Z])$/.exec(teamName);
    if (placeholderMatch) {
        const index = placeholderMatch[1].charCodeAt(0) - 65;
        if (tournamentTeamNames[index]) {
            return tournamentTeamNames[index];
        }
    }
    return teamName;
}

function getEvaluationText(match, display) {
    if (match.score1 === match.score2) {
        return `Нічия ${display.team1} та ${display.team2} ${match.score1}:${match.score2}. Боротьба була важкою, але завершилось все чесно.`;
    }

    const diff = Math.abs(match.score1 - match.score2);
    const winner = match.score1 > match.score2 ? display.team1 : display.team2;
    const loser = match.score1 > match.score2 ? display.team2 : display.team1;

    if (diff >= 5) {
        return `Розгромна перемога ${winner} над ${loser} з рахунком ${match.score1}:${match.score2}. Це був абсолютно домінантний виступ.`;
    }

    if (diff <= 2) {
        return `${winner} перемогла ${loser} з рахунком ${match.score1}:${match.score2}. Боротьба була важкою, але саме ${winner} виявилася сильнішою.`;
    }

    return `${winner} виграла у ${loser} з рахунком ${match.score1}:${match.score2}. Гра була напруженою та цікавою.`;
}

function renderResults() {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    const finishedMatches = matches.filter(match => match.status === 'finished');
    if (finishedMatches.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Завершених матчів ще нема</div>';
        return;
    }

    container.innerHTML = finishedMatches.map(match => {
        const display = getMatchDisplayNames(match);
        const winner = match.score1 === match.score2
            ? 'Нічия'
            : match.score1 > match.score2 ? display.team1 : display.team2;
        const loser = match.score1 === match.score2
            ? ''
            : match.score1 > match.score2 ? display.team2 : display.team1;
        const resultText = match.score1 === match.score2
            ? `${display.team1} та ${display.team2} зіграли внічию ${match.score1}:${match.score2}`
            : `${winner} обіграла ${loser} з рахунком ${match.score1}:${match.score2}`;

        return `
            <div class="card mb-3">
                <div class="card-body">
                    <h5 class="card-title">${resultText}</h5>
                    <p class="card-text text-muted">Матч турніру №${match.tournamentId}</p>
                </div>
            </div>
        `;
    }).join('');
}

function renderEvaluation() {
    const container = document.getElementById('evaluationContainer');
    if (!container) return;

    const finishedMatches = matches.filter(match => match.status === 'finished');
    if (finishedMatches.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Ще немає завершених матчів для оцінювання</div>';
        return;
    }

    container.innerHTML = finishedMatches.map(match => {
        const display = getMatchDisplayNames(match);
        const text = getEvaluationText(match, display);
        return `
            <div class="card mb-3">
                <div class="card-body">
                    <h5 class="card-title">${display.team1} vs ${display.team2}</h5>
                    <p class="card-text">${text}</p>
                </div>
            </div>
        `;
    }).join('');
}

function renderMatches() {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    container.innerHTML = '';

    if (matches.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Матчів ще нема для цього турніру</div>';
        return;
    }

    matches.forEach(match => {
        const display = getMatchDisplayNames(match);
        const matchDiv = document.createElement('div');
        matchDiv.className = 'match-card';
        
        const statusMap = {
            'planned': { text: '⏳ Очікується', class: 'planned' },
            'live': { text: '🔴 LIVE', class: 'live' },
            'finished': { text: '✅ Завершено', class: 'finished' }
        };
        
        const status = statusMap[match.status] || { text: match.status, class: 'scheduled' };
        const canEdit = currentUser && (currentUser.role === 'admin' || String(match.organizer_id) === String(currentUser.id));

        matchDiv.innerHTML = `
            <div class="match-header">
                <span class="match-status ${status.class}">${status.text}</span>
            </div>
            <div class="match-teams">
                <div class="match-team">
                    <div class="match-team-name">${display.team1}</div>
                </div>
                <div class="match-score">${match.score1} : ${match.score2}</div>
                <div class="match-team">
                    <div class="match-team-name">${display.team2}</div>
                </div>
            </div>
            <div class="match-actions">
                <button class="btn btn-update-score btn-sm" data-match-id="${match.id}" 
                    ${!canEdit ? 'disabled' : ''}>
                    Змінити матч
                </button>
            </div>
        `;

        container.appendChild(matchDiv);

        const updateBtn = matchDiv.querySelector('.btn-update-score');
        if (canEdit) {
            updateBtn.addEventListener('click', () => openUpdateScoreModal(match));
        }
    });
}

function openUpdateScoreModal(match) {
    const display = getMatchDisplayNames(match);
    document.getElementById('matchTeamsLabel').textContent = `${display.team1} vs ${display.team2}`;
    document.getElementById('team1Label').textContent = display.team1;
    document.getElementById('team2Label').textContent = display.team2;
    document.getElementById('score1Input').value = match.score1;
    document.getElementById('score2Input').value = match.score2;
    document.getElementById('matchStatusSelect').value = match.status;
    document.getElementById('matchIdInput').value = match.id;

    const modal = new bootstrap.Modal(document.getElementById('updateScoreModal'));
    modal.show();
}

document.getElementById('updateScoreForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    if (!currentToken) {
        await customAlert('Спочатку увійдіть в систему');
        return;
    }

    const matchId = parseInt(document.getElementById('matchIdInput').value);
    const score1 = parseInt(document.getElementById('score1Input').value);
    const score2 = parseInt(document.getElementById('score2Input').value);
    const status = document.getElementById('matchStatusSelect').value;

    try {
        const response = await fetch(`/api/matches/${matchId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                score1: score1,
                score2: score2,
                status: status
            })
        });

        if (response.ok) {
            await customAlert('Рахунок оновлено!');
            closeModal('updateScoreModal');
            loadMatches();
        } else {
            const error = await response.json();
            await customAlert(error.error || 'Помилка оновлення рахунку');
        }
    } catch (error) {
        console.error('Помилка:', error);
        await customAlert('Помилка при оновленні рахунку');
    }
});



function getTournamentWatchTeams(tournament) {
    const tournamentTeams = teams
        .filter(team => team.tournamentId === tournament.id)
        .map(team => ({ name: team.name, players: team.players || [] }));

    if (tournamentTeams.length > 0) {
        return tournamentTeams;
    }

    const count = Math.max(2, Number(tournament.teams) || 2);
    return Array.from({ length: count }, (_, index) => ({
        name: `Команда ${String.fromCharCode(65 + index)}`,
        players: []
    }));
}

function buildGroupStage(teamsList) {
    const groupCount = Math.max(1, Math.ceil(teamsList.length / 4));
    const groups = [];
    let index = 0;

    for (let group = 0; group < groupCount; group++) {
        const remaining = teamsList.length - index;
        const groupsLeft = groupCount - group;
        const size = Math.ceil(remaining / groupsLeft);
        const groupTeams = teamsList.slice(index, index + size).map(team => ({
            name: team.name,
            players: team.players,
            wins: 0,
            played: 0,
            results: []
        }));
        index += size;

        for (let i = 0; i < groupTeams.length; i++) {
            for (let j = i + 1; j < groupTeams.length; j++) {
                const home = groupTeams[i];
                const away = groupTeams[j];
                const homeWins = Math.random() < 0.5;
                const homeScore = homeWins ? 2 : 1;
                const awayScore = homeWins ? 1 : 2;

                home.played += 1;
                away.played += 1;
                if (homeWins) {
                    home.wins += 1;
                } else {
                    away.wins += 1;
                }

                const resultText = `${home.name} ${homeScore}:${awayScore} ${away.name}`;
                home.results.push(resultText);
                away.results.push(resultText);
            }
        }

        groupTeams.sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
        groups.push({ label: String.fromCharCode(65 + group), teams: groupTeams });
    }

    return groups;
}

function determineQualifiers(groups) {
    const allTeams = groups.flatMap(group => group.teams);
    const sorted = [...allTeams].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));

    if (sorted.length <= 2) {
        return sorted;
    }

    if (sorted.length === 3) {
        return sorted.slice(0, 2);
    }

    if (sorted.length <= 4) {
        return sorted.slice(0, 2);
    }

    return sorted.slice(0, 3);
}

function simulateMiniRoundRobin(teamsList) {
    const miniTeams = teamsList.map(team => ({
        name: team.name,
        wins: 0,
        played: 0,
        results: []
    }));
    const matches = [];

    for (let i = 0; i < miniTeams.length; i++) {
        for (let j = i + 1; j < miniTeams.length; j++) {
            const home = miniTeams[i];
            const away = miniTeams[j];
            const homeWins = Math.random() < 0.5;
            const homeScore = homeWins ? 2 : 1;
            const awayScore = homeWins ? 1 : 2;

            home.played += 1;
            away.played += 1;
            if (homeWins) {
                home.wins += 1;
            } else {
                away.wins += 1;
            }

            const resultText = `${home.name} ${homeScore}:${awayScore} ${away.name}`;
            home.results.push(resultText);
            away.results.push(resultText);
            matches.push(resultText);
        }
    }

    miniTeams.sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
    return {
        standings: miniTeams,
        matches
    };
}

async function renderWatchContent(tournament) {
    const watchContent = document.getElementById('watchContent');
    const table = await loadTable(tournament.id);
    const registeredTeams = teams.filter(team => team.tournamentId === tournament.id);
    const teamCount = registeredTeams.length || Number(tournament.teams) || 0;
    let html = '';

    html += `<div class="watch-stage-card">
        <h4>Таблиця турніру — ${tournament.name}</h4>
        <p>Команд у турнірі: ${teamCount}</p>
    `;

    const tableEntries = Object.entries(table)
        .map(([teamName, stats]) => [mapTeamNameForTable(teamName, tournament.id), stats]);

    if (tableEntries.length === 0) {
        html += `<div class="alert alert-info">Ще немає завершених матчів для відображення таблиці</div>`;
    } else {
        html += `
            <table class="standings-table">
                <thead>
                    <tr><th>Команда</th><th>Ігри</th><th>Перемоги</th></tr>
                </thead>
                <tbody>
                    ${tableEntries
                        .sort(([,a], [,b]) => b.wins - a.wins || b.games - a.games)
                        .map(([teamName, stats]) => `<tr><td>${teamName}</td><td>${stats.games}</td><td>${stats.wins}</td></tr>`)
                        .join('')}
                </tbody>
            </table>`;
    }

    html += '</div>';
    watchContent.innerHTML = html;
}

async function populateAvailableTeams() {
    const select = document.getElementById('availableTeamsSelect');
    if (!select) return;

    const tournamentsRes = await fetch('/api/tournaments').catch(() => null);
    const tournamentsData = tournamentsRes && tournamentsRes.ok ? await tournamentsRes.json() : [];

    const availableTeams = teams.filter(team => {
        const tournament = tournamentsData.find(t => t.id === team.tournamentId);
        if (!tournament) return false;
        const maxPlayers = parseInt(tournament.players, 10) || 1;
        return team.players.length < maxPlayers;
    });

    if (availableTeams.length === 0) {
        select.innerHTML = '<option value="" disabled>Немає команд з вільними місцями</option>';
        return;
    }

    select.innerHTML = availableTeams
        .map(team => {
            const tournament = tournamentsData.find(t => t.id === team.tournamentId);
            const maxPlayers = parseInt(tournament?.players, 10) || 1;
            const freeSpots = maxPlayers - team.players.length;
            return `<option value="${team.id}" data-free-spots="${freeSpots}">📋 ${team.name} (${team.players.length}/${maxPlayers}) - ${freeSpots} вільних місць</option>`;
        })
        .join('');
}

const joinTeamModalEl = document.getElementById('joinTeamModal');
if (joinTeamModalEl) {
    joinTeamModalEl.addEventListener('show.bs.modal', populateAvailableTeams);
}

function showJoinTeamError(message) {
    const errorDiv = document.getElementById('joinTeamError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('d-none');
}

function hideJoinTeamError() {
    const errorDiv = document.getElementById('joinTeamError');
    errorDiv.textContent = '';
    errorDiv.classList.add('d-none');
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (response.ok) {
                setToken(data.token);
                currentUser = data.user;
                updateAuthUI();
                await loadTournaments();
                loadTeams();
                closeModal('loginModal');
                this.reset();
                await customAlert(`Вхід успішний, ${data.user.username}!`);
            } else {
                await customAlert(data.error || 'Помилка входу');
            }
        } catch (error) {
            await customAlert('Помилка з\'єднання');
        }
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        if (password !== confirmPassword) {
            await customAlert('Паролі не співпадають!');
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: name, email, password })
            });

            const data = await response.json();
            if (response.ok) {
                setToken(data.token);
                currentUser = data.user;
                updateAuthUI();
                await loadTournaments();
                loadTeams();
                closeModal('loginModal');
                this.reset();
                await customAlert(`Реєстрація успішна, ${data.user.username}!`);
            } else {
                await customAlert(data.error || 'Помилка реєстрації');
            }
        } catch (error) {
            await customAlert('Помилка з\'єднання');
        }
    });
}

function updateAuthUI() {
    const loginBtn = document.querySelector('.btn-login');
    if (!loginBtn) return;

    if (currentUser) {
        const roleEmoji = {
            'admin': '🔴',
            'organizer': '🟡',
            'user': '🔵'
        };
        const roleText = {
            'admin': 'Admin',
            'organizer': 'Organizer',
            'user': 'User'
        };
        
        loginBtn.textContent = `${roleEmoji[currentUser.role] || '👤'} Вийти (${currentUser.username})`;
        // Видаляємо Bootstrap модальні атрибути
        loginBtn.removeAttribute('data-bs-toggle');
        loginBtn.removeAttribute('data-bs-target');
        
        // Встановлюємо обробник логіку
        loginBtn.onclick = async (e) => {
            e.preventDefault();
            clearToken();
            updateAuthUI();
            loadTeams();
            await customAlert('Ви вийшли з системи');
        };
    } else {
        loginBtn.textContent = 'Вхід / Реєстрація';
        loginBtn.onclick = null;
        // Повертаємо Bootstrap атрибути для модалі
        loginBtn.setAttribute('data-bs-toggle', 'modal');
        loginBtn.setAttribute('data-bs-target', '#loginModal');
    }

    updateCreateTournamentAuthState();
}


async function loadTournaments() {
    try {
        const response = await fetch('/api/tournaments', {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        tournaments = data;
        const container = document.querySelector('#tournaments-section .row');
        container.innerHTML = '';
        
        if (data.length === 0) {
            container.innerHTML = '<div class="col-12 text-center"><p>Турнірів ще нема</p></div>';
            return;
        }
        
        data.forEach(tournament => {
            const badge = tournament.status || 'Реєстрація';
            const badgeClass = badge === 'LIVE' ? 'bg-danger' : badge === 'Фінал' ? 'bg-success' : 'bg-warning text-dark';
            const canDelete = currentUser && (currentUser.role === 'admin' || String(currentUser.id) === String(tournament.organizer_id));
            
            const card = document.createElement('div');
            card.className = 'col-md-4';
            card.innerHTML = `
                <div class="tournament-card">
                    <div class="tournament-header">
                        <span class="badge ${badgeClass} mb-2">${badge}</span>
                        ${canDelete ? `<button class="btn-delete" data-id="${tournament.id}" title="Видалити турнір">✕</button>` : ''}
                    </div>
                    <h4>${tournament.name}</h4>
                    <p>${tournament.teams} Команд • ${tournament.players || 0} Гравців</p>
                    <p class="tournament-date">${tournament.date || 'Дата не визначена'}</p>
                    <p class="tournament-desc">${tournament.description || ''}</p>
                    <p class="tournament-desc">Код турніру: <strong>${tournament.code || 'N/A'}</strong></p>
                    <button type="button" class="btn btn-success btn-join mt-3" data-code="${tournament.code || ''}" data-name="${tournament.name}">Приєднатися</button>
                </div>
            `;
            container.appendChild(card);
            
            const joinBtn = card.querySelector('.btn-join');
            if (joinBtn) {
                joinBtn.addEventListener('click', () => {
                    hideJoinTeamError();
                    const select = document.getElementById('joinTournamentSelect');
                    if (select) {
                        select.value = tournament.id;
                    }
                    document.getElementById('tournamentCode').value = tournament.code || '';
                    const joinModal = new bootstrap.Modal(document.getElementById('joinTeamModal'));
                    joinModal.show();
                });
            }
            
            const deleteBtn = card.querySelector('.btn-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const confirmed = await customConfirm(`Ви впевнені, що хочете видалити турнір "${tournament.name}"?`);
                    if (confirmed) {
                        await deleteTournament(tournament.id);
                    }
                });
            }
        });

        populateWatchSelect();
        populateJoinTournamentSelect();
    } catch (error) {
        console.error('Помилка завантаження турнірів:', error);
    }
}

function populateJoinTournamentSelect() {
    const select = document.getElementById('joinTournamentSelect');
    if (!select) return;

    if (!tournaments.length) {
        select.innerHTML = '<option value="" disabled selected>Турнірів ще нема</option>';
        return;
    }

    select.innerHTML = `
        <option value="" disabled selected>Оберіть турнір для приєднання</option>
        ${tournaments.map(tournament => `<option value="${tournament.id}" data-code="${tournament.code}">${tournament.name}</option>`).join('')}
    `;
}

const joinTournamentSelect = document.getElementById('joinTournamentSelect');
if (joinTournamentSelect) {
    joinTournamentSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const code = selectedOption?.dataset?.code || '';
        document.getElementById('tournamentCode').value = code;
    });
}

async function deleteTournament(id) {
    if (!currentToken) {
        await customAlert('Спочатку увійдіть в систему');
        return;
    }

    try {
        const response = await fetch(`/api/tournaments/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            await customAlert('Турнір видалено!');
            await loadTournaments();
            await loadTeams();
            await loadMatches();
        } else {
            const error = await response.json();
            await customAlert(error.error || 'Помилка видалення турніру');
        }
    } catch (error) {
        console.error('Помилка:', error);
        await customAlert('Помилка видалення турніру');
    }
}

async function deleteTeam(id) {
    if (!currentToken) {
        await customAlert('Спочатку увійдіть в систему');
        return;
    }

    try {
        const response = await fetch(`/api/teams/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            await customAlert('Команду видалено!');
            loadTeams();
            loadMatches();
        } else {
            const error = await response.json();
            await customAlert(error.error || 'Помилка видалення команди');
        }
    } catch (error) {
        console.error('Помилка:', error);
        await customAlert('Помилка видалення команди');
    }
}

async function removeTeamPlayer(teamId, playerName) {
    if (!currentToken) {
        await customAlert('Спочатку увійдіть в систему');
        return;
    }

    try {
        const response = await fetch(`/api/teams/${teamId}/player?name=${encodeURIComponent(playerName)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            await customAlert(`Гравця "${playerName}" видалено!`);
            loadTeams();
            loadMatches();
        } else {
            const error = await response.json();
            await customAlert(error.error || 'Помилка видалення гравця');
        }
    } catch (error) {
        console.error('Помилка:', error);
        await customAlert('Помилка видалення гравця');
    }
}

document.getElementById('createTournamentForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    if (!currentToken) {
        await customAlert('Спочатку увійдіть в систему');
        return;
    }

    const name = document.getElementById('tournamentName').value;
    const numTeams = document.getElementById('numTeams').value;
    const playersPerTeam = document.getElementById('playersPerTeam').value;
    const date = document.getElementById('tournamentDate').value;
    const description = document.getElementById('tournamentDescription').value;
    
    try {
        const response = await fetch('/api/tournaments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                name: name,
                teams: numTeams,
                players: playersPerTeam,
                date: date,
                description: description
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const matchCount = data.matches ? data.matches.length : 0;
            await customAlert(`Турнір "${name}" створено!
Код турніру: ${data.code}`);
            
            closeModal('createTournamentModal');
            this.reset();
            await loadTournaments();
            await loadMatches();
            await loadTeams();
        } else {
            const error = await response.json();
            await customAlert(error.error || 'Помилка створення турніру');
        }
    } catch (error) {
        console.error('Помилка:', error);
        await customAlert('Помилка створення турніру');
    }
});


async function populateAvailableTeams() {
    const select = document.getElementById('availableTeamsSelect');
    if (!select) return;

    const tournaments = await fetch('/api/tournaments').then(r => r.json()).catch(() => []);

    const availableTeams = teams.filter(team => {
        const tournament = tournaments.find(t => t.id === team.tournamentId);
        if (!tournament) return false;
        const maxPlayers = parseInt(tournament.players, 10) || 1;
        return team.players.length < maxPlayers;
    });

    if (availableTeams.length === 0) {
        select.innerHTML = '<option value="" disabled>Немає команд з вільними місцями</option>';
        return;
    }

    select.innerHTML = availableTeams
        .map(team => {
            const tournament = tournaments.find(t => t.id === team.tournamentId);
            const maxPlayers = parseInt(tournament?.players, 10) || 1;
            const freeSpots = maxPlayers - team.players.length;
            return `<option value="${team.id}" data-free-spots="${freeSpots}">📍 ${team.name} (${team.players.length}/${maxPlayers}) - ${freeSpots} вільних місць</option>`;
        })
        .join('');
}

document.getElementById('joinTeamForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    hideJoinTeamError();

    const teamId = parseInt(document.getElementById('availableTeamsSelect').value, 10);
    const playersText = document.getElementById('joinPlayerNames').value.trim();
    const players = playersText.split(',').map(name => name.trim()).filter(Boolean);

    if (!teamId) {
        showJoinTeamError('Будь ласка, виберіть команду.');
        return;
    }

    if (players.length === 0) {
        showJoinTeamError('Будь ласка, введіть імена гравців.');
        return;
    }

    const normalizedPlayers = players.map(p => p.toLowerCase());
    const uniquePlayers = new Set(normalizedPlayers);
    if (uniquePlayers.size !== players.length) {
        showJoinTeamError('Імена гравців не повинні повторюватися.');
        return;
    }

    try {
        const response = await fetch(`/api/teams/${teamId}/join`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players })
        });

        if (response.ok) {
            const data = await response.json();
            await customAlert(`Ви успішно приєдналися до команди!\nНові гравці: ${players.join(', ')}`);
            closeModal('joinTeamModal');
            this.reset();
            loadTeams();
            loadMatches();
        } else {
            const error = await response.json();
            showJoinTeamError(error.error || 'Помилка при приєднанні до команди');
        }
    } catch (error) {
        console.error('Помилка:', error);
        showJoinTeamError(`Помилка: ${error.message}`);
    }
});


function setupIncrementDecrement(buttonId, inputId, minValue) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    button.addEventListener('click', () => {
        let value = parseInt(input.value) || minValue;
        if (buttonId.includes('increase')) {
            value++;
        } else if (buttonId.includes('decrease') && value > minValue) {
            value--;
        }
        input.value = value;
    });
}
setupIncrementDecrement('increaseTeams', 'numTeams', 2);
setupIncrementDecrement('decreaseTeams', 'numTeams', 2);
setupIncrementDecrement('increasePlayers', 'playersPerTeam', 1);
setupIncrementDecrement('decreasePlayers', 'playersPerTeam', 1);
const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const section = this.getAttribute('data-section');
        navLinks.forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('hero-section').classList.add('d-none');
        document.getElementById('features-section').classList.add('d-none');
        document.getElementById('tournaments-section').classList.add('d-none');
        document.getElementById('teams-section').classList.add('d-none');
        document.getElementById('evaluation-section').classList.add('d-none');
        document.getElementById('results-section').classList.add('d-none');
        document.getElementById('watch-section').classList.add('d-none');
        if (section === 'tournaments') {
            document.getElementById('hero-section').classList.remove('d-none');
            document.getElementById('features-section').classList.remove('d-none');
            document.getElementById('tournaments-section').classList.remove('d-none');
        } else {
            document.getElementById(section + '-section').classList.remove('d-none');
        }
    });
});
const watchButton = document.querySelector('[data-section="watch"]');
if (watchButton) {
    watchButton.addEventListener('click', async function(e) {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        document.getElementById('hero-section').classList.add('d-none');
        document.getElementById('features-section').classList.add('d-none');
        document.getElementById('tournaments-section').classList.add('d-none');
        document.getElementById('teams-section').classList.add('d-none');
        document.getElementById('evaluation-section').classList.add('d-none');
        document.getElementById('results-section').classList.add('d-none');
        document.getElementById('watch-section').classList.remove('d-none');
        populateWatchSelect();

        // Одразу завантажуємо матчи та таблицю для першого турніру
        if (tournaments.length > 0) {
            const firstTournament = tournaments[0];
            document.getElementById('watchTournamentSelect').value = firstTournament.id;
            await loadMatches(firstTournament.id);
            await renderWatchContent(firstTournament);
        }
    });
}

const watchSelectForm = document.getElementById('watchSelectForm');
if (watchSelectForm) {
    watchSelectForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const selectedId = Number(document.getElementById('watchTournamentSelect').value);
        const tournament = tournaments.find(t => t.id === selectedId);
        if (!tournament) {
            return;
        }
        // Оновлюємо матчи для цього турніру та таблицю
        await loadMatches(selectedId);
        await renderWatchContent(tournament);
    });
}

// Очікуємо завантаження DOM перед запуском
document.addEventListener('DOMContentLoaded', async function() {
    // Перевірка авторизації
    await checkAuth();

    loadTournaments();
    loadTeams();
    loadMatches();

    // Автоматичне оновлення матчів кожні 3 секунди (ЛАЙВ!)
    setInterval(loadMatches, 3000);

    const createTournamentModal = document.getElementById('createTournamentModal');
    if (createTournamentModal) {
        createTournamentModal.addEventListener('show.bs.modal', updateCreateTournamentAuthState);
    }
});

