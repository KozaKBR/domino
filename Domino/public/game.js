// Conexão com o servidor
const socket = io();

// Elementos DOM - Telas
const welcomeScreen = document.getElementById('welcome-screen');
const joinRoomScreen = document.getElementById('join-room-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

// Elementos DOM - Tela de Boas-vindas
const playerNameInput = document.getElementById('player-name');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

// Elementos DOM - Tela de Entrar em Sala
const roomIdInput = document.getElementById('room-id-input');
const confirmJoinBtn = document.getElementById('confirm-join-btn');
const backToWelcomeBtn = document.getElementById('back-to-welcome-btn');

// Elementos DOM - Tela de Lobby
const roomIdDisplay = document.getElementById('room-id-display');
const playerList = document.getElementById('player-list');
const readyBtn = document.getElementById('ready-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// Elementos DOM - Tela de Jogo
const scoreBoard = document.getElementById('score-board');
const gameBoard = document.getElementById('game-board');
const messageArea = document.getElementById('message');
const predictionContainer = document.getElementById('prediction-container');
const predictionInput = document.getElementById('prediction');
const callGaloCheckbox = document.getElementById('call-galo');
const confirmPredictionBtn = document.getElementById('confirm-prediction');
const playerHand = document.getElementById('player-hand');

// Estado do jogo
let gameState = {
    playerId: null,
    roomId: null,
    isReady: false,
    players: [],
    myHand: [],
    currentPlayer: 0,
    board: [],
    leftEnd: null,
    rightEnd: null
};

// Funções de navegação entre telas
function showScreen(screenId) {
    // Esconder todas as telas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Mostrar a tela desejada
    document.getElementById(screenId).classList.add('active');
}

// Eventos - Tela de Boas-vindas
createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    
    if (!playerName) {
        showMessage('Por favor, digite seu nome.');
        return;
    }
    
    socket.emit('createRoom', playerName);
});

joinRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    
    if (!playerName) {
        showMessage('Por favor, digite seu nome.');
        return;
    }
    
    showScreen('join-room-screen');
});

// Eventos - Tela de Entrar em Sala
confirmJoinBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    const playerName = playerNameInput.value.trim();
    
    if (!roomId) {
        showMessage('Por favor, digite o código da sala.');
        return;
    }
    
    socket.emit('joinRoom', { roomId, playerName });
});

backToWelcomeBtn.addEventListener('click', () => {
    showScreen('welcome-screen');
});

// Eventos - Tela de Lobby
readyBtn.addEventListener('click', () => {
    gameState.isReady = !gameState.isReady;
    
    if (gameState.isReady) {
        readyBtn.textContent = 'Cancelar Pronto';
    } else {
        readyBtn.textContent = 'Estou Pronto';
    }
    
    socket.emit('playerReady', gameState.isReady);
});

leaveRoomBtn.addEventListener('click', () => {
    location.reload(); // Simples: recarregar a página
});

// Eventos - Tela de Jogo
confirmPredictionBtn.addEventListener('click', () => {
    const prediction = parseInt(predictionInput.value);
    const callGalo = callGaloCheckbox.checked;
    
    // Verificar se a previsão é um múltiplo de 5
    if (isNaN(prediction) || prediction < 0 || prediction > 100 || prediction % 5 !== 0) {
        showMessage('Por favor, insira um número válido que seja múltiplo de 5 (0, 5, 10, 15, etc.).');
        return;
    }
    
    socket.emit('setPrediction', { prediction, callGalo });
    predictionContainer.style.display = 'none';
    
    if (callGalo) {
        showMessage('Você chamou GALO! Precisa bloquear todos os adversários!', true);
    }
});

// Funções do jogo
function renderPlayerHand() {
    playerHand.innerHTML = '';
    
    gameState.myHand.forEach((domino, index) => {
        const dominoElement = createDominoElement(domino, index);
        
        // Se for uma peça escondida, não adicionar evento de clique
        if (!domino.hidden) {
            dominoElement.addEventListener('click', () => {
                if (isMyTurn() && !gameState.waitingForPrediction) {
                    playDomino(index);
                }
            });
        }
        
        playerHand.appendChild(dominoElement);
    });
}

function renderBoard() {
    gameBoard.innerHTML = '';
    
    gameState.board.forEach(domino => {
        const dominoElement = createDominoElement(domino);
        gameBoard.appendChild(dominoElement);
    });
}

function createDominoElement(domino, index) {
    const dominoElement = document.createElement('div');
    dominoElement.className = 'domino';
    
    // Se for uma peça escondida (mão dos outros jogadores)
    if (domino.hidden) {
        dominoElement.style.backgroundColor = '#aaa';
        dominoElement.style.cursor = 'default';
        return dominoElement;
    }
    
    const leftHalf = document.createElement('div');
    leftHalf.className = 'domino-half';
    leftHalf.textContent = domino.left;
    
    const rightHalf = document.createElement('div');
    rightHalf.className = 'domino-half';
    rightHalf.textContent = domino.right;
    
    dominoElement.appendChild(leftHalf);
    dominoElement.appendChild(rightHalf);
    
    return dominoElement;
}

function updatePlayerList() {
    playerList.innerHTML = '';
    
    gameState.players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const playerName = document.createElement('span');
        playerName.textContent = player.name;
        
        const playerStatus = document.createElement('span');
        if (player.ready) {
            playerStatus.textContent = '✅ Pronto';
            playerStatus.className = 'player-ready';
        } else {
            playerStatus.textContent = '⏳ Aguardando';
            playerStatus.className = 'player-not-ready';
        }
        
        playerItem.appendChild(playerName);
        playerItem.appendChild(playerStatus);
        playerList.appendChild(playerItem);
    });
}

function updateScoreBoard() {
    if (!gameState.players) return;
    
    scoreBoard.innerHTML = '';
    
    // Calcular pontuações das equipes
    const teamScores = [0, 0];
    for (let i = 0; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        const team = player.team;
        if (team !== undefined) {
            teamScores[team] += player.score || 0;
        }
    }
    
    // Adicionar placar por equipe
    for (let t = 0; t < 2; t++) {
        const teamScore = document.createElement('div');
        teamScore.className = 'team-score';
        teamScore.innerHTML = `<div class="team-indicator team-${t}"></div> Equipe ${t+1}: ${teamScores[t]} pontos`;
        scoreBoard.appendChild(teamScore);
    }
    
    // Adicionar placar individual
    for (let i = 0; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        const playerScore = document.createElement('div');
        playerScore.className = 'player-score';
        
        if (i === gameState.currentPlayer) {
            playerScore.classList.add('active-player');
        }
        
        playerScore.textContent = `${player.name}: ${player.score || 0}`;
        
        // Adicionar indicador de equipe se disponível
        if (player.team !== undefined) {
            playerScore.style.borderLeft = `5px solid ${player.team === 0 ? '#2980b9' : '#c0392b'}`;
        }
        
        scoreBoard.appendChild(playerScore);
    }
}

function showMessage(message, isSpecial = false) {
    messageArea.textContent = message;
    
    if (isSpecial) {
        messageArea.classList.add('special-event');
        setTimeout(() => {
            messageArea.classList.remove('special-event');
        }, 3000);
    }
}

function playDomino(index) {
    socket.emit('playDomino', { dominoIndex: index });
}

function isMyTurn() {
    return gameState.currentPlayer !== undefined && 
           gameState.players[gameState.currentPlayer] && 
           gameState.players[gameState.currentPlayer].id === gameState.playerId;
}

// Eventos Socket.io
socket.on('connect', () => {
    console.log('Conectado ao servidor: ' + socket.id);
});

socket.on('disconnect', () => {
    console.log('Desconectado do servidor');
    showMessage('Conexão perdida. Recarregue a página para reconectar.');
});

socket.on('roomCreated', (data) => {
    gameState.roomId = data.roomId;
    gameState.playerId = data.playerId;
    
    roomIdDisplay.textContent = data.roomId;
    showScreen('lobby-screen');
});

socket.on('roomJoined', (data) => {
    gameState.roomId = data.roomId;
    gameState.playerId = data.playerId;
    
    roomIdDisplay.textContent = data.roomId;
    showScreen('lobby-screen');
});

socket.on('updatePlayers', (players) => {
    gameState.players = players;
    updatePlayerList();
});

socket.on('gameStarted', (data) => {
    gameState = { ...gameState, ...data };
    
    // Encontrar minha mão
    const playerIndex = gameState.players.findIndex(p => p.id === gameState.playerId);
    if (playerIndex !== -1) {
        gameState.myHand = gameState.players[playerIndex].hand;
    }
    
    renderPlayerHand();
    renderBoard();
    updateScoreBoard();
    
    showScreen('game-screen');
    predictionContainer.style.display = 'none';
});

socket.on('updateGameState', (data) => {
    gameState = { ...gameState, ...data };
    
    // Encontrar minha mão
    const playerIndex = gameState.players.findIndex(p => p.id === gameState.playerId);
    if (playerIndex !== -1) {
        gameState.myHand = gameState.players[playerIndex].hand;
    }
    
    renderPlayerHand();
    renderBoard();
    updateScoreBoard();
});

socket.on('requestPrediction', () => {
    predictionContainer.style.display = 'flex';
    predictionInput.value = '0';
    callGaloCheckbox.checked = false;
    gameState.waitingForPrediction = true;
});

socket.on('message', (message, isSpecial) => {
    showMessage(message, isSpecial);
});

socket.on('error', (message) => {
    showMessage(message);
});

socket.on('gameEnded', (data) => {
    showMessage(`${data.winnerNames} venceu o jogo!`, true);
    setTimeout(() => {
        showScreen('lobby-screen');
    }, 5000);
});

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    showScreen('welcome-screen');
});
