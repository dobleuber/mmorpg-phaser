import * as Phaser from 'phaser';
import PlayerContainer from '../classes/player/PlayerContainer';
import Chest from '../classes/Chest';
import Monster from '../classes/Monster';
import GameMap from '../classes/GameMap';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init() {
    this.scene.launch('Ui');

    // get a reference to our socket
    this.socket = this.sys.game.globals.socket;

    // listen for socket events
    this.listenForSocketEvents();
  }

  listenForSocketEvents() {

    // spawn new player
    this.socket.on('spawnPlayer', player => {
      this.createPlayer(player);
    });

    // spawn players
    this.socket.on('currentPlayers', players => {
      console.log('current players event', players);
      Object.keys(players).forEach(playerId => {
        if (playerId === this.socket.id) {
          this.createPlayer(players[playerId], true);
          this.addCollisions();
        } else {
          this.createPlayer(players[playerId]);
        }
      })
    });

    // spawn monsters
    this.socket.on('currentMonsters', monsters => {
      Object.keys(monsters).forEach(monsterId => {
        this.spawnMonster(monsters[monsterId]);
      });
    });

    // spawn chests
    this.socket.on('currentChests', chests => {
      Object.keys(chests).forEach(chestId => {
        this.spawnChest(chests[chestId]);
      });
    });

    // listen for player movement
    this.socket.on('playerMoved', ({
      id,
      x,
      y,
      flipX,
      playerAttacking,
      currentDirection,
    }) => {
      const otherPlayer = this.otherPlayers.getChildren().find(p => p.id === id);
      if (otherPlayer) {
        otherPlayer.setPosition(x, y);
        otherPlayer.flipX = flipX;
        otherPlayer.updateHealthBar();
        otherPlayer.updateFlipX();
        otherPlayer.playerAttacking = playerAttacking;
        otherPlayer.currentDirection = currentDirection;
        if (playerAttacking) {
          otherPlayer.attack();
        }
      }
    });

    this.socket.on('chestSpawned', (chest) => {
      this.spawnChest(chest);
    });

    this.socket.on('monsterSpawned', (monster) => {
      this.spawnMonster(monster);
    });

    this.socket.on('chestRemoved', (chestId) => {
      this.chests.getChildren().forEach((chest) => {
        if (chest.id === chestId) {
          chest.makeInactive();
        }
      });
    });

    this.socket.on('monsterRemoved', (monsterId) => {
      this.monsters.getChildren().forEach((monster) => {
        if (monster.id === monsterId) {
          monster.makeInactive();
          this.monsterDeathAudio.play();
        }
      });
    });

    this.socket.on('monsterMovement', (monsters) => {
      this.monsters.getChildren().forEach((monster) => {
        Object.keys(monsters).forEach((monsterId) => {
          if (monster.id === monsterId) {
            this.physics.moveToObject(monster, monsters[monsterId], 40);
          }
        });
      });
    });

    this.socket.on('updateScore', gold => {
      this.events.emit('updateScore', gold);
    });

    this.socket.on('updateMonsterHealth', (monsterId, health) => {
      this.monsters.getChildren().forEach((monster) => {
        if (monster.id === monsterId) {
          monster.updateHealth(health);
        }
      });
    });

    this.socket.on('updatePlayerHealth', (playerId, health) => {
      if (this.player.id === playerId) {
        if (health < this.player.health) {
          this.playerDamageAudio.play();
        }

        this.player.updateHealth(health);
      } else {
        this.otherPlayers.getChildren().forEach(player => {
          if (playerId === player.id) {
            player.updateHealth(health);
          }
        })
      }
    });

    this.socket.on('respawnPlayer', (playerObject) => {
      if (this.player.id === playerObject.id) {
        this.playerDeathAudio.play();
        this.player.respawn(playerObject);
      } else {
        this.otherPlayers.getChildren().forEach(player => {
          if (playerObject.id === player.id) {
            playerDeathAudio.play();
            player.respawn(playerObject);
          }
        })
      }
    });

    this.socket.on('disconnected', playerId => {
      this.otherPlayers.getChildren().forEach(player => {
        if (player.id === playerId) {
          player.cleanup();
        }
      });

    })
  }

  create() {
    this.createMap();
    this.createAudio();
    this.createGroups();
    this.createInput();

    // this.createGameManager();

    // emit event to server that a new player has joined
    this.socket.emit('newPlayer', {
      test: 1234
    });
  }

  update() {
    if (this.player) this.player.update(this.cursors);

    if (this.player) {
      const {
        x,
        y,
        flipX,
        playerAttacking,
        currentDirection
      } = this.player;
      if (this.player.oldPosition &&
        (x !== this.player.oldPosition.x ||
          y !== this.player.oldPosition.y ||
          flipX !== this.player.oldPosition.flipX ||
          playerAttacking !== this.player.oldPosition.playerAttacking ||
          currentDirection !== this.player.oldPosition.currentDirection
        )) {
        this.socket.emit('playerMovement', {
          x,
          y,
          flipX,
          playerAttacking,
          currentDirection
        });
      }

      this.player.oldPosition = {
        x,
        y,
        flipX,
        playerAttacking,
        currentDirection
      }
    }
  }

  createAudio() {
    this.goldPickupAudio = this.sound.add('goldSound', {
      loop: false,
      volume: 0.3
    });
    this.playerAttackAudio = this.sound.add('playerAttack', {
      loop: false,
      volume: 0.01
    });
    this.playerDamageAudio = this.sound.add('playerDamage', {
      loop: false,
      volume: 0.2
    });
    this.playerDeathAudio = this.sound.add('playerDeath', {
      loop: false,
      volume: 0.2
    });
    this.monsterDeathAudio = this.sound.add('enemyDeath', {
      loop: false,
      volume: 0.2
    });
  }

  createPlayer(playerObject, mainPlayer = false) {
    const player = new PlayerContainer(
      this,
      playerObject.x * 2,
      playerObject.y * 2,
      'characters',
      0,
      playerObject.health,
      playerObject.maxHealth,
      playerObject.id,
      this.playerAttackAudio,
      mainPlayer
    );

    if (!mainPlayer) {
      this.otherPlayers.add(player)
    } else {
      this.player = player;
    }
  }

  createGroups() {
    // create a chest group
    this.chests = this.physics.add.group();
    // create a monster group
    this.monsters = this.physics.add.group();
    this.monsters.runChildUpdate = true;

    // create other players group
    this.otherPlayers = this.physics.add.group();
    this.otherPlayers.runChildUpdate = true;
  }

  spawnChest(chestObject) {
    let chest = this.chests.getFirstDead();
    if (!chest) {
      chest = new Chest(this, chestObject.x * 2, chestObject.y * 2, 'items', 0, chestObject.gold, chestObject.id);
      // add chest to chests group
      this.chests.add(chest);
    } else {
      chest.coins = chestObject.gold;
      chest.id = chestObject.id;
      chest.setPosition(chestObject.x * 2, chestObject.y * 2);
      chest.makeActive();
    }
  }

  spawnMonster(monsterObject) {
    let monster = this.monsters.getFirstDead();
    if (!monster) {
      monster = new Monster(
        this,
        monsterObject.x,
        monsterObject.y,
        'monsters',
        monsterObject.frame,
        monsterObject.id,
        monsterObject.health,
        monsterObject.maxHealth,
      );
      // add monster to monsters group
      this.monsters.add(monster);
    } else {
      monster.id = monsterObject.id;
      monster.health = monsterObject.health;
      monster.maxHealth = monsterObject.maxHealth;
      monster.setTexture('monsters', monsterObject.frame);
      monster.setPosition(monsterObject.x, monsterObject.y);
      monster.makeActive();
    }
  }

  createInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  addCollisions() {
    // check for collisions between the player and the tiled blocked layer
    this.physics.add.collider(this.player, this.gameMap.blockedLayer);
    // check for overlaps between player and chest game objects
    this.physics.add.overlap(this.player, this.chests, this.collectChest, null, this);
    // check for collisions between the monster group and the tiled blocked layer
    this.physics.add.collider(this.monsters, this.gameMap.blockedLayer);
    // check for overlaps between the player's weapon and monster game objects
    this.physics.add.overlap(this.player.weapon, this.monsters, this.enemyOverlap, null, this);
    // check if the player collides other players
    this.physics.add.collider(this.otherPlayers, this.player, this.pvpCollider, false, this);
    // check for overlaps between the player's weapon and other players
    this.physics.add.overlap(this.player.weapon, this.otherPlayers, this.weaponOverlapEnemy, false, this);
  }

  pvpCollider(player, otherPlayer) {
    this.player.body.setVelocity(0);
    otherPlayer.body.setVelocity(0);
  }

  weaponOverlapEnemy(weapon, otherPlayer) {
    if (this.player.playerAttacking && !this.player.swordHit) {
      this.player.swordHit = true;
      this.socket.emit('attackedPlayer', otherPlayer.id);
    }
  }

  enemyOverlap(weapon, enemy) {
    if (this.player.playerAttacking && !this.player.swordHit) {
      this.player.swordHit = true;
      this.socket.emit('monsterAttacked', enemy.id);
    }
  }

  collectChest(player, chest) {
    // play gold pickup sound
    this.goldPickupAudio.play();
    this.socket.emit('pickUpChest', chest.id);
  }

  createMap() {
    // create map
    this.gameMap = new GameMap(this, 'map', 'background', 'background', 'blocked');
  }
}