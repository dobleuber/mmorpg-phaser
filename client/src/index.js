import * as Phaser from 'phaser';
import scenes from './scenes/scenes';
import io from 'socket.io-client';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: scenes,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: {
        y: 0,
      },
    },
  },
  pixelArt: true,
  roundPixels: true,
};

class Game extends Phaser.Game {
  constructor() {
    super(config);
    this.scene.start('Boot');
    const socket = io('http://localhost:3000');
    this.globals = {socket};
  }
}

window.onload = () => {
  window.game = new Game();
};
