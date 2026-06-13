/*
 * content.js (Out of the Loop) — built-in content, read by the shared word engine + UI.
 *
 * Every pack is type:'words' (model 'word'): all "In the Loop" players share ONE secret word
 * from the pack; the Outsider is told only the CATEGORY (the pack name) and must blend in.
 *
 * UNIQUE to this game: each pack carries a `questions` bank. The APP poses these questions in
 * turn (that's the "Out of the Loop" twist — structured, often silly prompts about the secret
 * word). Questions are written to fit ANY word in the category, so they never reveal the word.
 *
 * Item shorthand: a plain word, or { w:'Pizza', c:[...] } where `c` only feeds offline bots.
 */
(function (root, factory) {
  var C = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (root) root.WORD_CONTENT = C;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function pack(id, name, items, questions) { return { id: id, name: name, category: name, type: 'words', items: items, questions: questions }; }

  var PACKS = [
    pack('food', 'Food & Drink',
      ['Pizza', 'Sushi', 'Coffee', 'Ice Cream', 'Curry', 'Pancakes', 'Cheese', 'Chocolate', 'Tacos', 'Soup', 'Steak', 'Salad', 'Burger', 'Pasta'],
      [
        'On a scale of 1–10, how often do you have it?',
        'Would you serve it at a fancy dinner party?',
        'Sweet, savoury, or somewhere in between?',
        'Is it better hot or cold?',
        'Would a 5-year-old enjoy it?',
        'Rate how messy it is to eat, 1–10.',
        'Could you eat it every day for a week?',
        'Is it a treat or an everyday thing?'
      ]),
    pack('animals', 'Animals',
      ['Dog', 'Cat', 'Lion', 'Elephant', 'Penguin', 'Shark', 'Rabbit', 'Horse', 'Snake', 'Eagle', 'Monkey', 'Bear', 'Dolphin', 'Owl'],
      [
        'Would you want it as a pet?',
        'How scared of it are you, 1–10?',
        'Is it bigger or smaller than you?',
        'Would you find it at a zoo?',
        'How cute is it, 1–10?',
        'Could you outrun it?',
        'Does it belong in water, on land, or in the sky?',
        'Would you put a photo of it on your wall?'
      ]),
    pack('places', 'Places',
      ['Beach', 'Hospital', 'Airport', 'School', 'Library', 'Cinema', 'Gym', 'Zoo', 'Park', 'Restaurant', 'Museum', 'Castle', 'Office', 'Supermarket'],
      [
        'How often do you go there?',
        'Would you take a first date there?',
        'Is it usually loud or quiet?',
        'Rate how much you enjoy it, 1–10.',
        'Would you go there alone?',
        'Is it busy on a weekend?',
        'Could you spend a whole day there?',
        'Do you dress up to go there?'
      ]),
    pack('jobs', 'Jobs',
      ['Doctor', 'Teacher', 'Chef', 'Pilot', 'Lawyer', 'Artist', 'Firefighter', 'Farmer', 'Judge', 'Barber', 'Sailor', 'Dentist', 'Nurse', 'Plumber'],
      [
        'Would you want this job?',
        'How stressful is it, 1–10?',
        'Do they wear a uniform?',
        'Is it well paid?',
        'Would your parents be proud?',
        'Do they work mostly indoors?',
        'How respected is it, 1–10?',
        'Could you do it for a day?'
      ]),
    pack('movies', 'Movies',
      ['Titanic', 'Frozen', 'Jaws', 'Shrek', 'Batman', 'Rocky', 'Avatar', 'Joker', 'Up', 'Gladiator', 'Matrix', 'Cars', 'Alien', 'Grease'],
      [
        'Have you seen it more than once?',
        'Is it good for kids?',
        'Rate it 1–10.',
        'Would you watch it on a first date?',
        'Is it scary?',
        'Could you quote a line from it?',
        'Is it a feel-good film?',
        'Would you watch the sequel?'
      ]),
    pack('travel', 'Travel',
      ['Suitcase', 'Passport', 'Hotel', 'Train', 'Beach', 'Camera', 'Map', 'Cruise', 'Mountain', 'Desert', 'Island', 'Taxi', 'Tent', 'Backpack'],
      [
        'Is it essential for a trip?',
        'Would you spend a lot of money on it?',
        'How exciting is it, 1–10?',
        'Is it relaxing or stressful?',
        'Would you post a photo of it?',
        'Could you go without it?',
        'Is it for a weekend or a long trip?',
        'Indoors or outdoors?'
      ]),
    pack('sport', 'Sport',
      ['Football', 'Tennis', 'Boxing', 'Golf', 'Swimming', 'Skiing', 'Surfing', 'Cricket', 'Basketball', 'Cycling', 'Archery', 'Karate', 'Bowling', 'Hockey'],
      [
        'Could you play it right now?',
        'How dangerous is it, 1–10?',
        'Do you need a team?',
        'Is it in the Olympics?',
        'Would you watch it on TV?',
        'Is it expensive to start?',
        'Do you sweat a lot doing it?',
        'Rate how fun it looks, 1–10.'
      ]),
    pack('home', 'Around the House',
      ['Toaster', 'Pillow', 'Umbrella', 'Clock', 'Mirror', 'Kettle', 'Fridge', 'Lamp', 'Candle', 'Television', 'Towel', 'Vacuum', 'Blanket', 'Scissors'],
      [
        'Do you use it every day?',
        'Could you live without it?',
        'Is it in your bedroom?',
        'How expensive is it, 1–10?',
        'Would you notice if it disappeared?',
        'Does it use electricity?',
        'Is it bigger than a shoebox?',
        'Would you take it on holiday?'
      ])
  ];

  return { packs: PACKS };
});
