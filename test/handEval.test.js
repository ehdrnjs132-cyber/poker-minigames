const test = require('node:test');
const assert = require('node:assert');
const { bestHand, compareScores } = require('../server/handEval');

const cat = (cards) => bestHand(cards).category;

test('categories', () => {
  assert.strictEqual(bestHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']).name, '로열 플러시');
  assert.strictEqual(cat(['9h', '8h', '7h', '6h', '5h', 'Ad', 'Ac']), 8);
  assert.strictEqual(cat(['9h', '9d', '9s', '9c', '5h', 'Ad', 'Ac']), 7);
  assert.strictEqual(cat(['9h', '9d', '9s', 'Ac', '5h', 'Ad', '2c']), 6);
  assert.strictEqual(cat(['2h', '9h', 'Jh', 'Kh', '5h', 'Ad', 'Ac']), 5);
  assert.strictEqual(cat(['As', '2d', '3h', '4c', '5s', 'Kd', 'Qc']), 4);
  assert.strictEqual(cat(['7s', '7d', '7h', '2c', '5s', 'Kd', 'Qc']), 3);
  assert.strictEqual(cat(['7s', '7d', '2h', '2c', '5s', 'Kd', 'Qc']), 2);
  assert.strictEqual(cat(['7s', '7d', '3h', '2c', '5s', 'Kd', 'Qc']), 1);
  assert.strictEqual(cat(['7s', '9d', '3h', '2c', '5s', 'Kd', 'Qc']), 0);
});

test('wheel straight loses to 6-high straight', () => {
  const wheel = bestHand(['As', '2d', '3h', '4c', '5s', '9d', 'Jc']).score;
  const six = bestHand(['6s', '2d', '3h', '4c', '5s', '9d', 'Jc']).score;
  assert.ok(compareScores(six, wheel) > 0);
});

test('kickers decide pairs', () => {
  const a = bestHand(['As', 'Ad', 'Kh', '4c', '5s', '9d', '2c']).score;
  const b = bestHand(['Ac', 'Ah', 'Qh', '4c', '5s', '9d', '2c']).score;
  assert.ok(compareScores(a, b) > 0);
});

test('identical hands tie', () => {
  const board = ['As', 'Kd', 'Qh', 'Jc', 'Ts'];
  const a = bestHand(['2c', '3d', ...board]).score;
  const b = bestHand(['4c', '5d', ...board]).score;
  assert.strictEqual(compareScores(a, b), 0);
});
