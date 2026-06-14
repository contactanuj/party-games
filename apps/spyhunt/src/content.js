/*
 * content.js (Spy Hunt) - built-in location packs, read by the shared word engine + UI.
 *
 * Model 'locationRoles': everyone at the table shares ONE location and each gets a personal role
 * there; the Spy gets neither and must blend in by asking questions. type:'locations'; each item
 * is { name, roles:[7] }. During play the master list of the active pack's location NAMES is shown
 * publicly (as in the physical game) so everyone can phrase clever questions - that is NOT a leak.
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

  var WORKPLACES = [
    loc('Law Firm', ['Senior Partner', 'Paralegal', 'Court Clerk', 'Receptionist', 'Intern', 'Litigator', 'Client']),
    loc('TV Studio', ['News Anchor', 'Floor Manager', 'Camera Operator', 'Teleprompter Operator', 'Makeup Artist', 'Producer', 'Audience Member']),
    loc('Newspaper Office', ['Editor-in-Chief', 'Reporter', 'Columnist', 'Photographer', 'Copy Editor', 'Cartoonist', 'Visiting Source']),
    loc('Tech Startup', ['Founder', 'Software Engineer', 'Product Manager', 'Designer', 'Office Manager', 'Intern', 'Investor']),
    loc('Factory', ['Floor Supervisor', 'Assembly Worker', 'Forklift Driver', 'Quality Inspector', 'Maintenance Technician', 'Safety Officer', 'Delivery Driver']),
    loc('Power Plant', ['Control Room Operator', 'Engineer', 'Turbine Technician', 'Safety Inspector', 'Electrician', 'Plant Manager', 'Auditor']),
    loc('Bakery', ['Head Baker', 'Pastry Chef', 'Cake Decorator', 'Cashier', 'Apprentice', 'Delivery Driver', 'Customer']),
    loc('Bookshop', ['Owner', 'Bookseller', 'Stock Clerk', 'Cashier', 'Cafe Barista', 'Visiting Author', 'Customer']),
    loc('Veterinary Clinic', ['Veterinarian', 'Vet Technician', 'Receptionist', 'Kennel Attendant', 'Groomer', 'Surgeon', 'Pet Owner']),
    loc('Recording Studio', ['Sound Engineer', 'Producer', 'Session Musician', 'Vocalist', 'Mixing Engineer', 'Studio Manager', 'Guest Artist'])
  ];

  var WORLD = [
    loc('Ski Resort', ['Ski Instructor', 'Lift Operator', 'Patroller', 'Snowboarder', 'Equipment Renter', 'Resort Manager', 'Tourist']),
    loc('Safari', ['Safari Guide', 'Tracker', 'Driver', 'Wildlife Photographer', 'Ranger', 'Camp Cook', 'Tourist']),
    loc('Vineyard', ['Winemaker', 'Grape Picker', 'Sommelier', 'Cellar Master', 'Estate Owner', 'Tour Guide', 'Visitor']),
    loc('Lighthouse', ['Lighthouse Keeper', 'Coast Guard', 'Engineer', 'Radio Operator', 'Supply Boat Pilot', 'Historian', 'Tourist']),
    loc('Monastery', ['Abbot', 'Monk', 'Novice', 'Gardener', 'Librarian', 'Bell Ringer', 'Pilgrim']),
    loc('Aquarium', ['Marine Biologist', 'Aquarist', 'Diver', 'Tour Guide', 'Ticket Seller', 'Gift Shop Clerk', 'Visitor']),
    loc('Botanical Garden', ['Botanist', 'Gardener', 'Greenhouse Keeper', 'Tour Guide', 'Researcher', 'Groundskeeper', 'Visitor']),
    loc('Night Market', ['Food Stall Vendor', 'Street Musician', 'Fortune Teller', 'Souvenir Seller', 'Cook', 'Pickpocket', 'Shopper']),
    loc('Ski Lodge', ['Concierge', 'Chef', 'Fireplace Attendant', 'Bartender', 'Housekeeper', 'Ski Guide', 'Guest']),
    loc('Harbor', ['Harbor Master', 'Dock Worker', 'Fisherman', 'Customs Officer', 'Crane Operator', 'Sailor', 'Tourist'])
  ];

  var FANTASY = [
    loc('Wizard’s Tower', ['Archmage', 'Apprentice', 'Alchemist', 'Familiar', 'Scroll Keeper', 'Summoned Demon', 'Wandering Adventurer']),
    loc('Viking Longship', ['Jarl', 'Shieldmaiden', 'Oarsman', 'Navigator', 'Skald', 'Captured Slave', 'Raider']),
    loc('Royal Court', ['King', 'Queen', 'Jester', 'Royal Advisor', 'Lady-in-Waiting', 'Executioner', 'Foreign Envoy']),
    loc('Knights’ Castle', ['Lord', 'Knight', 'Squire', 'Blacksmith', 'Court Wizard', 'Stable Boy', 'Visiting Bard']),
    loc('Dragon’s Lair', ['Dragon', 'Treasure Hunter', 'Captured Princess', 'Knight Slayer', 'Hoard Guardian', 'Cave Goblin', 'Lost Traveler']),
    loc('Ancient Colosseum', ['Gladiator', 'Emperor', 'Beast Handler', 'Slave Master', 'Charioteer', 'Vestal Virgin', 'Spectator']),
    loc('Pirate Cove', ['Pirate Captain', 'Quartermaster', 'Map Forger', 'Tavern Wench', 'Marooned Sailor', 'Treasure Buyer', 'Stowaway']),
    loc('Haunted Mansion', ['Ghost', 'Butler', 'Medium', 'Paranormal Investigator', 'Grave Caretaker', 'Heir', 'Curious Trespasser']),
    loc('Wild West Saloon', ['Gunslinger', 'Bartender', 'Saloon Singer', 'Card Sharp', 'Sheriff', 'Piano Player', 'Drifter']),
    loc('Egyptian Tomb', ['Pharaoh’s Mummy', 'Tomb Raider', 'Archaeologist', 'High Priest', 'Embalmer', 'Tomb Guardian', 'Grave Robber'])
  ];

  var MODERN = [
    loc('Gym', ['Personal Trainer', 'Yoga Instructor', 'Front Desk Clerk', 'Bodybuilder', 'Equipment Technician', 'Smoothie Bar Barista', 'First-Time Member']),
    loc('Nightclub', ['DJ', 'Bouncer', 'Bartender', 'Coat Check Clerk', 'Promoter', 'Go-Go Dancer', 'Clubgoer']),
    loc('Wedding', ['Bride', 'Groom', 'Officiant', 'Wedding Planner', 'Caterer', 'Photographer', 'Plus-One Guest']),
    loc('Escape Room', ['Game Master', 'Puzzle Designer', 'Actor', 'Receptionist', 'Technician', 'Team Captain', 'Confused Player']),
    loc('Food Truck Festival', ['Truck Owner', 'Line Cook', 'Order Taker', 'Health Inspector', 'Stage Performer', 'Festival Organizer', 'Hungry Foodie']),
    loc('Coworking Space', ['Community Manager', 'Freelancer', 'Startup Founder', 'Barista', 'IT Support', 'Cleaner', 'Day-Pass Visitor']),
    loc('Dentist Office', ['Dentist', 'Dental Hygienist', 'Receptionist', 'Orthodontist', 'Dental Assistant', 'Office Manager', 'Nervous Patient']),
    loc('Subway Train', ['Train Operator', 'Conductor', 'Transit Cop', 'Buskers', 'Maintenance Worker', 'Pickpocket', 'Commuter']),
    loc('Apple-style Store', ['Store Manager', 'Genius Bar Tech', 'Sales Associate', 'Product Demonstrator', 'Security Guard', 'Trainer', 'Browsing Shopper']),
    loc('Comic Convention', ['Cosplayer', 'Comic Artist', 'Booth Vendor', 'Voice Actor', 'Panel Moderator', 'Security Volunteer', 'Fan Attendee'])
  ];

  var PACKS = [
    { id: 'everyday', name: 'Everyday', type: 'locations', items: EVERYDAY },
    { id: 'out', name: 'Out & About', type: 'locations', items: OUT_AND_ABOUT },
    { id: 'adventure', name: 'Adventure', type: 'locations', items: ADVENTURE },
    { id: 'work', name: 'Workplaces', type: 'locations', items: WORKPLACES },
    { id: 'world', name: 'Around the World', type: 'locations', items: WORLD },
    { id: 'fantasy', name: 'Fantasy & History', type: 'locations', items: FANTASY },
    { id: 'modern', name: 'Modern Life', type: 'locations', items: MODERN }
  ];

  return { packs: PACKS };
});
