# Dominó Manauara

Jogo de dominó multiplayer online com regras especiais de Manaus, desenvolvido com Node.js e Socket.io.

## Regras especiais

Este jogo de dominó segue as regras tradicionais, mas com algumas particularidades da região de Manaus:

1. **Sistema de pontuação**: A pontuação é calculada somando os valores das pontas das peças no tabuleiro. Porém, apenas pontuações que são múltiplos de 5 contam como válidas. Além disso, para que os pontos sejam válidos, o jogador precisa anunciar quantos pontos vai fazer antes de jogar.
2. **Pontos extras**:
   - Bloquear o próximo adversário: +20 pontos
   - Bater com uma carroça (peça com números iguais): +20 pontos
3. **Regra do GALO**:
   - Se o jogador achar que vai bloquear todos os outros, pode "chamar GALO"
   - Se chamar GALO e conseguir bloquear todos: +50 pontos
   - Se chamar GALO e não conseguir (GALO CHOCO): a equipe adversária ganha 50 pontos

## Características

- Jogo multiplayer em tempo real
- Sistema de salas para partidas privadas
- Interface gráfica amigável
- Suporte para partidas em duplas (2 equipes)
- Pontuação máxima de 200 pontos

## Tecnologias utilizadas

- Node.js
- Express
- Socket.io
- JavaScript vanilla (front-end)

## Instalação

1. Clone o repositório:
```
git clone https://github.com/seu-usuario/domino-manauara.git
cd domino-manauara
```

2. Instale as dependências:
```
npm install
```

3. Inicie o servidor de desenvolvimento:
```
npm run dev
```

4. Acesse o jogo em `http://localhost:3000`

## Deploy

Este jogo está configurado para fácil deploy no Railway:

1. Crie uma conta no [Railway](https://railway.app)
2. Conecte seu repositório GitHub
3. Selecione o repositório e clique em "Deploy"

## Como jogar

1. Crie uma sala ou entre em uma sala existente usando o código
2. Aguarde que todos os jogadores estejam prontos
3. Anuncie quantos pontos vai fazer e se vai "chamar GALO"
4. Jogue suas peças estrategicamente para alcançar sua meta e bloquear os adversários
5. A primeira equipe a atingir 200 pontos ganha, mas a rodada precisa ser finalizada

## Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.

## Licença

[MIT](LICENSE)
