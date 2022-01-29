export default class PlayerModel {
  constructor(playerId, spawnLocations, players) {
    this.health = 10;
    this.maxHealth = 10;
    this.gold = 0;
    this.id = playerId;
    this.flipX = true;
    this.playerAttacking = false;
    this.spawnLocations = spawnLocations;

    const location = this.generateLocation(players);
    [this.x, this.y] = location;
  }

  updateGold(gold) {
    this.gold += gold;
  }

  updateHealth(health) {
    this.health += health;
    if (this.health > 10) this.health = 10;
  }

  respawn(players) {
    this.health = this.maxHealth;
    const location = this.generateLocation(players);
    [this.x, this.y] = location;
  }

  generateLocation(players) {
    const location = this.spawnLocations[Math.floor(Math.random() * this.spawnLocations.length)];
    const invalid = Object.keys(players)
      .some(l => players[l].x === location[0] && players[l].y === location[1]);
    if (invalid) return this.generateLocation();
    return location;
  }
}