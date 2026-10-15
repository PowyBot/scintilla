// node web/selftest.js          -> same random-bot selftest as scintilla.py --selftest
// node web/selftest.js --dump   -> one line per seed, to diff against the Python version
const { Game, PyRandom, KEYS, MAX_CHARGE } = require("./scintilla.js");

const dump = process.argv.includes("--dump");
const moves = Object.values(KEYS);
let deepest = 0;
for (let seed = 0; seed < 200; seed++) {
  const game = new Game(seed);
  const bot = new PyRandom(seed);
  for (let i = 0; i < 3000 && !game.over; i++) {
    const roll = bot.random();
    if (roll < 0.05) game.arc();
    else if (roll < 0.1) game.run(...bot.choice(moves));
    else if (roll < 0.13) game.wait();
    else game.move(...bot.choice(moves));
    if (!game.walkable(game.px, game.py)) throw new Error(`seed ${seed}: player in a wall`);
    if (game.charge < 0 || game.charge > MAX_CHARGE) throw new Error(`seed ${seed}: charge ${game.charge}`);
    if (!game.enemies.every(e => game.walkable(e.x, e.y))) throw new Error(`seed ${seed}: enemy in a wall`);
  }
  deepest = Math.max(deepest, game.depth);
  if (dump) console.log(seed, game.depth, game.turn, game.charge, game.kills, game.px, game.py);
}
if (!dump) console.log(`selftest ok: 200 partite, layer massimo raggiunto da un bot casuale: ${deepest}`);
