const crypto = require('crypto');

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

// Fisher-Yates with a CSPRNG so card order can't be predicted.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { RANKS, SUITS, makeDeck, shuffle };
