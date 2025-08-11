// Okey Adisyon App - ES Module
// Modern, mobile-friendly score tracking for Okey game

// Constants
const STORAGE_KEY = 'okey-adisyon-state-v1';
const TABLE_STORAGE_KEY = 'okey-tables-v1';
const AUTO_NAV = 'join'; // 'join' | 'create' | 'single' | null
const PLAYER_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

const MODES = {
  solo4: { name: '4 Oyuncu', participants: ['p0', 'p1', 'p2', 'p3'] },
  teams2v2: { name: 'Eşli 2v2', participants: ['A', 'B'] }
};

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAXpt0FUcEIVbr3ni-Ryl-enC9GavWHgPU",
  authDomain: "okey101-game.firebaseapp.com",
  projectId: "okey101-game",
  storageBucket: "okey101-game.firebasestorage.app",
  messagingSenderId: "486845912865",
  appId: "1:486845912865:web:328b20a904594050155060",
  measurementId: "G-0042EW9DS7"
};

// Firebase globals (will be initialized if available)
let app = null;
let db = null;
let useFirestore = false;

// Global State
let state = {
  settings: {
    mode: 'solo4',
    target: 11,
    namesSolo4: ['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4'],
    teamNames: { A: 'Takım A', B: 'Takım B' }
  },
  rows: [],
  penalties: [],
  theme: 'light',
  startedAt: null,
  gameStarted: false,
  // Table management
  currentTable: null,
  currentPlayer: null,
  isTableHost: false,
  // Player statistics
  totalOnlinePlayers: 0,
  currentTablePlayerCount: 0
};

// Table Management System
let tables = {};

// DOM Elements
let elements = {};

// Utility Functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function validateRowData(row) {
  if (!row || !Array.isArray(row.values)) {
    return false;
  }
  
  const participants = getParticipants();
  if (row.values.length !== participants.length) {
    return false;
  }
  
  return true;
}

function sanitizeInput(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  
  const numValue = parseInt(value);
  if (isNaN(numValue)) {
    return null;
  }
  
  // Limit values to reasonable range
  if (numValue < -101 || numValue > 999) {
    return null;
  }
  
  return numValue;
}

// Firebase Firestore Functions
function initializeFirebase() {
  try {
    // Check if Firebase compat is available
    if (typeof window.firebase !== 'undefined' && window.firebase.initializeApp) {
      app = window.firebase.initializeApp(firebaseConfig);
      db = window.firebase.firestore();
      useFirestore = true;
      console.log('Firebase Firestore initialized successfully');
    } else {
      console.log('Firebase not available, using localStorage');
      useFirestore = false;
    }
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    useFirestore = false;
  }
}

async function fsCreateTable(tableName, password) {
  if (!useFirestore) return createTable(tableName, password);
  
  try {
    const tableId = generateTableId();
    const tableData = {
      id: tableId,
      name: tableName,
      password: password,
      createdAt: new Date().toISOString(),
      host: 0,
      players: {
        0: { name: 'Oyuncu 1', online: true, isHost: true, lastSeen: new Date().toISOString() },
        1: { name: 'Oyuncu 2', online: false, isHost: false, lastSeen: null },
        2: { name: 'Oyuncu 3', online: false, isHost: false, lastSeen: null },
        3: { name: 'Oyuncu 4', online: false, isHost: false, lastSeen: null }
      },
      gameState: {
        settings: {
          mode: 'solo4',
          target: 11,
          namesSolo4: ['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4']
        },
        rows: [],
        penalties: [],
        startedAt: null,
        gameStarted: false
      },
      lastActivity: new Date().toISOString(),
      gameCanStart: false
    };
    
    await db.collection('tables').doc(tableId).set(tableData);
    tables[tableId] = tableData;
    updatePlayerCounts();
    
    return tableId;
  } catch (error) {
    console.error('Firestore create table error:', error);
    return createTable(tableName, password);
  }
}

async function fsJoinTableById(tableId, playerNumber, password) {
  if (!useFirestore) return joinTableById(tableId, playerNumber, password);
  
  try {
    const tableDoc = await db.collection('tables').doc(tableId).get();
    
    if (!tableDoc.exists) {
      throw new Error('Masa bulunamadı');
    }
    
    const table = tableDoc.data();
    
    if (table.password !== password) {
      throw new Error('Yanlış şifre');
    }
    
    if (table.players[playerNumber].online) {
      throw new Error('Bu oyuncu pozisyonu zaten dolu');
    }
    
    // Update player status
    const updateData = {};
    updateData[`players.${playerNumber}.online`] = true;
    updateData[`players.${playerNumber}.lastSeen`] = new Date().toISOString();
    updateData['lastActivity'] = new Date().toISOString();
    
    // Check if all 4 players are online
    const updatedPlayers = { ...table.players };
    updatedPlayers[playerNumber].online = true;
    const onlineCount = Object.values(updatedPlayers).filter(p => p.online).length;
    updateData['gameCanStart'] = onlineCount === 4;
    
    await db.collection('tables').doc(tableId).update(updateData);
    
    // Update local cache
    table.players[playerNumber].online = true;
    table.players[playerNumber].lastSeen = new Date().toISOString();
    table.gameCanStart = onlineCount === 4;
    tables[tableId] = table;
    updatePlayerCounts();
    
    return table;
  } catch (error) {
    console.error('Firestore join table error:', error);
    throw error;
  }
}

async function fsUpdateGameState(tableId, gameState) {
  if (!useFirestore) return updateTableGameState(tableId, gameState);
  
  try {
    const updateData = {
      gameState: gameState,
      lastActivity: new Date().toISOString()
    };
    
    await db.collection('tables').doc(tableId).update(updateData);
    
    // Update local cache
    if (tables[tableId]) {
      tables[tableId].gameState = gameState;
      tables[tableId].lastActivity = new Date().toISOString();
    }
    
    broadcastTableUpdate(tableId);
  } catch (error) {
    console.error('Firestore update game state error:', error);
    updateTableGameState(tableId, gameState);
  }
}

function fsStartListener(tableId, callback) {
  if (!useFirestore) return;
  
  try {
    return db.collection('tables').doc(tableId).onSnapshot((doc) => {
      if (doc.exists) {
        const table = doc.data();
        tables[tableId] = table;
        updatePlayerCounts();
        callback(table);
      }
    });
  } catch (error) {
    console.error('Firestore listener error:', error);
    return null;
  }
}

// Table Management Functions
function loadTables() {
  try {
    const saved = localStorage.getItem(TABLE_STORAGE_KEY);
    if (saved) {
      tables = JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load tables:', error);
    tables = {};
  }
}

function saveTables() {
  try {
    localStorage.setItem(TABLE_STORAGE_KEY, JSON.stringify(tables));
  } catch (error) {
    console.error('Failed to save tables:', error);
  }
}

function generateTableId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function createTable(tableName, password) {
  const tableId = generateTableId();
  
  tables[tableId] = {
    id: tableId,
    name: tableName,
    password: password,
    createdAt: new Date().toISOString(),
    host: 0, // Player 0 is the host
    players: {
      0: { name: 'Oyuncu 1', online: true, isHost: true },
      1: { name: 'Oyuncu 2', online: false, isHost: false },
      2: { name: 'Oyuncu 3', online: false, isHost: false },
      3: { name: 'Oyuncu 4', online: false, isHost: false }
    },
    gameState: {
      settings: {
        mode: 'solo4',
        target: 11,
        namesSolo4: ['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4']
      },
      rows: [],
      penalties: [],
      startedAt: null,
      gameStarted: false
    },
    lastActivity: new Date().toISOString()
  };
  
  saveTables();
  return tableId;
}

function joinTableById(tableId, playerNumber, password) {
  const table = tables[tableId];
  
  if (!table) {
    throw new Error('Masa bulunamadı');
  }
  
  if (table.password !== password) {
    throw new Error('Yanlış şifre');
  }
  
  if (table.players[playerNumber].online) {
    throw new Error('Bu oyuncu pozisyonu zaten dolu');
  }
  
  table.players[playerNumber].online = true;
  table.players[playerNumber].lastSeen = new Date().toISOString();
  table.lastActivity = new Date().toISOString();
  
  // Check if all 4 players are online
  const onlineCount = Object.values(table.players).filter(p => p.online).length;
  table.gameCanStart = onlineCount === 4;
  
  saveTables();
  updatePlayerCounts();
  return table;
}

function joinTable(tableId, playerNumber, password) {
  const table = tables[tableId];
  
  if (!table) {
    throw new Error('Masa bulunamadı');
  }
  
  if (table.password !== password) {
    throw new Error('Yanlış şifre');
  }
  
  if (table.players[playerNumber].online) {
    throw new Error('Bu oyuncu pozisyonu zaten dolu');
  }
  
  table.players[playerNumber].online = true;
  table.lastActivity = new Date().toISOString();
  
  saveTables();
  return table;
}

function leaveTable(tableId, playerNumber) {
  const table = tables[tableId];
  
  if (table && table.players[playerNumber]) {
    table.players[playerNumber].online = false;
    table.lastActivity = new Date().toISOString();
    
    // If all players are offline, remove the table after 5 minutes
    const allOffline = Object.values(table.players).every(player => !player.online);
    if (allOffline) {
      setTimeout(() => {
        if (tables[tableId]) {
          const currentTable = tables[tableId];
          const stillAllOffline = Object.values(currentTable.players).every(player => !player.online);
          if (stillAllOffline) {
            delete tables[tableId];
            saveTables();
          }
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
    
    saveTables();
  }
}

function updateTableGameState(tableId, gameState) {
  const table = tables[tableId];
  
  if (table) {
    table.gameState = { ...gameState };
    table.lastActivity = new Date().toISOString();
    saveTables();
    
    // Simulate broadcasting to other players
    broadcastTableUpdate(tableId);
  }
}

function broadcastTableUpdate(tableId) {
  // In a real implementation, this would use WebSocket
  // For now, we'll simulate it with localStorage events
  const event = new CustomEvent('tableUpdate', {
    detail: { tableId, timestamp: Date.now() }
  });
  window.dispatchEvent(event);
}

function syncWithTable() {
  if (!state.currentTable) return;
  
  const table = tables[state.currentTable];
  if (table && table.gameState) {
    // Update local state with table state
    const tableState = table.gameState;
    state.settings = { ...tableState.settings };
    state.rows = [...tableState.rows];
    state.penalties = [...tableState.penalties];
    state.startedAt = tableState.startedAt;
    state.gameStarted = tableState.gameStarted;
    
    // Update UI
    if (state.gameStarted) {
      renderTable();
      updateTotals();
      updateMilestone();
      checkWinner();
    }
    
    updatePlayerStatus();
    updatePlayerCounts();
  }
}

function updatePlayerCounts() {
  // Count total online players across all tables
  let totalOnline = 0;
  let currentTableCount = 0;
  
  Object.values(tables).forEach(table => {
    const onlineInTable = Object.values(table.players).filter(p => p.online).length;
    totalOnline += onlineInTable;
    
    if (table.id === state.currentTable) {
      currentTableCount = onlineInTable;
    }
  });
  
  // Add standalone players (not in any table) - assume 1 for now
  if (!state.currentTable) {
    totalOnline += 1;
  }
  
  state.totalOnlinePlayers = totalOnline;
  state.currentTablePlayerCount = currentTableCount;
  
  // Update UI
  updatePlayerCountDisplay();
}

function updatePlayerCountDisplay() {
  // Update total player count in header
  const playerCountElement = document.getElementById('total-player-count');
  if (playerCountElement) {
    playerCountElement.textContent = `${state.totalOnlinePlayers} oyuncu çevrimiçi`;
  }
  
  // Update current table player count
  const tablePlayerCountElement = document.getElementById('table-player-count');
  if (tablePlayerCountElement && state.currentTable) {
    const table = tables[state.currentTable];
    if (table) {
      const onlineCount = Object.values(table.players).filter(p => p.online).length;
      tablePlayerCountElement.textContent = `Oyunda: ${onlineCount}/4 kişi`;
    }
  }
}

function checkOfflinePlayers() {
  const now = new Date();
  
  Object.keys(tables).forEach(tableId => {
    const table = tables[tableId];
    let hasChanges = false;
    
    Object.keys(table.players).forEach(playerIndex => {
      const player = table.players[playerIndex];
      
      if (player.online && player.lastSeen) {
        const lastSeen = new Date(player.lastSeen);
        const timeDiff = now - lastSeen;
        
        if (timeDiff > PLAYER_TIMEOUT) {
          player.online = false;
          hasChanges = true;
          console.log(`Player ${playerIndex} in table ${tableId} timed out`);
        }
      }
    });
    
    if (hasChanges) {
      // Update gameCanStart status
      const onlineCount = Object.values(table.players).filter(p => p.online).length;
      table.gameCanStart = onlineCount === 4;
      
      // If using Firestore, update there too
      if (useFirestore) {
        const updateData = {};
        Object.keys(table.players).forEach(playerIndex => {
          const player = table.players[playerIndex];
          updateData[`players.${playerIndex}.online`] = player.online;
        });
        updateData['gameCanStart'] = table.gameCanStart;
        updateData['lastActivity'] = new Date().toISOString();
        
        db.collection('tables').doc(tableId).update(updateData).catch(console.error);
      }
      
      saveTables();
      updatePlayerCounts();
      
      // Update UI if this is current table
      if (tableId === state.currentTable) {
        updatePlayerStatus();
      }
    }
  });
}

// Start offline player checker
setInterval(checkOfflinePlayers, 30000); // Check every 30 seconds

// State Management
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with default state to handle version updates
      state = { ...state, ...parsed };
      return true;
    }
  } catch (error) {
    console.error('Failed to load state:', error);
  }
  return false;
}

function resetState() {
  state = {
    settings: {
      mode: 'solo4',
      target: 11,
      namesSolo4: ['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4'],
      teamNames: { A: 'Takım A', B: 'Takım B' }
    },
    rows: [],
    penalties: [],
    theme: state.theme, // Preserve theme
    startedAt: null,
    gameStarted: false,
    // Reset table management
    currentTable: null,
    currentPlayer: null,
    isTableHost: false
  };
  saveState();
}

// Game Logic Functions
function getParticipants() {
  return MODES[state.settings.mode].participants;
}

function getParticipantName(id) {
  const { mode, namesSolo4, teamNames } = state.settings;
  
  if (mode === 'solo4') {
    return namesSolo4[parseInt(id.replace('p', ''))];
  } else if (mode === 'teams2v2') {
    return teamNames[id];
  }
  return id;
}

function sumHandsFor(participantId) {
  return state.rows.reduce((sum, row) => {
    const participantIndex = getParticipants().indexOf(participantId);
    const value = row.values[participantIndex];
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
}

function sumPenaltiesFor(participantId) {
  return state.penalties
    .filter(penalty => penalty.target === participantId)
    .reduce((sum, penalty) => sum + penalty.value, 0);
}

function totalFor(participantId) {
  return sumHandsFor(participantId) + sumPenaltiesFor(participantId);
}

function isRowComplete(row) {
  const participants = getParticipants();
  return participants.every((_, index) => {
    const value = row.values[index];
    return value !== null && value !== undefined && value !== '';
  });
}

function getMilestoneHand() {
  return state.settings.target - 1;
}

function getCurrentHandNumber() {
  return state.rows.length + 1;
}

function isAtMilestone() {
  const completedRows = state.rows.filter(isRowComplete);
  return completedRows.length === getMilestoneHand();
}

function isGameComplete() {
  const completedRows = state.rows.filter(isRowComplete);
  return completedRows.length >= state.settings.target;
}

function getWinner() {
  if (!isGameComplete()) return null;
  
  const participants = getParticipants();
  let winner = participants[0];
  let highestScore = totalFor(participants[0]);
  
  for (let i = 1; i < participants.length; i++) {
    const score = totalFor(participants[i]);
    if (score > highestScore) {
      highestScore = score;
      winner = participants[i];
    }
  }
  
  return { id: winner, name: getParticipantName(winner), score: highestScore };
}

// UI Update Functions
function updateTheme() {
  document.documentElement.dataset.theme = state.theme;
  const themeIcon = elements.themeToggle.querySelector('.theme-icon');
  themeIcon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

function updateModeVisibility() {
  const mode = state.settings.mode;
  
  // Hide all name groups
  elements.namesSolo4.style.display = 'none';
  elements.namesTeams.style.display = 'none';
  
  // Show relevant name group
  if (mode === 'solo4') {
    elements.namesSolo4.style.display = 'block';
  } else if (mode === 'teams2v2') {
    elements.namesTeams.style.display = 'block';
  }
}

function updateSettingsFromForm() {
  // Get mode
  const modeRadio = document.querySelector('input[name="mode"]:checked');
  state.settings.mode = modeRadio.value;
  
  // Get target
  state.settings.target = parseInt(elements.targetSelect.value);
  
  // Get names based on mode
  if (state.settings.mode === 'solo4') {
    state.settings.namesSolo4 = [
      elements.nameS0.value.trim() || 'Oyuncu 1',
      elements.nameS1.value.trim() || 'Oyuncu 2',
      elements.nameS2.value.trim() || 'Oyuncu 3',
      elements.nameS3.value.trim() || 'Oyuncu 4'
    ];
  } else if (state.settings.mode === 'teams2v2') {
    state.settings.teamNames = {
      A: elements.nameTeamA.value.trim() || 'Takım A',
      B: elements.nameTeamB.value.trim() || 'Takım B'
    };
  }
}

function populateSettingsForm() {
  // Set mode
  const modeRadio = document.querySelector(`input[name="mode"][value="${state.settings.mode}"]`);
  if (modeRadio) modeRadio.checked = true;
  
  // Set target
  elements.targetSelect.value = state.settings.target;
  
  // Set names
  if (state.settings.namesSolo4) {
    elements.nameS0.value = state.settings.namesSolo4[0];
    elements.nameS1.value = state.settings.namesSolo4[1];
    elements.nameS2.value = state.settings.namesSolo4[2];
    elements.nameS3.value = state.settings.namesSolo4[3];
  }
  
  if (state.settings.teamNames) {
    elements.nameTeamA.value = state.settings.teamNames.A;
    elements.nameTeamB.value = state.settings.teamNames.B;
  }
  
  updateModeVisibility();
}

function renderTable() {
  const participants = getParticipants();
  
  // Render table header
  const headerRow = document.createElement('tr');
  
  // Hand number column
  const handHeader = document.createElement('th');
  handHeader.textContent = 'El';
  handHeader.style.minWidth = '50px';
  headerRow.appendChild(handHeader);
  
  // Participant columns
  participants.forEach(participantId => {
    const th = document.createElement('th');
    const headerDiv = document.createElement('div');
    headerDiv.className = 'player-header';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'player-name';
    nameDiv.textContent = getParticipantName(participantId);
    headerDiv.appendChild(nameDiv);
    
    const penaltyBtn = document.createElement('button');
    penaltyBtn.className = 'penalty-btn';
    penaltyBtn.textContent = 'Siler -101';
    penaltyBtn.onclick = () => addQuickPenalty(participantId);
    headerDiv.appendChild(penaltyBtn);
    
    th.appendChild(headerDiv);
    headerRow.appendChild(th);
  });
  
  elements.tableHead.innerHTML = '';
  elements.tableHead.appendChild(headerRow);
  
  // Render table body
  elements.tableBody.innerHTML = '';
  
  // Add existing rows
  state.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    
    // Hand number
    const handTd = document.createElement('td');
    handTd.innerHTML = `<div class="hand-number">${row.hand}</div>`;
    tr.appendChild(handTd);
    
    // Score cells
    participants.forEach((participantId, colIndex) => {
      const td = document.createElement('td');
      td.className = 'score-cell';
      
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'score-input';
      input.min = '-101';
      input.max = '999';
      input.step = '1';
      input.value = row.values[colIndex] || '';
      input.dataset.row = rowIndex;
      input.dataset.col = colIndex;
      
      if (row.values[colIndex] < 0) {
        input.classList.add('negative');
      }
      
      input.addEventListener('input', handleScoreInput);
      input.addEventListener('keydown', handleScoreKeydown);
      
      // -101 button
      const minus101Btn = document.createElement('button');
      minus101Btn.className = 'minus-101-btn';
      minus101Btn.textContent = '-101';
      minus101Btn.dataset.row = rowIndex;
      minus101Btn.dataset.col = colIndex;
      minus101Btn.onclick = handleMinus101Click;
      
      if (row.values[colIndex] === -101) {
        minus101Btn.classList.add('active');
      }
      
      td.appendChild(input);
      td.appendChild(minus101Btn);
      tr.appendChild(td);
    });
    
    elements.tableBody.appendChild(tr);
  });
  
  // This logic is now handled in handleScoreInput when row is completed
}

function addNewRow() {
  const participants = getParticipants();
  const handNumber = getCurrentHandNumber();
  
  // Check if this row already exists
  if (state.rows.find(row => row.hand === handNumber)) {
    return; // Row already exists, don't add again
  }
  
  // Add to state
  state.rows.push({
    hand: handNumber,
    values: new Array(participants.length).fill(null)
  });
  
  // Render the table to show the new row
  renderTable();
}

function updateTotals() {
  const participants = getParticipants();
  
  elements.totalsContent.innerHTML = '';
  
  participants.forEach(participantId => {
    const handSum = sumHandsFor(participantId);
    const penaltySum = sumPenaltiesFor(participantId);
    const total = handSum + penaltySum;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'total-item';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'total-label';
    nameDiv.textContent = getParticipantName(participantId);
    itemDiv.appendChild(nameDiv);
    
    const scoresDiv = document.createElement('div');
    scoresDiv.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--text-muted);">
        El: ${handSum} | Siler: ${penaltySum}
      </div>
    `;
    itemDiv.appendChild(scoresDiv);
    
    const totalDiv = document.createElement('div');
    totalDiv.className = `total-value ${total < 0 ? 'negative' : total > 0 ? 'positive' : ''}`;
    totalDiv.textContent = total;
    itemDiv.appendChild(totalDiv);
    
    elements.totalsContent.appendChild(itemDiv);
  });
}

function updateMilestone() {
  const milestoneHand = getMilestoneHand();
  const completedRows = state.rows.filter(isRowComplete);
  
  if (completedRows.length === milestoneHand && milestoneHand > 0) {
    elements.milestoneScores.innerHTML = '';
    
    const participants = getParticipants();
    participants.forEach(participantId => {
      const score = totalFor(participantId);
      const scoreSpan = document.createElement('span');
      scoreSpan.innerHTML = `${getParticipantName(participantId)}: <strong>${score}</strong>`;
      elements.milestoneScores.appendChild(scoreSpan);
    });
    
    elements.milestoneBanner.style.display = 'block';
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      elements.milestoneBanner.style.display = 'none';
    }, 10000);
  } else {
    elements.milestoneBanner.style.display = 'none';
  }
}

function checkWinner() {
  if (isGameComplete()) {
    const winner = getWinner();
    if (winner) {
      elements.winnerText.innerHTML = `
        <div style="margin-bottom: 1rem;">
          <strong>${winner.name}</strong> kazandı!
        </div>
        <div>Final Skoru: <strong>${winner.score}</strong></div>
      `;
      elements.winnerBanner.style.display = 'flex';
    }
  }
}

function updatePlayerStatus() {
  if (!state.currentTable || !elements.playerStatus) {
    return;
  }
  
  const table = tables[state.currentTable];
  if (!table) return;
  
  // Show player status section
  elements.playerStatus.style.display = 'block';
  
  // Update each player block
  for (let i = 0; i < 4; i++) {
    const playerBlock = document.querySelector(`.player-block[data-player="${i}"]`);
    if (playerBlock) {
      const player = table.players[i];
      const nameElement = playerBlock.querySelector('.player-name-status');
      const statusElement = playerBlock.querySelector('.player-online-status');
      
      nameElement.textContent = player.name;
      
      if (i === state.currentPlayer) {
        statusElement.textContent = 'Sen';
        statusElement.className = 'player-online-status current';
        playerBlock.classList.add('current-player');
      } else if (player.online) {
        statusElement.textContent = 'Çevrimiçi';
        statusElement.className = 'player-online-status online';
        playerBlock.classList.remove('current-player');
      } else {
        statusElement.textContent = 'Çevrimdışı';
        statusElement.className = 'player-online-status offline';
        playerBlock.classList.remove('current-player');
      }
    }
  }
}

// Event Handlers
function handleScoreInput(event) {
  const input = event.target;
  const rowIndex = parseInt(input.dataset.row);
  const colIndex = parseInt(input.dataset.col);
  
  // Validate row index
  if (rowIndex < 0 || rowIndex >= state.rows.length) {
    console.error('Invalid row index:', rowIndex);
    return;
  }
  
  // Validate row data
  if (!validateRowData(state.rows[rowIndex])) {
    console.error('Invalid row data at index:', rowIndex);
    return;
  }
  
  let value = input.value.trim();
  const sanitizedValue = sanitizeInput(value);
  
  // Update state
  state.rows[rowIndex].values[colIndex] = sanitizedValue;
  
  // Update visual styling
  if (sanitizedValue !== null && sanitizedValue < 0) {
    input.classList.add('negative');
  } else {
    input.classList.remove('negative');
  }
  
  // Update -101 button state
  const minus101Btn = input.parentElement.querySelector('.minus-101-btn');
  if (minus101Btn) {
    if (sanitizedValue === -101) {
      minus101Btn.classList.add('active');
    } else {
      minus101Btn.classList.remove('active');
    }
  }
  
  saveState();
  updateTotals();
  
  // Sync with table if in table mode
  if (state.currentTable) {
    const gameState = {
      settings: state.settings,
      rows: state.rows,
      penalties: state.penalties,
      startedAt: state.startedAt,
      gameStarted: state.gameStarted
    };
    
    if (useFirestore) {
      fsUpdateGameState(state.currentTable, gameState);
    } else {
      updateTableGameState(state.currentTable, gameState);
    }
  }
  
  // Check if row is complete
  const currentRow = state.rows[rowIndex];
  if (isRowComplete(currentRow)) {
    updateMilestone();
    checkWinner();
    
    // Only add new row if game is not complete
    if (!isGameComplete()) {
      // Add new row for next hand
      const nextHandNumber = getCurrentHandNumber();
      const hasNextRow = state.rows.find(row => row.hand === nextHandNumber);
      
      if (!hasNextRow) {
        state.rows.push({
          hand: nextHandNumber,
          values: new Array(getParticipants().length).fill(null)
        });
      }
    }
    
    // Re-render to show the updated state
    renderTable();
  }
}

function handleScoreKeydown(event) {
  const input = event.target;
  const rowIndex = parseInt(input.dataset.row);
  const colIndex = parseInt(input.dataset.col);
  
  if (event.key === 'Enter') {
    event.preventDefault();
    
    if (event.shiftKey) {
      // Shift+Enter: Move to previous row, same column
      const prevRowInput = elements.tableBody.querySelector(`input[data-row="${rowIndex - 1}"][data-col="${colIndex}"]`);
      if (prevRowInput) {
        prevRowInput.focus();
        prevRowInput.select();
      }
    } else {
      // Enter: Move to next column or next row
      const participants = getParticipants();
      
      if (colIndex < participants.length - 1) {
        // Next column, same row
        const nextColInput = elements.tableBody.querySelector(`input[data-row="${rowIndex}"][data-col="${colIndex + 1}"]`);
        if (nextColInput) {
          nextColInput.focus();
          nextColInput.select();
        }
      } else {
        // Next row, first column
        const nextRowInput = elements.tableBody.querySelector(`input[data-row="${rowIndex + 1}"][data-col="0"]`);
        if (nextRowInput) {
          nextRowInput.focus();
          nextRowInput.select();
        }
      }
    }
  }
}

function handleMinus101Click(event) {
  event.preventDefault();
  const btn = event.target;
  const rowIndex = parseInt(btn.dataset.row);
  const colIndex = parseInt(btn.dataset.col);
  const input = btn.parentElement.querySelector('.score-input');
  
  const currentValue = state.rows[rowIndex].values[colIndex];
  
  if (currentValue === -101) {
    // Remove -101, restore previous value or set to null
    state.rows[rowIndex].values[colIndex] = btn.dataset.prevValue ? parseInt(btn.dataset.prevValue) : null;
    btn.classList.remove('active');
    delete btn.dataset.prevValue;
  } else {
    // Set to -101, remember previous value
    if (currentValue !== null && currentValue !== -101) {
      btn.dataset.prevValue = currentValue;
    }
    state.rows[rowIndex].values[colIndex] = -101;
    btn.classList.add('active');
  }
  
  // Update input
  input.value = state.rows[rowIndex].values[colIndex] || '';
  
  if (state.rows[rowIndex].values[colIndex] < 0) {
    input.classList.add('negative');
  } else {
    input.classList.remove('negative');
  }
  
  // Trigger input event to update totals
  input.dispatchEvent(new Event('input'));
}

function handleStartGame() {
  updateSettingsFromForm();
  
  // Validate names
  const participants = getParticipants();
  let hasEmptyNames = false;
  
  participants.forEach(participantId => {
    const name = getParticipantName(participantId);
    if (!name || name.trim() === '') {
      hasEmptyNames = true;
    }
  });
  
  if (hasEmptyNames) {
    alert('Lütfen tüm oyuncu/takım isimlerini doldurun.');
    return;
  }
  
  state.gameStarted = true;
  state.startedAt = new Date().toISOString();
  
  // Initialize first row
  state.rows = [{
    hand: 1,
    values: new Array(participants.length).fill(null)
  }];
  
  // Hide settings, show game
  elements.settingsCard.style.display = 'none';
  elements.gameSection.style.display = 'block';
  
  renderTable();
  updateTotals();
  
  saveState();
  
  // Focus first input
  setTimeout(() => {
    const firstInput = elements.tableBody.querySelector('input[data-row="0"][data-col="0"]');
    if (firstInput) {
      firstInput.focus();
    }
  }, 100);
}

function handleNewGame() {
  if (state.gameStarted) {
    if (!confirm('Mevcut oyunu sıfırlayıp yeni oyun başlatmak istediğinizden emin misiniz?')) {
      return;
    }
  }
  
  // Leave current table if in one
  if (state.currentTable && state.currentPlayer !== null) {
    leaveTable(state.currentTable, state.currentPlayer);
  }
  
  resetState();
  
  // Show main menu, hide all other cards
  elements.mainMenuCard.style.display = 'block';
  elements.settingsCard.style.display = 'none';
  elements.gameSection.style.display = 'none';
  elements.tableCreationCard.style.display = 'none';
  elements.joinTableCard.style.display = 'none';
  elements.milestoneBanner.style.display = 'none';
  elements.winnerBanner.style.display = 'none';
  
  // Hide player status
  if (elements.playerStatus) {
    elements.playerStatus.style.display = 'none';
  }
  
  populateSettingsForm();
}

function handleUndo() {
  if (state.rows.length === 0) return;
  
  // Find the last completed row
  let lastCompletedRowIndex = -1;
  for (let i = state.rows.length - 1; i >= 0; i--) {
    if (isRowComplete(state.rows[i])) {
      lastCompletedRowIndex = i;
      break;
    }
  }
  
  if (lastCompletedRowIndex >= 0) {
    // Clear the last completed row
    const participants = getParticipants();
    state.rows[lastCompletedRowIndex].values = new Array(participants.length).fill(null);
    
    // Remove any rows after the incomplete row
    if (lastCompletedRowIndex < state.rows.length - 1) {
      state.rows = state.rows.slice(0, lastCompletedRowIndex + 1);
    }
    
    saveState();
    renderTable();
    updateTotals();
    updateMilestone();
    
    // Hide winner banner if showing
    elements.winnerBanner.style.display = 'none';
    
    // Focus first input of the reopened row
    setTimeout(() => {
      const firstInput = elements.tableBody.querySelector(`input[data-row="${lastCompletedRowIndex}"][data-col="0"]`);
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
  }
}

function handleAddHand() {
  if (isGameComplete()) return;
  
  // Add new row to state
  const participants = getParticipants();
  const newHandNumber = getCurrentHandNumber();
  
  // Check if this row already exists
  if (!state.rows.find(row => row.hand === newHandNumber)) {
    state.rows.push({
      hand: newHandNumber,
      values: new Array(participants.length).fill(null)
    });
    
    saveState();
    renderTable();
    
    // Focus first input of new row
    setTimeout(() => {
      const newRowInputs = elements.tableBody.querySelectorAll(`input[data-row="${state.rows.length - 1}"]`);
      if (newRowInputs.length > 0) {
        newRowInputs[0].focus();
      }
    }, 100);
  }
}

function handleThemeToggle() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  updateTheme();
  saveState();
}

function handlePrint() {
  // Add print header with game info
  const printHeader = document.createElement('div');
  printHeader.className = 'print-header';
  printHeader.style.display = 'none';
  printHeader.innerHTML = `
    <h1>Okey Adisyon</h1>
    <p>Tarih: ${formatDate(state.startedAt || new Date())}</p>
  `;
  
  const printSummary = document.createElement('div');
  printSummary.className = 'print-summary';
  printSummary.style.display = 'none';
  printSummary.innerHTML = `
    <h3>Oyun Bilgileri</h3>
    <p><strong>Mod:</strong> ${MODES[state.settings.mode].name}</p>
    <p><strong>Hedef:</strong> ${state.settings.target} El</p>
    <p><strong>Oyuncular:</strong> ${getParticipants().map(getParticipantName).join(', ')}</p>
  `;
  
  document.body.insertBefore(printHeader, document.body.firstChild);
  document.body.insertBefore(printSummary, elements.mainContent);
  
  // Print
  window.print();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(printHeader);
    document.body.removeChild(printSummary);
  }, 1000);
}

function handleDemo() {
  // Fill with demo data
  if (state.settings.mode === 'solo4') {
    elements.nameS0.value = 'Ahmet';
    elements.nameS1.value = 'Mehmet';
    elements.nameS2.value = 'Ayşe';
    elements.nameS3.value = 'Fatma';
  } else if (state.settings.mode === 'teams2v2') {
    elements.nameTeamA.value = 'Anadolu';
    elements.nameTeamB.value = 'Fenerbahçe';
  }
  
  elements.targetSelect.value = '7';
}

// Penalty Functions
function addQuickPenalty(participantId) {
  const penalty = {
    id: generateId(),
    target: participantId,
    value: -101,
    note: 'Hızlı siler',
    createdAt: new Date().toISOString()
  };
  
  state.penalties.push(penalty);
  saveState();
  updateTotals();
  
  // Show notification (optional)
  console.log(`${getParticipantName(participantId)} için -101 siler eklendi`);
}

// Penalty Modal Functions
let currentPenaltyTarget = null;

function openPenaltyModal(participantId) {
  currentPenaltyTarget = participantId;
  elements.penaltyModalTitle.textContent = `${getParticipantName(participantId)} - Siler Defteri`;
  elements.penaltyValue.value = '';
  elements.penaltyNote.value = '';
  
  renderPenaltyList();
  elements.penaltyModal.style.display = 'flex';
  
  // Focus on value input
  setTimeout(() => {
    elements.penaltyValue.focus();
  }, 100);
}

function closePenaltyModal() {
  elements.penaltyModal.style.display = 'none';
  currentPenaltyTarget = null;
}

function renderPenaltyList() {
  const penalties = state.penalties.filter(p => p.target === currentPenaltyTarget);
  
  elements.penaltyItems.innerHTML = '';
  
  if (penalties.length === 0) {
    elements.penaltyItems.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Henüz siler kaydı yok</p>';
    return;
  }
  
  penalties.forEach(penalty => {
    const item = document.createElement('div');
    item.className = 'penalty-item';
    
    const info = document.createElement('div');
    info.className = 'penalty-info';
    
    const value = document.createElement('div');
    value.className = 'penalty-value';
    value.textContent = penalty.value;
    info.appendChild(value);
    
    if (penalty.note) {
      const note = document.createElement('div');
      note.className = 'penalty-note';
      note.textContent = penalty.note;
      info.appendChild(note);
    }
    
    const date = document.createElement('div');
    date.className = 'penalty-date';
    date.textContent = formatDate(penalty.createdAt);
    info.appendChild(date);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'penalty-remove';
    removeBtn.textContent = 'Sil';
    removeBtn.onclick = () => removePenalty(penalty.id);
    
    item.appendChild(info);
    item.appendChild(removeBtn);
    elements.penaltyItems.appendChild(item);
  });
}

function addPenalty() {
  const value = parseInt(elements.penaltyValue.value);
  const note = elements.penaltyNote.value.trim();
  
  if (isNaN(value) || value >= 0) {
    alert('Geçerli bir negatif değer girin (örn: -101)');
    return;
  }
  
  if (value < -999) {
    alert('Çok büyük bir ceza değeri. Maksimum -999 olabilir.');
    return;
  }
  
  const penalty = {
    id: generateId(),
    target: currentPenaltyTarget,
    value: value,
    note: note || undefined,
    createdAt: new Date().toISOString()
  };
  
  state.penalties.push(penalty);
  saveState();
  
  renderPenaltyList();
  updateTotals();
  
  // Clear form
  elements.penaltyValue.value = '';
  elements.penaltyNote.value = '';
  
  // Focus back to value input
  elements.penaltyValue.focus();
}

function removePenalty(penaltyId) {
  if (!confirm('Bu siler kaydını silmek istediğinizden emin misiniz?')) {
    return;
  }
  
  state.penalties = state.penalties.filter(p => p.id !== penaltyId);
  saveState();
  
  renderPenaltyList();
  updateTotals();
}

function handlePenaltyQuickBtn(event) {
  const value = parseInt(event.target.dataset.value);
  elements.penaltyValue.value = value;
}

// Navigation Event Handlers
function handleCreateTableMode() {
  elements.mainMenuCard.style.display = 'none';
  elements.tableCreationCard.style.display = 'block';
  elements.tableName.focus();
}

function handleJoinTableMode() {
  elements.mainMenuCard.style.display = 'none';
  elements.joinTableCard.style.display = 'block';
  elements.joinTableName.focus();
}

function handleSinglePlayerMode() {
  elements.mainMenuCard.style.display = 'none';
  elements.settingsCard.style.display = 'block';
}

function handleBackToMainMenu() {
  // Hide all cards
  elements.tableCreationCard.style.display = 'none';
  elements.joinTableCard.style.display = 'none';
  elements.settingsCard.style.display = 'none';
  elements.gameSection.style.display = 'none';
  
  // Show main menu
  elements.mainMenuCard.style.display = 'block';
  
  // Hide player status
  if (elements.playerStatus) {
    elements.playerStatus.style.display = 'none';
  }
}

async function handleCreateTable() {
  const tableName = elements.tableName.value.trim();
  const password = elements.tablePassword.value.trim();
  
  if (!tableName) {
    alert('Lütfen masa adı girin.');
    elements.tableName.focus();
    return;
  }
  
  if (!password) {
    alert('Lütfen şifre girin.');
    elements.tablePassword.focus();
    return;
  }
  
  try {
    // Use Firestore if available, otherwise localStorage
    const tableId = useFirestore ? 
      await fsCreateTable(tableName, password) : 
      createTable(tableName, password);
    
    // Set current table and player
    state.currentTable = tableId;
    state.currentPlayer = 0; // Host is player 0
    state.isTableHost = true;
    
    // Update player names from table
    const table = tables[tableId];
    state.settings.namesSolo4 = [
      table.players[0].name,
      table.players[1].name,
      table.players[2].name,
      table.players[3].name
    ];
    
    // Hide table creation, show game (but don't start yet)
    elements.tableCreationCard.style.display = 'none';
    elements.gameSection.style.display = 'block';
    
    // Show table info and player status
    showTableInfo(tableId);
    updatePlayerStatus();
    updatePlayerCounts();
    
    // DON'T start the game automatically - wait for 4 players
    state.gameStarted = false;
    
    saveState();
    
    alert(`Masa "${tableName}" oluşturuldu!\nMasa ID: ${tableId}\nDiğer oyuncular bu ID ile katılabilir.`);
    
    // Start Firestore listener if available
    if (useFirestore) {
      fsStartListener(tableId, handleTableUpdate);
    }
    
  } catch (error) {
    alert('Masa oluşturulurken hata: ' + error.message);
  }
}

async function handleJoinTable() {
  const tableId = elements.joinTableId.value.trim();
  const password = elements.joinTablePassword.value.trim();
  const playerNumber = parseInt(elements.playerNumber.value);
  
  if (!tableId) {
    alert('Lütfen masa ID\'sini girin.');
    elements.joinTableId.focus();
    return;
  }
  
  if (!password) {
    alert('Lütfen şifre girin.');
    elements.joinTablePassword.focus();
    return;
  }
  
  if (isNaN(playerNumber)) {
    alert('Lütfen oyuncu pozisyonu seçin.');
    elements.playerNumber.focus();
    return;
  }
  
  try {
    // Use Firestore if available, otherwise localStorage
    const table = useFirestore ? 
      await fsJoinTableById(tableId, playerNumber, password) : 
      joinTableById(tableId, playerNumber, password);
    
    // Set current table and player
    state.currentTable = tableId;
    state.currentPlayer = playerNumber;
    state.isTableHost = false;
    
    // Sync with table state
    syncWithTable();
    
    // Hide join table, show game
    elements.joinTableCard.style.display = 'none';
    elements.gameSection.style.display = 'block';
    
    // Show table info and player status
    showTableInfo(tableId);
    updatePlayerStatus();
    updatePlayerCounts();
    
    saveState();
    
    alert(`Masaya başarıyla katıldınız!\nMasa ID: ${tableId}`);
    
    // Start Firestore listener if available
    if (useFirestore) {
      fsStartListener(tableId, handleTableUpdate);
    }
    
  } catch (error) {
    alert('Masaya katılırken hata: ' + error.message);
  }
}

function showTableInfo(tableId) {
  if (elements.tableInfo && elements.currentTableId) {
    elements.tableInfo.style.display = 'block';
    elements.currentTableId.textContent = tableId;
    
    // Show start game button only for host
    if (state.isTableHost && elements.startTableGameBtn) {
      elements.startTableGameBtn.style.display = 'block';
    }
  }
}

function handleCopyTableId() {
  const tableId = elements.currentTableId.textContent;
  if (tableId && tableId !== '-') {
    navigator.clipboard.writeText(tableId).then(() => {
      // Visual feedback
      const originalText = elements.copyTableIdBtn.innerHTML;
      elements.copyTableIdBtn.innerHTML = '<span class="icon">✅</span> Kopyalandı';
      setTimeout(() => {
        elements.copyTableIdBtn.innerHTML = originalText;
      }, 2000);
    }).catch(() => {
      alert('Masa ID kopyalanamadı. Manuel olarak kopyalayın: ' + tableId);
    });
  }
}

function handleStartTableGame() {
  if (!state.currentTable || !state.isTableHost) {
    alert('Sadece masa sahibi oyunu başlatabilir.');
    return;
  }
  
  const table = tables[state.currentTable];
  if (!table) {
    alert('Masa bilgisi bulunamadı.');
    return;
  }
  
  const onlineCount = Object.values(table.players).filter(p => p.online).length;
  if (onlineCount < 4) {
    alert('Oyun başlaması için tüm oyuncular masaya bağlanmalı!\nŞu anda ' + onlineCount + '/4 oyuncu çevrimiçi.');
    return;
  }
  
  // Start the game
  state.gameStarted = true;
  state.startedAt = new Date().toISOString();
  state.rows = [{
    hand: 1,
    values: new Array(4).fill(null)
  }];
  
  renderTable();
  updateTotals();
  saveState();
  
  // Update table state
  const gameState = {
    settings: state.settings,
    rows: state.rows,
    penalties: state.penalties,
    startedAt: state.startedAt,
    gameStarted: state.gameStarted
  };
  
  if (useFirestore) {
    fsUpdateGameState(state.currentTable, gameState);
  } else {
    updateTableGameState(state.currentTable, gameState);
  }
  
  // Hide start button
  elements.startTableGameBtn.style.display = 'none';
  
  alert('Oyun başlatıldı! İyi oyunlar!');
  
  // Focus first input
  setTimeout(() => {
    const firstInput = elements.tableBody.querySelector('input[data-row="0"][data-col="0"]');
    if (firstInput) {
      firstInput.focus();
    }
  }, 100);
}

function handleTableUpdate(table) {
  // This is called by Firestore listener
  if (table && state.currentTable === table.id) {
    // Update local state
    if (table.gameState) {
      const tableState = table.gameState;
      state.settings = { ...tableState.settings };
      state.rows = [...tableState.rows];
      state.penalties = [...tableState.penalties];
      state.startedAt = tableState.startedAt;
      state.gameStarted = tableState.gameStarted;
      
      // Update UI
      if (state.gameStarted) {
        renderTable();
        updateTotals();
        updateMilestone();
        checkWinner();
      }
    }
    
    updatePlayerStatus();
    updatePlayerCounts();
    
    // Update start button visibility
    if (state.isTableHost && elements.startTableGameBtn) {
      const canStart = table.gameCanStart && !state.gameStarted;
      elements.startTableGameBtn.style.display = canStart ? 'block' : 'none';
    }
  }
}

// Initialize App
function initializeElements() {
  elements = {
    // Toolbar
    newGameBtn: document.getElementById('new-game-btn'),
    printBtn: document.getElementById('print-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    
    // Main content
    mainContent: document.querySelector('.main-content'),
    
    // Main Menu
    mainMenuCard: document.getElementById('main-menu-card'),
    createTableModeBtn: document.getElementById('create-table-mode-btn'),
    joinTableModeBtn: document.getElementById('join-table-mode-btn'),
    singlePlayerModeBtn: document.getElementById('single-player-mode-btn'),
    
    // Settings
    settingsCard: document.getElementById('settings-card'),
    targetSelect: document.getElementById('target-select'),
    startGameBtn: document.getElementById('start-game-btn'),
    demoBtn: document.getElementById('demo-btn'),
    backToMainFromSettingsBtn: document.getElementById('back-to-main-from-settings-btn'),
    
    // Table Creation
    tableCreationCard: document.getElementById('table-creation-card'),
    tableName: document.getElementById('table-name'),
    tablePassword: document.getElementById('table-password'),
    createTableBtn: document.getElementById('create-table-btn'),
    backToMainBtn: document.getElementById('back-to-main-btn'),
    
    // Join Table
    joinTableCard: document.getElementById('join-table-card'),
    joinTableId: document.getElementById('join-table-id'),
    joinTablePassword: document.getElementById('join-table-password'),
    playerNumber: document.getElementById('player-number'),
    joinTableConfirmBtn: document.getElementById('join-table-confirm-btn'),
    backToMainFromJoinBtn: document.getElementById('back-to-main-from-join-btn'),
    
    // Table Info
    tableInfo: document.getElementById('table-info'),
    currentTableId: document.getElementById('current-table-id'),
    copyTableIdBtn: document.getElementById('copy-table-id-btn'),
    startTableGameBtn: document.getElementById('start-table-game-btn'),
    
    // Player Status
    playerStatus: document.getElementById('player-status'),
    
    // Names
    namesSolo4: document.getElementById('names-solo4'),
    namesTeams: document.getElementById('names-teams'),
    
    nameS0: document.getElementById('name-s0'),
    nameS1: document.getElementById('name-s1'),
    nameS2: document.getElementById('name-s2'),
    nameS3: document.getElementById('name-s3'),
    nameTeamA: document.getElementById('name-teamA'),
    nameTeamB: document.getElementById('name-teamB'),
    
    // Game
    gameSection: document.getElementById('game-section'),
    undoBtn: document.getElementById('undo-btn'),
    addHandBtn: document.getElementById('add-hand-btn'),
    
    // Table
    scoreTable: document.getElementById('score-table'),
    tableHead: document.getElementById('table-head'),
    tableBody: document.getElementById('table-body'),
    totalsContent: document.getElementById('totals-content'),
    
    // Milestone
    milestoneBanner: document.getElementById('milestone-banner'),
    milestoneScores: document.getElementById('milestone-scores'),
    
    // Winner
    winnerBanner: document.getElementById('winner-banner'),
    winnerText: document.getElementById('winner-text'),
    
    // Penalty Modal
    penaltyModal: document.getElementById('penalty-modal'),
    penaltyModalTitle: document.getElementById('penalty-modal-title'),
    penaltyModalClose: document.getElementById('penalty-modal-close'),
    penaltyValue: document.getElementById('penalty-value'),
    penaltyNote: document.getElementById('penalty-note'),
    penaltyAddBtn: document.getElementById('penalty-add-btn'),
    penaltyCancelBtn: document.getElementById('penalty-cancel-btn'),
    penaltyItems: document.getElementById('penalty-items')
  };
}

function initializeEventListeners() {
  // Toolbar
  elements.newGameBtn.addEventListener('click', handleNewGame);
  elements.printBtn.addEventListener('click', handlePrint);
  elements.themeToggle.addEventListener('click', handleThemeToggle);
  
  // Main Menu
  elements.createTableModeBtn.addEventListener('click', handleCreateTableMode);
  elements.joinTableModeBtn.addEventListener('click', handleJoinTableMode);
  elements.singlePlayerModeBtn.addEventListener('click', handleSinglePlayerMode);
  
  // Settings
  elements.startGameBtn.addEventListener('click', handleStartGame);
  elements.demoBtn.addEventListener('click', handleDemo);
  elements.backToMainFromSettingsBtn.addEventListener('click', handleBackToMainMenu);
  
  // Table Creation
  elements.createTableBtn.addEventListener('click', handleCreateTable);
  elements.backToMainBtn.addEventListener('click', handleBackToMainMenu);
  
  // Join Table
  elements.joinTableConfirmBtn.addEventListener('click', handleJoinTable);
  elements.backToMainFromJoinBtn.addEventListener('click', handleBackToMainMenu);
  
  // Table Info
  elements.copyTableIdBtn.addEventListener('click', handleCopyTableId);
  elements.startTableGameBtn.addEventListener('click', handleStartTableGame);
  
  // Mode change
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', updateModeVisibility);
  });
  
  // Game
  elements.undoBtn.addEventListener('click', handleUndo);
  elements.addHandBtn.addEventListener('click', handleAddHand);
  
  // Penalty Modal
  elements.penaltyModalClose.addEventListener('click', closePenaltyModal);
  elements.penaltyCancelBtn.addEventListener('click', closePenaltyModal);
  elements.penaltyAddBtn.addEventListener('click', addPenalty);
  
  // Quick penalty buttons
  document.querySelectorAll('.penalty-quick-btn').forEach(btn => {
    btn.addEventListener('click', handlePenaltyQuickBtn);
  });
  
  // Modal overlay click
  elements.penaltyModal.addEventListener('click', (event) => {
    if (event.target === elements.penaltyModal) {
      closePenaltyModal();
    }
  });
  
  // Winner banner click
  elements.winnerBanner.addEventListener('click', (event) => {
    if (event.target === elements.winnerBanner) {
      elements.winnerBanner.style.display = 'none';
    }
  });
  
  // Penalty value enter key
  elements.penaltyValue.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addPenalty();
    }
  });
  
  // ESC key handling
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (elements.penaltyModal.style.display === 'flex') {
        closePenaltyModal();
      } else if (elements.winnerBanner.style.display === 'flex') {
        elements.winnerBanner.style.display = 'none';
      }
    }
  });
  
  // Table update listener
  window.addEventListener('tableUpdate', (event) => {
    if (state.currentTable && event.detail.tableId === state.currentTable) {
      // Don't sync if we just triggered this update
      const timeDiff = Date.now() - event.detail.timestamp;
      if (timeDiff > 100) { // Only sync if update is older than 100ms
        syncWithTable();
      }
    }
  });
}

function initialize() {
  // Initialize Firebase first
  initializeFirebase();
  
  initializeElements();
  initializeEventListeners();
  
  // Load saved state and tables
  loadState();
  loadTables();
  
  // Update UI
  updateTheme();
  populateSettingsForm();
  updatePlayerCounts();
  
  // Show appropriate section
  if (state.gameStarted) {
    elements.mainMenuCard.style.display = 'none';
    elements.settingsCard.style.display = 'none';
    elements.tableCreationCard.style.display = 'none';
    elements.joinTableCard.style.display = 'none';
    elements.gameSection.style.display = 'block';
    
    renderTable();
    updateTotals();
    updateMilestone();
    checkWinner();
    
    // Update player status if in table mode
    if (state.currentTable) {
      showTableInfo(state.currentTable);
      updatePlayerStatus();
      
      // Start Firestore listener if available
      if (useFirestore) {
        fsStartListener(state.currentTable, handleTableUpdate);
      }
    }
  } else {
    // Handle AUTO_NAV
    if (AUTO_NAV === 'join') {
      handleJoinTableMode();
    } else if (AUTO_NAV === 'create') {
      handleCreateTableMode();
    } else if (AUTO_NAV === 'single') {
      handleSinglePlayerMode();
    } else {
      // Show main menu by default
      elements.mainMenuCard.style.display = 'block';
      elements.settingsCard.style.display = 'none';
      elements.gameSection.style.display = 'none';
      elements.tableCreationCard.style.display = 'none';
      elements.joinTableCard.style.display = 'none';
    }
  }
  
  console.log('Okey Adisyon v2.0 başlatıldı! Firebase:', useFirestore ? 'Aktif' : 'LocalStorage');
}

// Start the app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}