/*
 * content.js (Imposter) — the built-in content library, read by the shared word engine + UI.
 *
 * Two pack TYPES feed two variants of the same game (selected by config.contentModel):
 *   type:'words'  -> "Classic / Mr. White": every Crew member shares ONE word; the Imposter
 *                    gets nothing and must fake a matching one-word clue.
 *   type:'pairs'  -> "Undercover": Crew get word A, the Imposter gets the CLOSE word B and may
 *                    not realise they differ — clues from both sides sound plausible.
 *
 * Item shorthand (normalised by the engine):
 *   'Pizza'                      a plain word (bots fall back to a generic clue)
 *   { w:'Pizza', c:['cheese'] }  a word WITH bot clue hints (humans never see `c`)
 *   { a:'Coffee', b:'Tea' }      a close pair for Undercover (b is the Imposter's word)
 *
 * `c` (clue hints) exist ONLY so offline bots can give a believable one-word clue. They are
 * never shown to humans and never enter publicState — so they cannot leak anything.
 */
(function (root, factory) {
  var C = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (root) root.WORD_CONTENT = C;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function w(id, name, category, items) { return { id: id, name: name, category: category, type: 'words', items: items }; }
  function pr(id, name, category, items) { return { id: id, name: name, category: category, type: 'pairs', items: items }; }

  var PACKS = [
    // ===================== WORD packs (Classic / Mr. White) =====================
    w('food', 'Food', 'Food & Drink', [
      { w: 'Pizza', c: ['cheese', 'slice', 'oven', 'Italian', 'pepperoni'] },
      { w: 'Sushi', c: ['rice', 'fish', 'roll', 'Japan', 'raw'] },
      { w: 'Burger', c: ['bun', 'beef', 'fries', 'grill', 'ketchup'] },
      { w: 'Pasta', c: ['noodles', 'sauce', 'Italian', 'fork', 'boil'] },
      { w: 'Tacos', c: ['shell', 'Mexican', 'salsa', 'fold', 'spicy'] },
      { w: 'Pancakes', c: ['syrup', 'breakfast', 'flip', 'stack', 'batter'] },
      { w: 'Soup', c: ['bowl', 'spoon', 'warm', 'broth', 'ladle'] },
      { w: 'Curry', c: ['spice', 'rice', 'India', 'hot', 'sauce'] },
      { w: 'Salad', c: ['leaves', 'healthy', 'bowl', 'dressing', 'green'] },
      { w: 'Steak', c: ['beef', 'grill', 'rare', 'knife', 'dinner'] },
      { w: 'Ice Cream', c: ['cold', 'cone', 'scoop', 'sweet', 'summer'] },
      { w: 'Chocolate', c: ['sweet', 'brown', 'bar', 'cocoa', 'melt'] },
      { w: 'Cheese', c: ['dairy', 'yellow', 'mouse', 'melt', 'block'] },
      { w: 'Bread', c: ['loaf', 'toast', 'bakery', 'slice', 'wheat'] },
      { w: 'Eggs', c: ['shell', 'breakfast', 'fry', 'chicken', 'yolk'] },
      { w: 'Donut', c: ['ring', 'sweet', 'glaze', 'hole', 'coffee'] }
    ]),
    w('animals', 'Animals', 'Nature', [
      { w: 'Dog', c: ['bark', 'pet', 'loyal', 'fetch', 'tail'] },
      { w: 'Cat', c: ['meow', 'pet', 'whiskers', 'purr', 'mouse'] },
      { w: 'Lion', c: ['mane', 'roar', 'king', 'pride', 'savanna'] },
      { w: 'Elephant', c: ['trunk', 'big', 'grey', 'tusks', 'memory'] },
      { w: 'Shark', c: ['ocean', 'teeth', 'fin', 'predator', 'jaws'] },
      { w: 'Penguin', c: ['ice', 'waddle', 'tuxedo', 'cold', 'Antarctica'] },
      { w: 'Monkey', c: ['banana', 'climb', 'jungle', 'tail', 'swing'] },
      { w: 'Horse', c: ['ride', 'gallop', 'mane', 'stable', 'hooves'] },
      { w: 'Rabbit', c: ['hop', 'carrot', 'ears', 'burrow', 'fluffy'] },
      { w: 'Bear', c: ['honey', 'forest', 'hibernate', 'big', 'growl'] },
      { w: 'Snake', c: ['hiss', 'slither', 'venom', 'scales', 'coil'] },
      { w: 'Eagle', c: ['fly', 'talons', 'sky', 'beak', 'soar'] },
      { w: 'Frog', c: ['hop', 'pond', 'green', 'croak', 'lily'] },
      { w: 'Wolf', c: ['pack', 'howl', 'forest', 'moon', 'hunt'] },
      { w: 'Kangaroo', c: ['hop', 'pouch', 'Australia', 'jump', 'tail'] },
      { w: 'Owl', c: ['night', 'hoot', 'wise', 'feathers', 'eyes'] }
    ]),
    w('movies', 'Movies', 'Film & TV', [
      { w: 'Titanic', c: ['ship', 'iceberg', 'romance', 'sink', 'ocean'] },
      { w: 'Avatar', c: ['blue', 'aliens', 'jungle', 'Pandora', 'CGI'] },
      { w: 'Jaws', c: ['shark', 'beach', 'fear', 'boat', 'ocean'] },
      { w: 'Frozen', c: ['snow', 'sisters', 'queen', 'song', 'cold'] },
      { w: 'Gladiator', c: ['Rome', 'arena', 'sword', 'revenge', 'fight'] },
      { w: 'Rocky', c: ['boxing', 'training', 'underdog', 'stairs', 'gloves'] },
      { w: 'Up', c: ['balloons', 'house', 'old man', 'dog', 'adventure'] },
      { w: 'Shrek', c: ['ogre', 'swamp', 'donkey', 'green', 'fairytale'] },
      { w: 'Joker', c: ['clown', 'villain', 'Gotham', 'laugh', 'dark'] },
      { w: 'Batman', c: ['bat', 'Gotham', 'hero', 'cape', 'dark'] },
      { w: 'Inception', c: ['dream', 'layers', 'spinning', 'mind', 'heist'] },
      { w: 'Matrix', c: ['red pill', 'code', 'simulation', 'kung fu', 'green'] },
      { w: 'Cars', c: ['race', 'animated', 'Lightning', 'track', 'wheels'] },
      { w: 'Alien', c: ['space', 'monster', 'ship', 'horror', 'egg'] },
      { w: 'Psycho', c: ['shower', 'motel', 'thriller', 'knife', 'classic'] },
      { w: 'Grease', c: ['musical', 'cars', 'school', 'dance', 'fifties'] }
    ]),
    w('sports', 'Sports', 'Sport', [
      { w: 'Football', c: ['goal', 'kick', 'pitch', 'team', 'ball'] },
      { w: 'Tennis', c: ['racket', 'net', 'serve', 'court', 'ace'] },
      { w: 'Boxing', c: ['gloves', 'ring', 'punch', 'rounds', 'jab'] },
      { w: 'Golf', c: ['club', 'hole', 'green', 'swing', 'putt'] },
      { w: 'Cricket', c: ['bat', 'wicket', 'over', 'pitch', 'bowl'] },
      { w: 'Swimming', c: ['pool', 'lane', 'stroke', 'water', 'dive'] },
      { w: 'Skiing', c: ['snow', 'slope', 'poles', 'mountain', 'cold'] },
      { w: 'Surfing', c: ['wave', 'board', 'ocean', 'balance', 'beach'] },
      { w: 'Cycling', c: ['bike', 'wheels', 'pedal', 'helmet', 'race'] },
      { w: 'Basketball', c: ['hoop', 'dribble', 'court', 'dunk', 'net'] },
      { w: 'Hockey', c: ['stick', 'puck', 'ice', 'goal', 'rink'] },
      { w: 'Archery', c: ['bow', 'arrow', 'target', 'aim', 'bullseye'] },
      { w: 'Bowling', c: ['pins', 'strike', 'lane', 'ball', 'roll'] },
      { w: 'Karate', c: ['belt', 'kick', 'chop', 'dojo', 'discipline'] },
      { w: 'Rowing', c: ['oars', 'boat', 'river', 'crew', 'stroke'] },
      { w: 'Darts', c: ['board', 'throw', 'bullseye', 'pub', 'aim'] }
    ]),
    w('places', 'Places', 'Places', [
      { w: 'Beach', c: ['sand', 'waves', 'sun', 'shells', 'towel'] },
      { w: 'Hospital', c: ['doctor', 'beds', 'sick', 'nurse', 'emergency'] },
      { w: 'Airport', c: ['planes', 'gates', 'luggage', 'flight', 'security'] },
      { w: 'School', c: ['students', 'teacher', 'desk', 'lessons', 'bell'] },
      { w: 'Library', c: ['books', 'quiet', 'shelves', 'read', 'cards'] },
      { w: 'Cinema', c: ['movie', 'popcorn', 'screen', 'dark', 'seats'] },
      { w: 'Gym', c: ['weights', 'workout', 'sweat', 'machines', 'fit'] },
      { w: 'Zoo', c: ['animals', 'cages', 'visit', 'lions', 'family'] },
      { w: 'Park', c: ['grass', 'trees', 'bench', 'walk', 'picnic'] },
      { w: 'Restaurant', c: ['menu', 'waiter', 'food', 'table', 'dinner'] },
      { w: 'Museum', c: ['art', 'history', 'quiet', 'exhibit', 'old'] },
      { w: 'Bank', c: ['money', 'vault', 'teller', 'account', 'cards'] },
      { w: 'Farm', c: ['animals', 'crops', 'tractor', 'barn', 'fields'] },
      { w: 'Castle', c: ['king', 'moat', 'stone', 'old', 'tower'] },
      { w: 'Supermarket', c: ['trolley', 'aisles', 'checkout', 'food', 'shop'] },
      { w: 'Office', c: ['desk', 'meeting', 'work', 'computer', 'boss'] }
    ]),
    w('jobs', 'Jobs', 'People & Jobs', [
      { w: 'Doctor', c: ['patients', 'hospital', 'cure', 'stethoscope', 'sick'] },
      { w: 'Teacher', c: ['students', 'school', 'lessons', 'board', 'marks'] },
      { w: 'Chef', c: ['kitchen', 'cook', 'knife', 'recipe', 'food'] },
      { w: 'Pilot', c: ['plane', 'sky', 'cockpit', 'fly', 'captain'] },
      { w: 'Farmer', c: ['crops', 'tractor', 'animals', 'field', 'harvest'] },
      { w: 'Lawyer', c: ['court', 'case', 'judge', 'suit', 'argue'] },
      { w: 'Nurse', c: ['hospital', 'care', 'patients', 'shift', 'meds'] },
      { w: 'Plumber', c: ['pipes', 'leak', 'wrench', 'water', 'fix'] },
      { w: 'Artist', c: ['paint', 'brush', 'canvas', 'gallery', 'create'] },
      { w: 'Soldier', c: ['army', 'uniform', 'duty', 'gun', 'march'] },
      { w: 'Judge', c: ['court', 'gavel', 'verdict', 'robe', 'law'] },
      { w: 'Barber', c: ['hair', 'scissors', 'cut', 'shave', 'chair'] },
      { w: 'Waiter', c: ['restaurant', 'order', 'tray', 'tip', 'menu'] },
      { w: 'Sailor', c: ['ship', 'sea', 'rope', 'deck', 'navy'] },
      { w: 'Dentist', c: ['teeth', 'drill', 'clean', 'chair', 'smile'] },
      { w: 'Firefighter', c: ['fire', 'hose', 'truck', 'rescue', 'ladder'] }
    ]),
    w('home', 'Household', 'Home', [
      { w: 'Toaster', c: ['bread', 'pop', 'kitchen', 'crumbs', 'hot'] },
      { w: 'Pillow', c: ['soft', 'bed', 'sleep', 'head', 'fluffy'] },
      { w: 'Umbrella', c: ['rain', 'open', 'wet', 'handle', 'cover'] },
      { w: 'Clock', c: ['time', 'tick', 'wall', 'hands', 'alarm'] },
      { w: 'Mirror', c: ['reflect', 'glass', 'face', 'wall', 'look'] },
      { w: 'Vacuum', c: ['clean', 'dust', 'floor', 'suck', 'carpet'] },
      { w: 'Kettle', c: ['boil', 'tea', 'water', 'steam', 'whistle'] },
      { w: 'Fridge', c: ['cold', 'food', 'kitchen', 'milk', 'door'] },
      { w: 'Lamp', c: ['light', 'bulb', 'desk', 'switch', 'glow'] },
      { w: 'Broom', c: ['sweep', 'floor', 'dust', 'handle', 'clean'] },
      { w: 'Blanket', c: ['warm', 'bed', 'cover', 'soft', 'cosy'] },
      { w: 'Candle', c: ['wax', 'flame', 'light', 'melt', 'wick'] },
      { w: 'Television', c: ['screen', 'remote', 'watch', 'shows', 'couch'] },
      { w: 'Towel', c: ['dry', 'bath', 'soft', 'wet', 'wrap'] },
      { w: 'Scissors', c: ['cut', 'paper', 'sharp', 'blades', 'craft'] },
      { w: 'Spoon', c: ['eat', 'soup', 'metal', 'stir', 'bowl'] }
    ]),
    w('travel', 'Travel', 'Travel', [
      { w: 'Suitcase', c: ['pack', 'wheels', 'trip', 'clothes', 'airport'] },
      { w: 'Passport', c: ['travel', 'stamp', 'photo', 'border', 'book'] },
      { w: 'Map', c: ['directions', 'fold', 'routes', 'paper', 'lost'] },
      { w: 'Hotel', c: ['room', 'bed', 'stay', 'reception', 'keys'] },
      { w: 'Train', c: ['tracks', 'station', 'carriage', 'ticket', 'rail'] },
      { w: 'Beach', c: ['sand', 'sun', 'sea', 'relax', 'waves'] },
      { w: 'Camera', c: ['photo', 'lens', 'snap', 'memory', 'click'] },
      { w: 'Backpack', c: ['straps', 'carry', 'hike', 'gear', 'shoulders'] },
      { w: 'Ticket', c: ['entry', 'price', 'seat', 'show', 'paper'] },
      { w: 'Cruise', c: ['ship', 'ocean', 'cabin', 'deck', 'sail'] },
      { w: 'Mountain', c: ['climb', 'peak', 'snow', 'high', 'hike'] },
      { w: 'Desert', c: ['sand', 'hot', 'dry', 'camel', 'dune'] },
      { w: 'Island', c: ['sea', 'palm', 'sand', 'remote', 'beach'] },
      { w: 'Taxi', c: ['fare', 'driver', 'yellow', 'ride', 'city'] },
      { w: 'Tent', c: ['camp', 'poles', 'sleep', 'outdoors', 'zip'] },
      { w: 'Compass', c: ['north', 'direction', 'needle', 'navigate', 'point'] }
    ]),

    // ===================== PAIR packs (Undercover variant) ======================
    // Crew get A; the Imposter gets the close word B. Clue hints suit BOTH so bots blend in.
    pr('pairs_food', 'Food (pairs)', 'Food & Drink', [
      { a: 'Coffee', b: 'Tea', c: ['hot', 'morning', 'cup', 'drink'] },
      { a: 'Pizza', b: 'Burger', c: ['fast food', 'cheese', 'takeaway', 'dinner'] },
      { a: 'Cake', b: 'Pie', c: ['sweet', 'bake', 'slice', 'dessert'] },
      { a: 'Ice Cream', b: 'Yoghurt', c: ['cold', 'creamy', 'spoon', 'sweet'] },
      { a: 'Beer', b: 'Wine', c: ['alcohol', 'glass', 'bar', 'drink'] },
      { a: 'Apple', b: 'Pear', c: ['fruit', 'tree', 'crunch', 'healthy'] },
      { a: 'Pasta', b: 'Noodles', c: ['boil', 'sauce', 'long', 'fork'] },
      { a: 'Pancake', b: 'Waffle', c: ['breakfast', 'syrup', 'batter', 'sweet'] }
    ]),
    pr('pairs_animals', 'Animals (pairs)', 'Nature', [
      { a: 'Cat', b: 'Dog', c: ['pet', 'fur', 'home', 'cute'] },
      { a: 'Lion', b: 'Tiger', c: ['big cat', 'wild', 'roar', 'predator'] },
      { a: 'Dolphin', b: 'Whale', c: ['ocean', 'swim', 'mammal', 'big'] },
      { a: 'Frog', b: 'Toad', c: ['hop', 'pond', 'green', 'amphibian'] },
      { a: 'Crocodile', b: 'Alligator', c: ['teeth', 'water', 'reptile', 'snap'] },
      { a: 'Rabbit', b: 'Hare', c: ['hop', 'ears', 'fast', 'fields'] },
      { a: 'Moth', b: 'Butterfly', c: ['wings', 'fly', 'flutter', 'insect'] },
      { a: 'Donkey', b: 'Horse', c: ['ride', 'farm', 'hooves', 'animal'] }
    ]),
    pr('pairs_everyday', 'Everyday (pairs)', 'Home', [
      { a: 'Pen', b: 'Pencil', c: ['write', 'paper', 'hand', 'school'] },
      { a: 'Sofa', b: 'Armchair', c: ['sit', 'comfy', 'living room', 'cushion'] },
      { a: 'Phone', b: 'Tablet', c: ['screen', 'apps', 'touch', 'charge'] },
      { a: 'Cup', b: 'Mug', c: ['drink', 'handle', 'hot', 'kitchen'] },
      { a: 'Shoe', b: 'Boot', c: ['feet', 'wear', 'laces', 'walk'] },
      { a: 'Window', b: 'Door', c: ['house', 'open', 'wall', 'glass'] },
      { a: 'Clock', b: 'Watch', c: ['time', 'hands', 'tick', 'hours'] },
      { a: 'Towel', b: 'Blanket', c: ['cloth', 'soft', 'fold', 'warm'] }
    ]),
    pr('pairs_places', 'Places (pairs)', 'Places', [
      { a: 'Sea', b: 'Lake', c: ['water', 'swim', 'shore', 'blue'] },
      { a: 'Mountain', b: 'Hill', c: ['high', 'climb', 'view', 'walk'] },
      { a: 'Cinema', b: 'Theatre', c: ['show', 'seats', 'stage', 'tickets'] },
      { a: 'Cafe', b: 'Restaurant', c: ['eat', 'menu', 'table', 'order'] },
      { a: 'School', b: 'University', c: ['study', 'students', 'classes', 'exams'] },
      { a: 'Hotel', b: 'Hostel', c: ['stay', 'beds', 'travel', 'rooms'] },
      { a: 'River', b: 'Canal', c: ['water', 'flow', 'boat', 'bank'] },
      { a: 'Park', b: 'Garden', c: ['grass', 'plants', 'green', 'outside'] }
    ])
  ];

  return { packs: PACKS };
});
