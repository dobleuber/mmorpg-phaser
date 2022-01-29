import PlayerModel from './PlayerModel';
import Spawner from './Spawner';
import {
    SpawnerType,
} from './utils';
import * as levelData from '../public/assets/level/large_level.json';

export default class GameManager {
    constructor(io) {
        this.io = io;
        this.spawners = {};
        this.chests = {};
        this.monsters = {};
        this.players = {};

        this.playerLocations = [];
        this.chestLocations = {};
        this.monsterLocations = {};
    }

    setup() {
        this.parseMapData();
        this.setupEventListener();
        this.setupSpawners();
    }

    parseMapData() {
        this.levelData = levelData;
        this.levelData.layers.forEach(layer => {
            if (layer.name === 'player_locations') {
                layer.objects.forEach(object => {
                    this.playerLocations.push([object.x, object.y]);
                })
            } else if (layer.name === 'chest_locations') {
                layer.objects.forEach(object => {
                    const {
                        spawner
                    } = object.properties;
                    if (!this.chestLocations[spawner]) {
                        this.chestLocations[spawner] = [];
                    }
                    this.chestLocations[spawner].push([object.x, object.y]);
                })
            } else if (layer.name === 'monster_locations') {
                layer.objects.forEach(object => {
                    const {
                        spawner
                    } = object.properties;
                    if (!this.monsterLocations[spawner]) {
                        this.monsterLocations[spawner] = [];
                    }
                    this.monsterLocations[spawner].push([object.x, object.y]);
                })
            }
        })
    }

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
                    player.playerAttacking = playerData.playerAttacking;
                    player.currentDirection = playerData.currentDirection;

                    // emit to all players that the player has moved
                    this.io.emit('playerMoved', player);
                }
            });

            socket.on('pickUpChest', chestId => {
                // update the spawner
                if (this.chests[chestId]) {
                    const {
                        gold
                    } = this.chests[chestId];

                    // updating the players gold
                    this.players[socket.id].updateGold(gold);
                    socket.emit('updateScore', this.players[socket.id].gold);

                    // removing the chest
                    this.spawners[this.chests[chestId].spawnerId].removeObject(chestId);
                }
            });

            socket.on('monsterAttacked', monsterId => {
                // update the spawner
                if (this.monsters[monsterId]) {
                    const {
                        gold,
                        attack
                    } = this.monsters[monsterId];

                    // subtract health monster model
                    this.monsters[monsterId].loseHealth();

                    // check the monsters health, and if dead remove that object
                    if (this.monsters[monsterId].health <= 0) {
                        // updating the players gold
                        this.players[socket.id].updateGold(gold);
                        socket.emit('updateScore', this.players[socket.id].gold);

                        // removing the monster
                        this.spawners[this.monsters[monsterId].spawnerId].removeObject(monsterId);
                        this.io.emit('monsterRemoved', monsterId);

                        // add bonus health to the player
                        this.players[socket.id].updateHealth(2);
                        this.io.emit('updatePlayerHealth', socket.id, this.players[socket.id].health);
                    } else {
                        // update the players health
                        this.players[socket.id].updateHealth(-attack);
                        this.io.emit('updatePlayerHealth', socket.id, this.players[socket.id].health);

                        // update the monsters health
                        this.io.emit('updateMonsterHealth', monsterId, this.monsters[monsterId].health);

                        // check the player's health, if below 0 have the player respawn
                        if (this.players[socket.id].health <= 0) {
                            // update the gold the player has
                            this.players[socket.id].updateGold(parseInt(-this.players[socket.id].gold / 2, 10));
                            socket.emit('updateScore', this.players[socket.id].gold);

                            // respawn the player
                            this.players[socket.id].respawn(this.players);
                            this.io.emit('respawnPlayer', this.players[socket.id]);
                        }
                    }
                }
            });

            socket.on('attackedPlayer', playerId => {
                if (this.players[playerId]) {
                    const {
                        gold,
                    } = this.players[playerId];

                    // subtract health
                    this.players[playerId].updateHealth(-1);

                    // check the players health, if below 0 have the player respawn
                    if (this.players[playerId].health <= 0) {
                        // get the players gold
                        this.players[socket.id].updateGold(gold);

                        // respawn the player
                        this.players[playerId].respawn(this.players);
                        this.io.emit('respawnPlayer', this.players[playerId]);

                        // update the players gold
                        socket.emit('updateScore', this.players[socket.id].gold);

                        this.players[playerId].updateGold(-gold);
                        this.io.to(playerId).emit('updateScore', this.players[playerId].gold);

                        // add bonus health to the player
                        this.players[socket.id].updateHealth(2);
                        this.io.emit('updatePlayerHealth', socket.id, this.players[socket.id].health);

                    } else {
                        this.io.emit('updatePlayerHealth', playerId, this.players[playerId].health);
                    }
                }
            });
        })
    }

    setupSpawners() {
        const config = {
            spawnInterval: 3000,
            limit: 3,
            spawnerType: SpawnerType.CHEST,
            id: '',
        };
        let spawner;

        // create chest spawners
        Object.keys(this.chestLocations).forEach((key) => {
            config.id = `chest-${key}`;

            spawner = new Spawner(
                config,
                this.chestLocations[key],
                this.addChest.bind(this),
                this.deleteChest.bind(this),
            );
            this.spawners[spawner.id] = spawner;
        });

        // create monster spawners
        Object.keys(this.monsterLocations).forEach((key) => {
            config.id = `monster-${key}`;
            config.spawnerType = SpawnerType.MONSTER;

            spawner = new Spawner(
                config,
                this.monsterLocations[key],
                this.addMonster.bind(this),
                this.deleteMonster.bind(this),
                this.moveMonsters.bind(this),
            );
            this.spawners[spawner.id] = spawner;
        });
    }

    spawnPlayer(playerId) {
        const player = new PlayerModel(playerId, this.playerLocations, this.players);
        this.players[playerId] = player;
    }

    addChest(chestId, chest) {
        this.chests[chestId] = chest;
        this.io.emit('chestSpawned', chest);
    }

    deleteChest(chestId) {
        delete this.chests[chestId];
        this.io.emit('chestRemoved', chestId);
    }

    addMonster(monsterId, monster) {
        this.monsters[monsterId] = monster;
        this.io.emit('monsterSpawned', monster);
    }

    deleteMonster(monsterId) {
        delete this.monsters[monsterId];
        this.io.emit('monsterRemoved', monsterId);
    }

    moveMonsters() {
        this.io.emit('monsterMovement', this.monsters);
    }
}