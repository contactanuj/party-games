/*
 * content.js (Spy Hunt) — built-in location packs, read by the shared word engine + UI.
 *
 * Model 'locationRoles': everyone at the table shares ONE location and each gets a personal role
 * there; the Spy gets neither and must blend in by asking questions. type:'locations'; each item
 * is { name, roles:[7] }. During play the master list of the active pack's location NAMES is shown
 * publicly (as in the physical game) so everyone can phrase clever questions — that is NOT a leak.
 *
 * Three non-overlapping themed packs of 10 (30 classic locations). A round draws ONE pack, so the
 * Spy's candidate list is exactly that pack's 10 locations. Original wording; usable as-is.
 */
(function (root, factory) {
  var C = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (root) root.WORD_CONTENT = C;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function loc(name, roles) { return { name: name, roles: roles }; }

  var EVERYDAY = [
    loc('Bank', ['Armored Car Driver', 'Manager', 'Consultant', 'Robber', 'Security Guard', 'Teller', 'Customer']),
    loc('Hospital', ['Nurse', 'Doctor', 'Anesthesiologist', 'Intern', 'Therapist', 'Surgeon', 'Patient']),
    loc('Hotel', ['Doorman', 'Security Guard', 'Manager', 'Housekeeper', 'Bartender', 'Bellhop', 'Customer']),
    loc('Restaurant', ['Musician', 'Bouncer', 'Hostess', 'Head Chef', 'Food Critic', 'Waiter', 'Customer']),
    loc('School', ['Gym Teacher', 'Principal', 'Security Guard', 'Janitor', 'Cafeteria Worker', 'Maintenance', 'Student']),
    loc('Supermarket', ['Cashier', 'Butcher', 'Janitor', 'Security Guard', 'Sample Demonstrator', 'Shelf Stocker', 'Customer']),
    loc('Service Station', ['Manager', 'Tire Specialist', 'Biker', 'Car Owner', 'Car Washer', 'Electrician', 'Auto Mechanic']),
    loc('Day Spa', ['Stylist', 'Masseuse', 'Manicurist', 'Makeup Artist', 'Dermatologist', 'Beautician', 'Customer']),
    loc('Police Station', ['Detective', 'Lawyer', 'Journalist', 'Criminalist', 'Archivist', 'Criminal', 'Patrol Officer']),
    loc('University', ['Graduate Student', 'Professor', 'Dean', 'Psychologist', 'Maintenance', 'Janitor', 'Student'])
  ];

  var OUT_AND_ABOUT = [
    loc('Beach', ['Beach Waitress', 'Kite Surfer', 'Lifeguard', 'Thief', 'Photographer', 'Ice Cream Vendor', 'Beach Goer']),
    loc('Casino', ['Bartender', 'Head Security', 'Bouncer', 'Manager', 'Hustler', 'Dealer', 'Gambler']),
    loc('Circus Tent', ['Acrobat', 'Animal Trainer', 'Magician', 'Fire Eater', 'Clown', 'Juggler', 'Visitor']),
    loc('Theater', ['Coat Check', 'Prompter', 'Cashier', 'Director', 'Actor', 'Crew Member', 'Audience Member']),
    loc('Movie Studio', ['Stunt Double', 'Sound Engineer', 'Cameraman', 'Director', 'Costume Artist', 'Producer', 'Actor']),
    loc('Corporate Party', ['Entertainer', 'Manager', 'Unwanted Guest', 'Owner', 'Secretary', 'Delivery Boy', 'Accountant']),
    loc('Cathedral', ['Priest', 'Beggar', 'Sinner', 'Tourist', 'Sponsor', 'Chorister', 'Parishioner']),
    loc('Zoo', ['Zookeeper', 'Veterinarian', 'Visitor', 'Photographer', 'Cleaner', 'Ticket Seller', 'Child']),
    loc('Amusement Park', ['Ride Operator', 'Mascot', 'Ticket Taker', 'Food Vendor', 'Security Guard', 'Tourist', 'Child']),
    loc('Art Museum', ['Curator', 'Security Guard', 'Tourist', 'Art Student', 'Painter', 'Donor', 'Tour Guide'])
  ];

  var ADVENTURE = [
    loc('Airplane', ['First Class Passenger', 'Air Marshal', 'Mechanic', 'Flight Attendant', 'Co-Pilot', 'Captain', 'Economy Passenger']),
    loc('Ocean Liner', ['Cook', 'Captain', 'Bartender', 'Musician', 'Waiter', 'Mechanic', 'Rich Passenger']),
    loc('Passenger Train', ['Mechanic', 'Border Patrol', 'Train Attendant', 'Restaurant Chef', 'Train Driver', 'Stoker', 'Passenger']),
    loc('Submarine', ['Cook', 'Commander', 'Sonar Technician', 'Electronics Tech', 'Radio Operator', 'Navigator', 'Sailor']),
    loc('Pirate Ship', ['Cook', 'Slave', 'Cannoneer', 'Prisoner', 'Cabin Boy', 'Captain', 'Sailor']),
    loc('Space Station', ['Engineer', 'Alien', 'Pilot', 'Commander', 'Scientist', 'Doctor', 'Space Tourist']),
    loc('Polar Station', ['Medic', 'Expedition Leader', 'Biologist', 'Radio Operator', 'Hydrologist', 'Meteorologist', 'Geologist']),
    loc('Military Base', ['Deserter', 'Colonel', 'Medic', 'Sniper', 'Officer', 'Tank Engineer', 'Soldier']),
    loc('Embassy', ['Security Guard', 'Secretary', 'Ambassador', 'Tourist', 'Refugee', 'Diplomat', 'Government Official']),
    loc('Wartime Camp', ['Resistance Fighter', 'Radio Operator', 'Scout', 'Medic', 'Cook', 'Prisoner', 'Soldier'])
  ];

  var PACKS = [
    { id: 'everyday', name: 'Everyday', type: 'locations', items: EVERYDAY },
    { id: 'out', name: 'Out & About', type: 'locations', items: OUT_AND_ABOUT },
    { id: 'adventure', name: 'Adventure', type: 'locations', items: ADVENTURE }
  ];

  return { packs: PACKS };
});
