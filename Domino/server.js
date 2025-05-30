const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Inicializar app e servidor
const app = express();
const server = http.createServer(app);

// Configuração do Socket.io com CORS adequado para Railway
const io = socketIO(server, {
  cors: {
    origin: "*", // Em produção, restrinja para o domínio específico
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Configuração para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota padrão
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Usar a porta fornecida pelo Railway
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ====== CONFIGURAÇÕES DO SOCKET.IO ======

// Rastreamento de salas e jogadores
const rooms = {};
const players = {};

// Gerenciamento de conexões
io.on('connection', (socket) => {
  console.log(`Novo jogador conectado: ${socket.id}`);
  
  // Criar uma nova sala
  socket.on('createRoom', (playerName) => {
    const roomId = generateRoomId();
    
    // Criar a sala
    rooms[roomId] = {
      id: roomId,
      players: [{id: socket.id, name: playerName, ready: false}],
      gameState: null,
      started: false
    };
    
    // Associar jogador à sala
    players[socket.id] = {
      roomId: roomId,
      name: playerName
    };
    
    // Entrar na sala
    socket.join(roomId);
    
    // Enviar ID da sala para o cliente
    socket.emit('roomCreated', { roomId, playerId: socket.id });
    
    // Atualizar lista de jogadores
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });
  
  // Entrar em uma sala existente
  socket.on('joinRoom', (data) => {
    const { roomId, playerName } = data;
    
    // Verificar se a sala existe
    if (!rooms[roomId]) {
      socket.emit('error', 'Sala não encontrada!');
      return;
    }
    
    // Verificar se a sala já está cheia (4 jogadores)
    if (rooms[roomId].players.length >= 4) {
      socket.emit('error', 'Sala cheia!');
      return;
    }
    
    // Verificar se o jogo já começou
    if (rooms[roomId].started) {
      socket.emit('error', 'O jogo já começou!');
      return;
    }
    
    // Adicionar jogador à sala
    rooms[roomId].players.push({
      id: socket.id,
      name: playerName,
      ready: false
    });
    
    // Associar jogador à sala
    players[socket.id] = {
      roomId: roomId,
      name: playerName
    };
    
    // Entrar na sala
    socket.join(roomId);
    
    // Confirmar entrada na sala
    socket.emit('roomJoined', { roomId, playerId: socket.id });
    
    // Atualizar lista de jogadores para todos
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });
  
  // Jogador está pronto
  socket.on('playerReady', (ready) => {
    const roomId = players[socket.id]?.roomId;
    
    if (!roomId || !rooms[roomId]) return;
    
    // Atualizar status de pronto
    const player = rooms[roomId].players.find(p => p.id === socket.id);
    if (player) {
      player.ready = ready;
    }
    
    // Atualizar lista de jogadores
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    
    // Verificar se todos estão prontos para começar
    const allReady = rooms[roomId].players.length >= 2 && 
                     rooms[roomId].players.every(p => p.ready);
    
    if (allReady && !rooms[roomId].started) {
      startGame(roomId);
    }
  });
  
  // Jogador realiza uma jogada
  socket.on('playDomino', (data) => {
    const { dominoIndex } = data;
    const roomId = players[socket.id]?.roomId;
    
    if (!roomId || !rooms[roomId] || !rooms[roomId].gameState) return;
    
    const gameState = rooms[roomId].gameState;
    
    // Verificar se é a vez do jogador
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    
    if (playerIndex !== gameState.currentPlayer) {
      socket.emit('error', 'Não é sua vez!');
      return;
    }
    
    // Jogar a peça
    playDomino(roomId, playerIndex, dominoIndex);
  });
  
  // Jogador define sua previsão de pontos
  socket.on('setPrediction', (data) => {
    const { prediction, callGalo } = data;
    const roomId = players[socket.id]?.roomId;
    
    if (!roomId || !rooms[roomId] || !rooms[roomId].gameState) return;
    
    const gameState = rooms[roomId].gameState;
    
    // Verificar se é a vez do jogador
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    
    if (playerIndex !== gameState.currentPlayer) {
      socket.emit('error', 'Não é sua vez!');
      return;
    }
    
    // Verificar se a previsão é um múltiplo de 5
    if (prediction % 5 !== 0) {
      socket.emit('error', 'A previsão deve ser um múltiplo de 5!');
      return;
    }
    
    // Definir previsão
    gameState.players[playerIndex].prediction = prediction;
    gameState.waitingForPrediction = false;
    
    // Registrar chamada de GALO
    if (callGalo) {
      gameState.players[playerIndex].calledGalo = true;
      io.to(roomId).emit('message', `${gameState.players[playerIndex].name} ANUNCIOU GALO! Precisa bloquear todos os adversários!`, true);
    }
    
    // Notificar todos os jogadores
    io.to(roomId).emit('updateGameState', filterGameStateForPlayers(gameState));
    io.to(roomId).emit('message', `${gameState.players[playerIndex].name} prevê que vai fazer ${prediction} pontos!`);
  });
  
  // Desconexão
  socket.on('disconnect', () => {
    const roomId = players[socket.id]?.roomId;
    
    if (roomId && rooms[roomId]) {
      // Remover jogador da sala
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      
      // Se a sala ficou vazia, remover a sala
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
      } else {
        // Atualizar lista de jogadores
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        
        // Se o jogo já tinha começado, notificar sobre jogador desconectado
        if (rooms[roomId].started) {
          io.to(roomId).emit('message', `${players[socket.id].name} desconectou-se!`);
          
          // Verificar se o jogo precisa ser interrompido
          if (rooms[roomId].players.length < 2) {
            io.to(roomId).emit('message', 'Poucos jogadores! O jogo foi interrompido.');
            rooms[roomId].started = false;
            rooms[roomId].gameState = null;
          }
        }
      }
    }
    
    // Remover associação do jogador
    delete players[socket.id];
  });
});

// Iniciar o jogo
function startGame(roomId) {
  if (!rooms[roomId]) return;
  
  rooms[roomId].started = true;
  
  // Inicializar estado do jogo
  const gameState = {
    players: rooms[roomId].players.map(p => ({
      id: p.id,
      name: p.name,
      hand: [],
      score: 0,
      prediction: 0,
      moves: 0,
      blocked: false,
      calledGalo: false, // Flag para acompanhar quem chamou GALO
      team: 0 // Equipe do jogador (0 ou 1)
    })),
    dominoes: [],
    currentPlayer: 0,
    board: [],
    leftEnd: null,
    rightEnd: null,
    passCount: 0,
    roundEnded: false,
    waitingForPrediction: true,
    waitingForGalo: false, // Estado para verificar se está esperando chamada de GALO
    teams: [
      { score: 0, players: [] }, // Equipe 0
      { score: 0, players: [] }  // Equipe 1
    ]
  };
  
  // Definir equipes (jogadores 0,2 = equipe 0, jogadores 1,3 = equipe 1)
  for (let i = 0; i < gameState.players.length; i++) {
    const team = i % 2; // Jogadores 0,2 = equipe 0, jogadores 1,3 = equipe 1
    gameState.players[i].team = team;
    gameState.teams[team].players.push(i);
  }
  
  rooms[roomId].gameState = gameState;
  
  // Distribuir peças
  dealDominoes(gameState);
  
  // Enviar estado do jogo para todos os jogadores
  for (let i = 0; i < gameState.players.length; i++) {
    const playerGameState = filterGameStateForPlayer(gameState, i);
    io.to(gameState.players[i].id).emit('gameStarted', playerGameState);
  }
  
  // Notificar o primeiro jogador para fazer sua previsão
  io.to(gameState.players[0].id).emit('requestPrediction');
  io.to(roomId).emit('message', `O jogo começou! ${gameState.players[0].name}, faça sua previsão de pontos.`);
}

// Distribuir peças
function dealDominoes(gameState) {
  // Criar peças de dominó (0-6)
  const dominoes = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      dominoes.push({ left: i, right: j, isDouble: i === j });
    }
  }
  
  // Embaralhar
  for (let i = dominoes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dominoes[i], dominoes[j]] = [dominoes[j], dominoes[i]];
  }
  
  gameState.dominoes = dominoes;
  
  // Distribuir 7 peças para cada jogador
  for (let i = 0; i < gameState.players.length; i++) {
    gameState.players[i].hand = gameState.dominoes.splice(0, 7);
  }
}

// Jogar uma peça
function playDomino(roomId, playerIndex, dominoIndex) {
  const gameState = rooms[roomId].gameState;
  const player = gameState.players[playerIndex];
  const domino = player.hand[dominoIndex];
  
  // Verificar se a peça pode ser jogada
  if (!canPlayDomino(gameState, domino)) {
    io.to(player.id).emit('error', 'Esta peça não pode ser jogada agora!');
    return;
  }
  
  // Remover a peça da mão
  player.hand.splice(dominoIndex, 1);
  player.moves++;
  
  // Adicionar a peça ao tabuleiro
  if (gameState.board.length === 0) {
    // Primeira peça do jogo
    gameState.board.push(domino);
    gameState.leftEnd = domino.left;
    gameState.rightEnd = domino.right;
  } else {
    // Adicionar à esquerda ou direita do tabuleiro
    if (domino.right === gameState.leftEnd) {
      gameState.board.unshift(domino);
      gameState.leftEnd = domino.left;
    } else if (domino.left === gameState.leftEnd) {
      const rotatedDomino = { left: domino.right, right: domino.left, isDouble: domino.isDouble };
      gameState.board.unshift(rotatedDomino);
      gameState.leftEnd = rotatedDomino.left;
    } else if (domino.left === gameState.rightEnd) {
      gameState.board.push(domino);
      gameState.rightEnd = domino.right;
    } else if (domino.right === gameState.rightEnd) {
      const rotatedDomino = { left: domino.right, right: domino.left, isDouble: domino.isDouble };
      gameState.board.push(rotatedDomino);
      gameState.rightEnd = rotatedDomino.right;
    }
  }
  
  // Verificar fim da rodada
  if (player.hand.length === 0) {
    endRound(roomId);
    return;
  }
  
  // Verificar pontuação especial: bateu com carroça
  if (domino.isDouble && player.hand.length === 0) {
    player.score += 20;
    io.to(roomId).emit('message', `${player.name} bateu com carroça! +20 pontos!`, true);
  }
  
  // Verificar se o próximo jogador está bloqueado
  const nextPlayerIndex = (playerIndex + 1) % gameState.players.length;
  const nextPlayer = gameState.players[nextPlayerIndex];
  let canPlay = false;
  
  for (const playerDomino of nextPlayer.hand) {
    if (canPlayDomino(gameState, playerDomino)) {
      canPlay = true;
      break;
    }
  }
  
  if (!canPlay) {
    nextPlayer.blocked = true;
    player.score += 20;
    io.to(roomId).emit('message', `${player.name} bloqueou o próximo jogador! +20 pontos!`, true);
    
    // Verificar se bloqueou todos os outros jogadores (regra do GALO)
    const blockedCount = countBlockedPlayers(gameState, playerIndex);
    if (blockedCount === gameState.players.length - 1) {
      // Verificar se o jogador avisou GALO
      if (player.calledGalo) {
        player.score += 50;
        io.to(roomId).emit('message', `${player.name} bloqueou todos os outros jogadores e avisou GALO! +50 pontos!`, true);
      } else {
        // Não avisou GALO, não ganha os 50 pontos
        io.to(roomId).emit('message', `${player.name} bloqueou todos os outros jogadores mas não avisou GALO! Não ganha pontos extras.`, true);
      }
    } else if (player.calledGalo && blockedCount < gameState.players.length - 1) {
      // GALO CHOCO - chamou GALO mas não conseguiu bloquear todos
      // Determinar equipe adversária
      const opposingTeam = player.team === 0 ? 1 : 0;
      
      // Adicionar 50 pontos para a equipe adversária (dividido entre os jogadores)
      const pointsPerPlayer = 50 / gameState.teams[opposingTeam].players.length;
      
      for (const playerIndex of gameState.teams[opposingTeam].players) {
        gameState.players[playerIndex].score += pointsPerPlayer;
      }
      
      io.to(roomId).emit('message', `GALO CHOCO! ${player.name} avisou GALO mas não conseguiu bloquear todos. Equipe adversária ganha 50 pontos!`, true);
    }
  }
  
  // Atualizar estado do jogo para todos
  for (let i = 0; i < gameState.players.length; i++) {
    const playerGameState = filterGameStateForPlayer(gameState, i);
    io.to(gameState.players[i].id).emit('updateGameState', playerGameState);
  }
  
  // Próximo turno
  nextTurn(roomId);
}

// Verificar se uma peça pode ser jogada
function canPlayDomino(gameState, domino) {
  if (gameState.board.length === 0) return true;
  
  return domino.left === gameState.leftEnd || 
         domino.right === gameState.leftEnd || 
         domino.left === gameState.rightEnd || 
         domino.right === gameState.rightEnd;
}

// Contar quantos jogadores estão bloqueados após o jogador atual
function countBlockedPlayers(gameState, playerIndex) {
  let blockedCount = 0;
  
  for (let i = 0; i < gameState.players.length; i++) {
    if (i !== playerIndex && gameState.players[i].blocked) {
      blockedCount++;
    }
  }
  
  return blockedCount;
}

// Próximo turno
function nextTurn(roomId) {
  const gameState = rooms[roomId].gameState;
  gameState.passCount = 0;
  
  do {
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
  } while (gameState.players[gameState.currentPlayer].blocked && 
           !allPlayersBlocked(gameState));
  
  if (allPlayersBlocked(gameState)) {
    endRound(roomId);
    return;
  }
  
  // Solicitar previsão do jogador atual
  gameState.waitingForPrediction = true;
  const currentPlayer = gameState.players[gameState.currentPlayer];
  
  io.to(currentPlayer.id).emit('requestPrediction');
  io.to(roomId).emit('message', `Vez de ${currentPlayer.name}! Esperando previsão de pontos...`);
  
  // Atualizar estado do jogo para todos
  for (let i = 0; i < gameState.players.length; i++) {
    const playerGameState = filterGameStateForPlayer(gameState, i);
    io.to(gameState.players[i].id).emit('updateGameState', playerGameState);
  }
}

// Verificar se todos os jogadores estão bloqueados
function allPlayersBlocked(gameState) {
  let countBlocked = 0;
  for (let i = 0; i < gameState.players.length; i++) {
    if (gameState.players[i].blocked) countBlocked++;
  }
  return countBlocked === gameState.players.length;
}

// Fim da rodada
function endRound(roomId) {
  const gameState = rooms[roomId].gameState;
  gameState.roundEnded = true;
  
  // Contabilizar pontuação com base nas previsões
  for (let i = 0; i < gameState.players.length; i++) {
    const player = gameState.players[i];
    if (player.moves >= player.prediction) {
      player.score += player.prediction;
      io.to(roomId).emit('message', `${player.name} fez ${player.moves} jogadas (previsão: ${player.prediction})! +${player.prediction} pontos!`);
    } else {
      io.to(roomId).emit('message', `${player.name} fez apenas ${player.moves} jogadas (previsão: ${player.prediction})! Sem pontos adicionais.`);
    }
  }
  
  // Verificar fim do jogo após terminada a rodada
  const maxScore = 200; // Pontuação máxima para vencer o jogo
  
  // Verificar se alguma equipe ultrapassou a pontuação máxima
  let teamScores = [0, 0];
  for (let t = 0; t < 2; t++) {
    for (const playerIndex of gameState.teams[t].players) {
      teamScores[t] += gameState.players[playerIndex].score;
    }
  }
  
  // Encontrar equipe vencedora (aquela com maior pontuação, desde que acima da máxima)
  let winningTeam = -1;
  if (Math.max(...teamScores) >= maxScore) {
    winningTeam = teamScores[0] > teamScores[1] ? 0 : 1;
    
    // Formar mensagem com nomes dos jogadores da equipe vencedora
    const winnerNames = gameState.teams[winningTeam].players
      .map(idx => gameState.players[idx].name)
      .join(' e ');
    
    io.to(roomId).emit('message', `A Equipe ${winningTeam+1} (${winnerNames}) venceu o jogo com ${teamScores[winningTeam]} pontos!`, true);
    io.to(roomId).emit('gameEnded', { 
      winningTeam: winningTeam,
      winnerNames: winnerNames,
      totalScore: teamScores[winningTeam]
    });
    
    // Resetar jogo
    rooms[roomId].started = false;
    rooms[roomId].gameState = null;
  } else {
    io.to(roomId).emit('message', "Fim da rodada! Preparando nova rodada...");
    
    // Iniciar nova rodada após 3 segundos
    setTimeout(() => {
      startNewRound(roomId);
    }, 3000);
  }
}

// Iniciar nova rodada
function startNewRound(roomId) {
  const gameState = rooms[roomId].gameState;
  
  // Manter pontuação dos jogadores
  const scores = gameState.players.map(p => p.score);
  
  // Resetar estado da rodada
  gameState.board = [];
  gameState.leftEnd = null;
  gameState.rightEnd = null;
  gameState.passCount = 0;
  gameState.roundEnded = false;
  gameState.waitingForPrediction = true;
  gameState.waitingForGalo = false;
  
  for (let i = 0; i < gameState.players.length; i++) {
    const player = gameState.players[i];
    player.hand = [];
    player.prediction = 0;
    player.moves = 0;
    player.blocked = false;
    player.calledGalo = false; // Resetar chamada de GALO
    player.score = scores[i]; // Manter pontuação
  }
  
  // Distribuir novas peças
  dealDominoes(gameState);
  
  // Primeiro jogador da nova rodada
  gameState.currentPlayer = 0;
  
  // Enviar estado do jogo para todos
  for (let i = 0; i < gameState.players.length; i++) {
    const playerGameState = filterGameStateForPlayer(gameState, i);
    io.to(gameState.players[i].id).emit('updateGameState', playerGameState);
  }
  
  // Solicitar previsão do primeiro jogador
  io.to(gameState.players[0].id).emit('requestPrediction');
  io.to(roomId).emit('message', `Nova rodada! ${gameState.players[0].name}, faça sua previsão de pontos.`);
}

// Filtrar estado do jogo para um jogador específico
function filterGameStateForPlayer(gameState, playerIndex) {
  const filteredState = JSON.parse(JSON.stringify(gameState));
  
  // Remover as mãos dos outros jogadores (privacidade)
  for (let i = 0; i < filteredState.players.length; i++) {
    if (i !== playerIndex) {
      filteredState.players[i].hand = filteredState.players[i].hand.map(() => ({ hidden: true }));
    }
  }
  
  return filteredState;
}

// Filtrar estado do jogo para todos os jogadores
function filterGameStateForPlayers(gameState) {
  const filteredState = JSON.parse(JSON.stringify(gameState));
  
  // Remover todas as mãos (para informações públicas)
  for (let i = 0; i < filteredState.players.length; i++) {
    filteredState.players[i].hand = filteredState.players[i].hand.map(() => ({ hidden: true }));
  }
  
  return filteredState;
}

// Gerar ID de sala aleatório
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}