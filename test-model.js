import { readFileSync } from 'fs';
import { run, bench, group } from 'mitata';
import { randomFillSync } from 'crypto';

const sharedBuffer = Buffer.alloc(5);

export function random() {
  randomFillSync(sharedBuffer);
  return sharedBuffer.toString('hex')
}

const { transitions, starts } = JSON.parse(readFileSync('src/utils/name_model.json', 'utf-8'))
// Pre-calculate uppercase lookup to avoid string slicing and instantiation
const CAPS_CACHE = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

function generate(type, minLen = 5, maxLen = 9) {
  const pool = starts[type];
  const map = transitions[type];

  // OPTIMIZATION 1: Use a plain for-loop. Avoid Array.from allocation completely.
  for (let attempt = 0; attempt < 10; attempt++) {
    let bigram = pool[(Math.random() * pool.length) | 0];

    // OPTIMIZATION 2: Flatten out string modifications.
    // Storing strings individually or tracking characters works best,
    // but extracting character variables directly avoids heavy structural re-allocation.
    let result = bigram;
    let running = 50;

    while (running > 0 && result.length < maxLen) {
      running--;
      const possibleNext = map[bigram];
      if (possibleNext === undefined) break;

      const nextChar = possibleNext[(Math.random() * possibleNext.length) | 0];

      if (nextChar === null) {
        if (result.length >= minLen) break;
        continue;
      }

      result += nextChar;

      // OPTIMIZATION 3: Manual manual slicing optimization
      // String.prototype.slice is fast, but we can access fixed positions safely
      // because we know we just appended 1 character to the old bigram.
      bigram = bigram.charAt(1) + nextChar;
    }

    // OPTIMIZATION 4: High-speed Capitalization
    if (running > 0) {
      const firstCharCode = result.charCodeAt(0);
      // If it's a lowercase standard a-z character, use fast array lookup
      if (firstCharCode >= 97 && firstCharCode <= 122) {
        return CAPS_CACHE[firstCharCode - 97] + result.slice(1);
      }
      return result.charAt(0).toUpperCase() + result.slice(1);
    }
  }

  throw new Error('failed to generate name');
}

export function nameish() {
  // OPTIMIZATION 5: Reduce Math.random() branching inside string interpolation.
  // Pre-evaluating conditions keeps the template string instantiation tight.
  const isCompoundGiven = Math.random() < 0.5;
  const isCompoundSurname = Math.random() < 0.5;

  const given = isCompoundGiven
    ? `${generate('given')}.${generate('given')}`
    : generate('given');

  const surname = isCompoundSurname
    ? `${generate('surname')}-${generate('surname')}`
    : generate('surname');

  return `${given}.${surname}`;
}

group('Localpart generation', () => {
  bench('nameish', function* () {
    Array.from({ length: 2000 }).forEach(() => nameish())

    yield () => nameish()
  })

  bench('random', function* () {
    Array.from({ length: 2000 }).forEach(() => random())

    yield () => random()
  })
});

await run()
