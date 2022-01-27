import PlayerModel from './PlayerModel';

export default class GameManager {
    constructor(io) {
        this.io = io;
        this.spawners = {};
        this.chests = {};
        this.monsters = {};
        this.players = {};

        this.playerLocations = [[50,50], [100, 100]];
        this.chestLocations = {};
        this.monsterLocations = {};
    }

    setup() {
        this.parseMapData();
        this.setupEventListener();
        this.setupSpawners();
    }

    parseMapData() {}

    setupEventListener() {
        this.io.on('connection', socket => {
            // player disconnected
            socket.on('disconnect', () => {
                // delete user data from the server
                delete this.players[socket.id];

                // emit to all players that the player has left
                this.io.emit('disconnected', socket.id);
            });

            socket.on('newPlayer', (data) => {
                // create a new player
                this.spawnPlayer(socket.id);
                
                // send the players data to the new player
                socket.emit('currentPlayers', this.players);

                // send the monsters data to the new player
                socket.emit('currentMonsters', this.monsters);

                // send the chests data to the new player
                socket.emit('currentChests', this.chests);

                // inform the other players that a new player has joined
                socket.broadcast.emit('spawnPlayer', this.players[socket.id]);

            });

            socket.on('playerMovement', playerData => {
                const player = this.players[socket.id];
                if (player) {
                    player.x = playerData.x;
                    player.y = playerData.y;
                    player.flipX = playerData.flipX;

                    // emit to all players that the player has moved
                    this.io.emit('playerMoved', player);
                }
            })

            // player connected to the game
            console.log('a player connected');
            console.log(socket.id);

        })
    }

    setupSpawners() {}

    spawnPlayer(playerId) {
        const player = new PlayerModel(playerId, this.playerLocations);
        this.players[playerId] = player;
    }
}