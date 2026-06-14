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
      ['Pizza', 'Sushi', 'Coffee', 'Ice Cream', 'Curry', 'Pancakes', 'Cheese', 'Chocolate', 'Tacos', 'Soup', 'Steak', 'Salad', 'Burger', 'Pasta', 'Noodles', 'Cake', 'Cereal', 'Sandwich', 'Omelette', 'Dumplings', 'Risotto', 'Waffles', 'Bacon', 'Fries', 'Popcorn', 'Yoghurt', 'Lasagne', 'Burrito', 'Toast', 'Stew'],
      [
        'On a scale of 1–10, how often do you have it?',
        'Would you serve it at a fancy dinner party?',
        'Sweet, savoury, or somewhere in between?',
        'Is it better hot or cold?',
        'Would a 5-year-old enjoy it?',
        'Rate how messy it is to eat, 1–10.',
        'Could you eat it every day for a week?',
        'Is it a treat or an everyday thing?',
        'Would you order it at a restaurant?',
        'Do you need a fork to eat it?'
      ]),
    pack('animals', 'Animals',
      ['Dog', 'Cat', 'Lion', 'Elephant', 'Penguin', 'Shark', 'Rabbit', 'Horse', 'Snake', 'Eagle', 'Monkey', 'Bear', 'Dolphin', 'Owl', 'Tiger', 'Frog', 'Wolf', 'Giraffe', 'Kangaroo', 'Crocodile', 'Panda', 'Fox', 'Whale', 'Hedgehog', 'Camel', 'Zebra', 'Octopus', 'Deer', 'Hippo', 'Squirrel'],
      [
        'Would you want it as a pet?',
        'How scared of it are you, 1–10?',
        'Is it bigger or smaller than you?',
        'Would you find it at a zoo?',
        'How cute is it, 1–10?',
        'Could you outrun it?',
        'Does it belong in water, on land, or in the sky?',
        'Would you put a photo of it on your wall?',
        'Would you want to meet one in the wild?',
        'Does it make a sound you can imitate?'
      ]),
    pack('places', 'Places',
      ['Beach', 'Hospital', 'Airport', 'School', 'Library', 'Cinema', 'Gym', 'Zoo', 'Park', 'Restaurant', 'Museum', 'Castle', 'Office', 'Supermarket', 'Bank', 'Theatre', 'Bakery', 'Stadium', 'Aquarium', 'Cafe', 'Church', 'Farm', 'Harbour', 'Prison', 'Pharmacy', 'Garage', 'Campsite', 'Nightclub', 'Spa', 'Lighthouse'],
      [
        'How often do you go there?',
        'Would you take a first date there?',
        'Is it usually loud or quiet?',
        'Rate how much you enjoy it, 1–10.',
        'Would you go there alone?',
        'Is it busy on a weekend?',
        'Could you spend a whole day there?',
        'Do you dress up to go there?',
        'Is it open late at night?',
        'Would you take children there?'
      ]),
    pack('jobs', 'Jobs',
      ['Doctor', 'Teacher', 'Chef', 'Pilot', 'Lawyer', 'Artist', 'Firefighter', 'Farmer', 'Judge', 'Barber', 'Sailor', 'Dentist', 'Nurse', 'Plumber', 'Engineer', 'Waiter', 'Actor', 'Mechanic', 'Accountant', 'Electrician', 'Journalist', 'Librarian', 'Photographer', 'Scientist', 'Vet', 'Carpenter', 'Detective', 'Architect', 'Cleaner', 'Tailor'],
      [
        'Would you want this job?',
        'How stressful is it, 1–10?',
        'Do they wear a uniform?',
        'Is it well paid?',
        'Would your parents be proud?',
        'Do they work mostly indoors?',
        'How respected is it, 1–10?',
        'Could you do it for a day?',
        'Do they work with their hands?',
        'Would you trust a stranger to do it?'
      ]),
    pack('movies', 'Movies',
      ['Titanic', 'Frozen', 'Jaws', 'Shrek', 'Batman', 'Rocky', 'Avatar', 'Joker', 'Up', 'Gladiator', 'Matrix', 'Cars', 'Alien', 'Grease', 'Aladdin', 'Twister', 'Coco', 'Brave', 'Moana', 'Dumbo', 'Tangled', 'Encanto', 'Ghostbusters', 'Superman', 'Tarzan', 'Bambi', 'Pinocchio', 'Hercules', 'Mulan', 'Wall-E'],
      [
        'Have you seen it more than once?',
        'Is it good for kids?',
        'Rate it 1–10.',
        'Would you watch it on a first date?',
        'Is it scary?',
        'Could you quote a line from it?',
        'Is it a feel-good film?',
        'Would you watch the sequel?',
        'Would you recommend it to a friend?',
        'Does it have a happy ending?'
      ]),
    pack('travel', 'Travel',
      ['Suitcase', 'Passport', 'Hotel', 'Train', 'Beach', 'Camera', 'Map', 'Cruise', 'Mountain', 'Desert', 'Island', 'Taxi', 'Tent', 'Backpack', 'Ferry', 'Souvenir', 'Compass', 'Hostel', 'Sunscreen', 'Postcard', 'Guidebook', 'Adapter', 'Visa', 'Luggage', 'Itinerary', 'Boarding Pass', 'Sunglasses', 'Snorkel', 'Caravan', 'Resort'],
      [
        'Is it essential for a trip?',
        'Would you spend a lot of money on it?',
        'How exciting is it, 1–10?',
        'Is it relaxing or stressful?',
        'Would you post a photo of it?',
        'Could you go without it?',
        'Is it for a weekend or a long trip?',
        'Indoors or outdoors?',
        'Would you pack it in your bag?',
        'Is it more for adventure or comfort?'
      ]),
    pack('sport', 'Sport',
      ['Football', 'Tennis', 'Boxing', 'Golf', 'Swimming', 'Skiing', 'Surfing', 'Cricket', 'Basketball', 'Cycling', 'Archery', 'Karate', 'Bowling', 'Hockey', 'Rugby', 'Climbing', 'Rowing', 'Badminton', 'Volleyball', 'Baseball', 'Fencing', 'Skating', 'Wrestling', 'Diving', 'Snowboarding', 'Sailing', 'Darts', 'Gymnastics', 'Squash', 'Table Tennis'],
      [
        'Could you play it right now?',
        'How dangerous is it, 1–10?',
        'Do you need a team?',
        'Is it in the Olympics?',
        'Would you watch it on TV?',
        'Is it expensive to start?',
        'Do you sweat a lot doing it?',
        'Rate how fun it looks, 1–10.',
        'Could a beginner pick it up quickly?',
        'Do you need special equipment for it?'
      ]),
    pack('home', 'Around the House',
      ['Toaster', 'Pillow', 'Umbrella', 'Clock', 'Mirror', 'Kettle', 'Fridge', 'Lamp', 'Candle', 'Television', 'Towel', 'Vacuum', 'Blanket', 'Scissors', 'Broom', 'Cushion', 'Stapler', 'Doormat', 'Microwave', 'Oven', 'Wardrobe', 'Curtains', 'Sofa', 'Bookshelf', 'Iron', 'Hairdryer', 'Bucket', 'Ladder', 'Carpet', 'Bin'],
      [
        'Do you use it every day?',
        'Could you live without it?',
        'Is it in your bedroom?',
        'How expensive is it, 1–10?',
        'Would you notice if it disappeared?',
        'Does it use electricity?',
        'Is it bigger than a shoebox?',
        'Would you take it on holiday?',
        'Could you lend it to a neighbour?',
        'Would you buy a fancy version of it?'
      ]),
    pack('tech', 'Technology',
      ['Laptop', 'Phone', 'Headphones', 'Charger', 'Printer', 'Router', 'Speaker', 'Tablet', 'Keyboard', 'Mouse', 'Webcam', 'Drone', 'Console', 'Smartwatch', 'Monitor', 'Microphone', 'Projector', 'Scanner', 'Hard Drive', 'Camera', 'Calculator', 'Remote', 'Joystick', 'Modem', 'Power Bank', 'E-Reader', 'Stylus', 'Doorbell', 'Thermostat', 'Earbuds'],
      [
        'Do you own one?',
        'Could you live a week without it?',
        'How expensive is it, 1–10?',
        'Would you give it as a gift?',
        'Does it need charging?',
        'Is it easy for a beginner to use?',
        'Will it feel outdated in five years?',
        'Rate how useful it is, 1–10.',
        'Could you fit it in a pocket?',
        'Would a child know how to use it?'
      ]),
    pack('music', 'Music',
      ['Guitar', 'Piano', 'Drums', 'Violin', 'Trumpet', 'Flute', 'Saxophone', 'Microphone', 'Harp', 'Cello', 'Banjo', 'Accordion', 'Tambourine', 'Keyboard', 'Clarinet', 'Harmonica', 'Ukulele', 'Trombone', 'Xylophone', 'Bagpipes', 'Bongos', 'Maracas', 'Triangle', 'Mandolin', 'Oboe', 'Tuba', 'Cymbals', 'Bass', 'Recorder', 'Sitar'],
      [
        'Could you play it?',
        'Is it loud or quiet?',
        'Would you want one at home?',
        'How hard is it to learn, 1–10?',
        'Is it common in a band?',
        'Would you enjoy hearing it live?',
        'Is it bigger than a backpack?',
        'Rate how cool it looks, 1–10.',
        'Do you blow into it to play it?',
        'Would it suit a school music class?'
      ]),
    pack('clothing', 'Clothing',
      ['Jeans', 'Hat', 'Scarf', 'Boots', 'Dress', 'Gloves', 'Jacket', 'Socks', 'Tie', 'Sweater', 'Shorts', 'Belt', 'Sandals', 'Pyjamas', 'Skirt', 'Coat', 'Trainers', 'Shirt', 'Hoodie', 'Cap', 'Suit', 'Cardigan', 'Slippers', 'Vest', 'Raincoat', 'Bikini', 'Apron', 'Mittens', 'Blazer', 'Leggings'],
      [
        'Do you own one?',
        'Would you wear it to a wedding?',
        'Is it for warm or cold weather?',
        'How often do you wear it?',
        'Is it comfortable, 1–10?',
        'Would you wear it to bed?',
        'Could you wear it to work?',
        'Rate how stylish it is, 1–10.',
        'Would you wear it on a hot day?',
        'Does it go on your top half or bottom half?'
      ]),
    pack('drinks', 'Drinks',
      ['Water', 'Tea', 'Lemonade', 'Milkshake', 'Smoothie', 'Cola', 'Juice', 'Hot Chocolate', 'Milk', 'Cider', 'Cocktail', 'Espresso', 'Soda', 'Punch', 'Latte', 'Cappuccino', 'Wine', 'Beer', 'Champagne', 'Iced Tea', 'Mocktail', 'Hot Toddy', 'Squash', 'Tonic', 'Cocoa', 'Slushie', 'Eggnog', 'Mineral Water', 'Ginger Ale', 'Energy Drink'],
      [
        'Do you drink it often?',
        'Is it better hot or cold?',
        'Would you order it at a cafe?',
        'How sweet is it, 1–10?',
        'Would a child enjoy it?',
        'Is it good in the morning?',
        'Would you serve it at a party?',
        'Rate how refreshing it is, 1–10.',
        'Would you drink it on a hot day?',
        'Do you usually have it with a meal?'
      ]),
    pack('holidays', 'Holidays & Events',
      ['Birthday', 'Wedding', 'Halloween', 'Christmas', 'Carnival', 'Graduation', 'Anniversary', 'Festival', 'Parade', 'Reunion', 'Picnic', 'Concert', 'Sleepover', 'Barbecue', 'Easter', 'New Year', 'Funeral', 'Baby Shower', 'Retirement', 'Housewarming', 'Prom', 'Diwali', 'Thanksgiving', 'Christening', 'Bonfire Night', 'Engagement', 'Fair', 'Camping Trip', 'Road Trip', 'Pool Party'],
      [
        'Do you look forward to it?',
        'Would you dress up for it?',
        'Is it usually loud or quiet?',
        'How much do you enjoy it, 1–10?',
        'Is it better with a big crowd?',
        'Would you travel far for it?',
        'Does it usually involve food?',
        'Rate how memorable it is, 1–10.',
        'Would you invite your whole family?',
        'Does it happen at a set time of year?'
      ]),
    pack('nature', 'Nature & Weather',
      ['Rainbow', 'Thunder', 'Snow', 'Volcano', 'River', 'Forest', 'Lightning', 'Fog', 'Waterfall', 'Sunset', 'Breeze', 'Glacier', 'Meadow', 'Storm', 'Hurricane', 'Cave', 'Canyon', 'Hailstorm', 'Tornado', 'Sunrise', 'Drizzle', 'Avalanche', 'Earthquake', 'Frost', 'Heatwave', 'Cliff', 'Swamp', 'Dune', 'Tide', 'Eclipse'],
      [
        'Have you seen one in person?',
        'Is it calming or scary?',
        'Would you want to be near it right now?',
        'How beautiful is it, 1–10?',
        'Would you photograph it?',
        'Is it more common in summer?',
        'Could it be dangerous?',
        'Rate how impressive it is, 1–10.',
        'Would you tell others about seeing it?',
        'Is it something that happens quickly?'
      ]),
    pack('bodyparts', 'Body',
      ['Hand', 'Foot', 'Nose', 'Ear', 'Eye', 'Knee', 'Elbow', 'Shoulder', 'Tongue', 'Finger', 'Toe', 'Heart', 'Brain', 'Lung', 'Stomach', 'Ankle', 'Wrist', 'Chin', 'Hair', 'Tooth', 'Lip', 'Thumb', 'Heel', 'Spine', 'Eyebrow', 'Jaw', 'Cheek', 'Neck', 'Hip', 'Liver'],
      [
        'Can you see it on yourself right now?',
        'Is it above or below your waist?',
        'Could you live without it?',
        'How often do you think about it?',
        'Is it on the left and right sides?',
        'Would it hurt a lot if you injured it?',
        'Can you move it on purpose?',
        'Rate how important it is, 1–10.',
        'Is it bigger than your hand?',
        'Can other people usually see it?'
      ]),
    pack('transport', 'Transport',
      ['Car', 'Bus', 'Bicycle', 'Train', 'Aeroplane', 'Boat', 'Motorbike', 'Helicopter', 'Tram', 'Scooter', 'Van', 'Truck', 'Submarine', 'Ferry', 'Taxi', 'Skateboard', 'Rocket', 'Canoe', 'Ambulance', 'Tractor', 'Hot Air Balloon', 'Yacht', 'Jet Ski', 'Caravan', 'Sleigh', 'Gondola', 'Cable Car', 'Segway', 'Rickshaw', 'Hovercraft'],
      [
        'Have you ever ridden in one?',
        'Does it travel on land, water, or in the air?',
        'How fast can it go, 1–10?',
        'Would you feel safe in it?',
        'Could you afford to own one?',
        'Does it need fuel to move?',
        'Is it bigger than a house?',
        'Rate how fun it would be to ride, 1–10.',
        'Would you use it for a daily commute?',
        'Can it carry more than four people?'
      ]),
    pack('desserts', 'Desserts',
      ['Cheesecake', 'Brownie', 'Tiramisu', 'Doughnut', 'Pudding', 'Trifle', 'Cupcake', 'Eclair', 'Macaron', 'Pavlova', 'Cookie', 'Sundae', 'Custard', 'Mousse', 'Tart', 'Crumble', 'Sorbet', 'Gelato', 'Fudge', 'Souffle', 'Parfait', 'Flan', 'Baklava', 'Truffle', 'Meringue', 'Crepe', 'Profiterole', 'Cobbler', 'Panna Cotta', 'Banoffee Pie'],
      [
        'Have you eaten it in the last month?',
        'Is it served hot or cold?',
        'How sweet is it, 1–10?',
        'Would you order it at a restaurant?',
        'Could you make it at home?',
        'Is it easy to share?',
        'Would a child love it?',
        'Rate how indulgent it is, 1–10.',
        'Do you eat it with a spoon?',
        'Would you serve it at a celebration?'
      ])
  ];

  return { packs: PACKS };
});
