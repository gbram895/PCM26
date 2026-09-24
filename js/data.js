// Static game data: nations, name pools, teams, race calendar, point tables.
// All teams, races and riders are fictional.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.DATA = (function () {
  const NATIONS = {
    BEL: { name: 'Belgium', flag: '🇧🇪', w: 12,
      first: ['Jasper', 'Tim', 'Arnaud', 'Victor', 'Jens', 'Florian', 'Laurens', 'Maxim', 'Quinten', 'Brent', 'Stan', 'Lennert', 'Milan', 'Gerben', 'Sibe', 'Kobe', 'Thibau', 'Wannes', 'Jonas', 'Ward'],
      last: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambrecht', 'Hermans', 'Vermeulen', 'Van den Broeck', 'De Clercq', 'Verstraeten', 'Coppens', 'Pauwels', 'Aerts', 'Michiels', 'Vandenberghe', 'Van Hecke', 'De Wilde'] },
    NED: { name: 'Netherlands', flag: '🇳🇱', w: 9,
      first: ['Daan', 'Bram', 'Thijs', 'Lars', 'Sven', 'Ruben', 'Joris', 'Niels', 'Stijn', 'Koen', 'Jesse', 'Tijmen', 'Wessel', 'Rick', 'Olav', 'Mees', 'Casper', 'Pim'],
      last: ['de Jong', 'Jansen', 'de Vries', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'de Boer', 'Bos', 'Dekker', 'Hendriks', 'van Leeuwen', 'Kok', 'Brouwer', 'Prins', 'van der Veen', 'Postma', 'Hoekstra'] },
    FRA: { name: 'France', flag: '🇫🇷', w: 12,
      first: ['Julien', 'Thibaut', 'Romain', 'Valentin', 'Guillaume', 'Benoît', 'Kévin', 'Lenny', 'Axel', 'Mathis', 'Hugo', 'Clément', 'Pierre', 'Bastien', 'Quentin', 'Antoine', 'Maxime', 'Louis', 'Théo', 'Rémi'],
      last: ['Martin', 'Bernard', 'Moreau', 'Laurent', 'Lefèvre', 'Roux', 'Fournier', 'Girard', 'Bonnet', 'Dupuis', 'Fontaine', 'Rousseau', 'Vincent', 'Blanc', 'Guérin', 'Chevalier', 'Garnier', 'Faure', 'Mercier', 'Lemoine', 'Perrin', 'Marchand'] },
    ITA: { name: 'Italy', flag: '🇮🇹', w: 12,
      first: ['Matteo', 'Lorenzo', 'Filippo', 'Davide', 'Giulio', 'Alessandro', 'Simone', 'Andrea', 'Luca', 'Marco', 'Federico', 'Edoardo', 'Tommaso', 'Nicolò', 'Gianni', 'Diego', 'Samuele', 'Riccardo'],
      last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro'] },
    ESP: { name: 'Spain', flag: '🇪🇸', w: 10,
      first: ['Alejandro', 'Carlos', 'Iván', 'Marc', 'Raúl', 'Jon', 'Oier', 'Enric', 'Sergio', 'Álvaro', 'Pablo', 'Diego', 'Mikel', 'Héctor', 'Javier', 'Unai', 'Gorka', 'Rubén'],
      last: ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Iturria', 'Etxeberria', 'Aranburu', 'Zubeldia'] },
    GBR: { name: 'Great Britain', flag: '🇬🇧', w: 6,
      first: ['Tom', 'James', 'Oscar', 'Ethan', 'Fred', 'Harry', 'Josh', 'Ben', 'Owain', 'Callum', 'Lewis', 'Jake', 'Sam', 'Alfie', 'Rory', 'Finn'],
      last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Hughes', 'Hall', 'Clarke', 'Turner', 'Price', 'Morgan', 'Fletcher'] },
    GER: { name: 'Germany', flag: '🇩🇪', w: 6,
      first: ['Lukas', 'Jonas', 'Felix', 'Max', 'Leon', 'Nils', 'Pascal', 'Florian', 'Marius', 'Georg', 'Tobias', 'Jannik', 'Niklas', 'Emanuel', 'Moritz', 'Paul'],
      last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Wolf', 'Schröder', 'Neumann', 'Zimmermann', 'Krüger', 'Hartmann'] },
    DEN: { name: 'Denmark', flag: '🇩🇰', w: 6,
      first: ['Mads', 'Magnus', 'Mikkel', 'Jonas', 'Kasper', 'Frederik', 'Mathias', 'Søren', 'Anders', 'Rasmus', 'Emil', 'Tobias', 'Asger', 'Viktor'],
      last: ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen'] },
    SLO: { name: 'Slovenia', flag: '🇸🇮', w: 3,
      first: ['Luka', 'Jan', 'Matej', 'Žiga', 'Nejc', 'Gal', 'Anže', 'Rok', 'Domen', 'Blaž', 'Tilen'],
      last: ['Novak', 'Horvat', 'Kovačič', 'Krajnc', 'Zupančič', 'Potočnik', 'Kos', 'Vidmar', 'Golob', 'Turk', 'Mlakar', 'Kolar'] },
    COL: { name: 'Colombia', flag: '🇨🇴', w: 5,
      first: ['Santiago', 'Daniel', 'Esteban', 'Sergio', 'Andrés', 'Juan', 'Camilo', 'Brandon', 'Einer', 'Harold', 'Miguel', 'Julián'],
      last: ['Gómez', 'Quintero', 'Martínez', 'Rojas', 'Cárdenas', 'Henao', 'Osorio', 'Restrepo', 'Vargas', 'Castaño', 'Mejía', 'Arango', 'Ospina', 'Zapata', 'Montoya', 'Duarte'] },
    AUS: { name: 'Australia', flag: '🇦🇺', w: 4,
      first: ['Jack', 'Luke', 'Ben', 'Mitch', 'Rohan', 'Caleb', 'Lucas', 'Kaden', 'Oscar', 'Nick', 'Harry', 'Chris', 'Liam'],
      last: ['Walsh', 'Kelly', "O'Brien", 'Murphy', 'Harris', 'Mitchell', 'Cooper', 'Ryan', 'Campbell', 'Stewart', 'Reid', 'Bennett'] },
    USA: { name: 'United States', flag: '🇺🇸', w: 4,
      first: ['Brandon', 'Kevin', 'Tyler', 'Logan', 'Riley', 'Joey', 'Quinn', 'Chris', 'Cole', 'Evan', 'Nate', 'Sean'],
      last: ['Johnson', 'Miller', 'Davis', 'Anderson', 'Jackson', 'White', 'Harrison', 'Thompson', 'Moore', 'Clark', 'Lewis', 'Porter'] },
    NOR: { name: 'Norway', flag: '🇳🇴', w: 4,
      first: ['Tobias', 'Markus', 'Andreas', 'Jonas', 'Kristoffer', 'Anders', 'Erlend', 'Johannes', 'Halvor', 'Iver', 'Sindre'],
      last: ['Olsen', 'Johansen', 'Berg', 'Haugen', 'Hagen', 'Bakken', 'Lie', 'Dahl', 'Moen', 'Solberg', 'Strand'] },
    SUI: { name: 'Switzerland', flag: '🇨🇭', w: 3,
      first: ['Marc', 'Stefan', 'Silvan', 'Mauro', 'Fabian', 'Jan', 'Joel', 'Mathias', 'Reto', 'Gino', 'Simon'],
      last: ['Keller', 'Frei', 'Huber', 'Schmid', 'Meier', 'Steiner', 'Gerber', 'Brunner', 'Baumann', 'Graf', 'Wyss', 'Zbinden'] },
    POR: { name: 'Portugal', flag: '🇵🇹', w: 3,
      first: ['João', 'Rui', 'Nelson', 'Tiago', 'Rúben', 'António', 'Rafael', 'André', 'Nuno', 'Diogo'],
      last: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Almeida'] },
    POL: { name: 'Poland', flag: '🇵🇱', w: 3,
      first: ['Michał', 'Rafał', 'Kamil', 'Maciej', 'Paweł', 'Szymon', 'Tomasz', 'Filip', 'Łukasz', 'Piotr'],
      last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski'] },
    ECU: { name: 'Ecuador', flag: '🇪🇨', w: 2,
      first: ['Jhonatan', 'Alexander', 'Jefferson', 'Santiago', 'Byron', 'Wilson', 'Cristian'],
      last: ['Cepeda', 'Narváez', 'Caicedo', 'Montenegro', 'Guerrón', 'Quiroz', 'Andrade', 'Paredes'] },
    ERI: { name: 'Eritrea', flag: '🇪🇷', w: 2,
      first: ['Biniam', 'Natnael', 'Merhawi', 'Amanuel', 'Henok', 'Yakob', 'Awet'],
      last: ['Tesfay', 'Mehari', 'Haile', 'Kahsay', 'Woldu', 'Tekle', 'Gebru', 'Tesfom'] },
    CAN: { name: 'Canada', flag: '🇨🇦', w: 2,
      first: ['Hugo', 'Derek', 'Pier-André', 'Alex', 'Nickolas', 'Ryan', 'Guillaume'],
      last: ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'MacDonald', 'Fraser'] },
  };

  // prestige 1-5 drives squad quality, budget and board expectations
  const TEAMS = [
    { id: 'SOL', name: 'Solaris Pro Cycling', nat: 'ITA', prestige: 5, c1: '#f5b700', c2: '#1a1a1a' },
    { id: 'NWK', name: 'Nordwind–Kraft', nat: 'DEN', prestige: 5, c1: '#1f4e9c', c2: '#ffd400' },
    { id: 'LOW', name: 'Lowlands Racing', nat: 'NED', prestige: 5, c1: '#ff6a00', c2: '#111111' },
    { id: 'MRC', name: 'Maison Rouge Cycling', nat: 'FRA', prestige: 4, c1: '#c8102e', c2: '#ffffff' },
    { id: 'ADV', name: 'Adriatica Veloce', nat: 'ITA', prestige: 4, c1: '#00a3a1', c2: '#ffffff' },
    { id: 'IBS', name: 'Ibérica Sierra', nat: 'ESP', prestige: 4, c1: '#0a2e6e', c2: '#e9c46a' },
    { id: 'TMP', name: 'Tempest Energy', nat: 'GBR', prestige: 4, c1: '#111827', c2: '#22d3ee' },
    { id: 'KES', name: 'Kestrel Racing', nat: 'AUS', prestige: 3, c1: '#16a34a', c2: '#ffffff' },
    { id: 'ALP', name: 'Alpenglow Pro', nat: 'SUI', prestige: 3, c1: '#e11d48', c2: '#fdf2f8' },
    { id: 'VGD', name: 'Vanguard Dynamics', nat: 'USA', prestige: 3, c1: '#1e3a8a', c2: '#ef4444' },
    { id: 'MER', name: 'Meridian Cycling', nat: 'BEL', prestige: 3, c1: '#7c3aed', c2: '#ffffff' },
    { id: 'CBC', name: 'Cobblestone Collective', nat: 'BEL', prestige: 3, c1: '#52525b', c2: '#facc15' },
    { id: 'EVG', name: 'Evergreen Pro Team', nat: 'NOR', prestige: 2, c1: '#065f46', c2: '#a7f3d0' },
    { id: 'HBT', name: 'Harbor Tech', nat: 'GER', prestige: 2, c1: '#0369a1', c2: '#ffffff' },
    { id: 'CDA', name: 'Condor Andino', nat: 'COL', prestige: 2, c1: '#eab308', c2: '#1e40af' },
    { id: 'BLS', name: 'Baltic Storm', nat: 'POL', prestige: 2, c1: '#0ea5e9', c2: '#0f172a' },
    { id: 'RVR', name: 'Rift Valley Racing', nat: 'ERI', prestige: 1, c1: '#b45309', c2: '#fef3c7' },
    { id: 'ATL', name: 'Atlântico Pro', nat: 'POR', prestige: 1, c1: '#0f766e', c2: '#fcd34d' },
  ];

  // Stage codes: F flat, H hilly, M mountain (descent finish), MS summit finish,
  // ITT long time trial, ITTS short time trial / prologue, C cobbles
  const PATTERNS = {
    gtA: ['F', 'H', 'F', 'H', 'ITT', 'F', 'MS', 'M', 'C', 'F', 'MS', 'MS', 'H', 'F', 'MS', 'ITT', 'F', 'H', 'MS', 'M', 'F'],
    gtB: ['ITTS', 'F', 'H', 'F', 'MS', 'F', 'H', 'F', 'M', 'ITT', 'F', 'H', 'MS', 'F', 'MS', 'M', 'F', 'MS', 'H', 'MS', 'ITTS'],
    gtC: ['ITTS', 'F', 'MS', 'H', 'F', 'MS', 'H', 'F', 'MS', 'ITT', 'H', 'F', 'MS', 'M', 'MS', 'H', 'MS', 'F', 'H', 'MS', 'F'],
    balanced: ['F', 'H', 'F', 'ITT', 'MS', 'H', 'M', 'F'],
    mountain: ['H', 'MS', 'F', 'ITTS', 'MS', 'M', 'MS', 'H'],
    hilly: ['H', 'F', 'H', 'ITT', 'H', 'MS', 'H'],
    flat: ['F', 'ITTS', 'C', 'F', 'H', 'F'],
    sunny: ['F', 'H', 'MS', 'F', 'ITT', 'H'],
  };

  // cls: GT grand tour, WT world tour stage race, PRO lower stage race, MON monument, CL classic
  const CALENDAR = [
    { id: 'sct', realName: "Tour Down Under", name: 'Southern Cross Tour', country: 'AUS', week: 2, weeks: 1, kind: 'stage', cls: 'PRO', pattern: 'sunny', stages: 6 },
    { id: 'alg', realName: "Volta ao Algarve", name: 'Algarve Sun Tour', country: 'POR', week: 4, weeks: 1, kind: 'stage', cls: 'PRO', pattern: 'sunny', stages: 5 },
    { id: 'owc', realName: "Omloop Nieuwsblad", name: 'Opening Weekend Classic', country: 'BEL', week: 6, weeks: 1, kind: 'oneday', cls: 'CL', type: 'cobbles', km: 202 },
    { id: 'wrc', realName: "Strade Bianche", name: 'White Roads Classic', country: 'ITA', week: 7, weeks: 1, kind: 'oneday', cls: 'CL', type: 'hilly', km: 215 },
    { id: 'rts', realName: "Paris–Nice", name: 'Race to the Sun', country: 'FRA', week: 8, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'balanced', stages: 8 },
    { id: 'tst', realName: "Tirreno–Adriatico", name: 'Two Seas Tour', country: 'ITA', week: 9, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'hilly', stages: 7 },
    { id: 'pri', realName: "Milan–San Remo", name: 'Primavera Classic', country: 'ITA', week: 10, weeks: 1, kind: 'oneday', cls: 'MON', type: 'flat', km: 294, lateClimbs: 2 },
    { id: 'cat', realName: "Volta a Catalunya", name: 'Catalan Mountains Tour', country: 'ESP', week: 11, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'mountain', stages: 7 },
    { id: 'fcc', realName: "E3 Saxo Classic", name: 'Flemish Cobbles Classic', country: 'BEL', week: 12, weeks: 1, kind: 'oneday', cls: 'CL', type: 'cobbles', km: 208 },
    { id: 'tfh', realName: "Tour of Flanders", name: 'Tour of the Flemish Hills', country: 'BEL', week: 13, weeks: 1, kind: 'oneday', cls: 'MON', type: 'cobbles', km: 268 },
    { id: 'hon', realName: "Paris–Roubaix", name: 'Hell of the North', country: 'FRA', week: 14, weeks: 1, kind: 'oneday', cls: 'MON', type: 'cobbles', km: 258, flatCobbles: true },
    { id: 'lgr', realName: "Amstel Gold Race", name: 'Limburg Gold Race', country: 'NED', week: 15, weeks: 1, kind: 'oneday', cls: 'CL', type: 'hilly', km: 253 },
    { id: 'doy', realName: "Liège–Bastogne–Liège", name: 'La Doyenne', country: 'BEL', week: 16, weeks: 1, kind: 'oneday', cls: 'MON', type: 'hilly', km: 259 },
    { id: 'twa', realName: "Tour de Romandie", name: 'Tour of the Western Alps', country: 'SUI', week: 17, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'mountain', stages: 6 },
    { id: 'cro', realName: "Giro d'Italia", name: 'Corsa Rosa', country: 'ITA', week: 19, weeks: 3, kind: 'stage', cls: 'GT', pattern: 'gtB', stages: 21 },
    { id: 'cda', realName: "Tour Auvergne-Rhône-Alpes", name: 'Critérium des Alpes', country: 'FRA', week: 23, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'balanced', stages: 8 },
    { id: 'sst', realName: "Tour de Suisse", name: 'Swiss Summits Tour', country: 'SUI', week: 24, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'mountain', stages: 8 },
    { id: 'lgb', realName: "Tour de France", name: 'La Grande Boucle', country: 'FRA', week: 26, weeks: 3, kind: 'stage', cls: 'GT', pattern: 'gtA', stages: 21 },
    { id: 'bsc', realName: "Clásica San Sebastián", name: 'Basque Summer Classic', country: 'ESP', week: 30, weeks: 1, kind: 'oneday', cls: 'CL', type: 'hilly', km: 223 },
    { id: 'blt', realName: "Tour de Pologne", name: 'Baltic Tour', country: 'POL', week: 31, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'balanced', stages: 7 },
    { id: 'bnx', realName: "Renewi Tour", name: 'Benelux Tour', country: 'NED', week: 32, weeks: 1, kind: 'stage', cls: 'WT', pattern: 'flat', stages: 6 },
    { id: 'vds', realName: "Vuelta a España", name: 'Vuelta del Sol', country: 'ESP', week: 34, weeks: 3, kind: 'stage', cls: 'GT', pattern: 'gtC', stages: 21 },
    { id: 'mgp', realName: "Grand Prix Cycliste de Québec", name: 'Maple Grand Prix', country: 'CAN', week: 38, weeks: 1, kind: 'oneday', cls: 'CL', type: 'hilly', km: 221 },
    { id: 'pdc', realName: "Giro dell'Emilia", name: 'Piedmont Classic', country: 'ITA', week: 39, weeks: 1, kind: 'oneday', cls: 'CL', type: 'hilly', km: 196 },
    { id: 'rfl', realName: "Il Lombardia", name: 'Race of the Falling Leaves', country: 'ITA', week: 40, weeks: 1, kind: 'oneday', cls: 'MON', type: 'mountain', km: 252 },
  ];


  // IOC code -> [country name, ISO 3166 alpha-2] for flags of real riders from any nation
  const NAT_INFO = {
    UAE: ['United Arab Emirates', 'AE'], BRN: ['Bahrain', 'BH'], ALB: ['Albania', 'AL'], ALG: ['Algeria', 'DZ'], AND: ['Andorra', 'AD'], ARG: ['Argentina', 'AR'], AUS: ['Australia', 'AU'], AUT: ['Austria', 'AT'],
    AZE: ['Azerbaijan', 'AZ'], BEL: ['Belgium', 'BE'], BLR: ['Belarus', 'BY'], BRA: ['Brazil', 'BR'], BUL: ['Bulgaria', 'BG'], CAN: ['Canada', 'CA'],
    CHI: ['Chile', 'CL'], CHN: ['China', 'CN'], COL: ['Colombia', 'CO'], CRC: ['Costa Rica', 'CR'], CRO: ['Croatia', 'HR'], CZE: ['Czech Republic', 'CZ'],
    DEN: ['Denmark', 'DK'], ECU: ['Ecuador', 'EC'], ERI: ['Eritrea', 'ER'], ESP: ['Spain', 'ES'], EST: ['Estonia', 'EE'], ETH: ['Ethiopia', 'ET'],
    FIN: ['Finland', 'FI'], FRA: ['France', 'FR'], GBR: ['Great Britain', 'GB'], GER: ['Germany', 'DE'], GRE: ['Greece', 'GR'], HUN: ['Hungary', 'HU'],
    IRL: ['Ireland', 'IE'], ISR: ['Israel', 'IL'], ITA: ['Italy', 'IT'], JPN: ['Japan', 'JP'], KAZ: ['Kazakhstan', 'KZ'], KEN: ['Kenya', 'KE'],
    KOR: ['South Korea', 'KR'], LAT: ['Latvia', 'LV'], LTU: ['Lithuania', 'LT'], LUX: ['Luxembourg', 'LU'], MAR: ['Morocco', 'MA'], MEX: ['Mexico', 'MX'],
    MDA: ['Moldova', 'MD'], NED: ['Netherlands', 'NL'], NOR: ['Norway', 'NO'], NZL: ['New Zealand', 'NZ'], PAN: ['Panama', 'PA'], POL: ['Poland', 'PL'],
    POR: ['Portugal', 'PT'], PUR: ['Puerto Rico', 'PR'], ROU: ['Romania', 'RO'], RSA: ['South Africa', 'ZA'], RUS: ['Russia', 'RU'], RWA: ['Rwanda', 'RW'],
    SLO: ['Slovenia', 'SI'], SRB: ['Serbia', 'RS'], SUI: ['Switzerland', 'CH'], SVK: ['Slovakia', 'SK'], SWE: ['Sweden', 'SE'], THA: ['Thailand', 'TH'],
    TUR: ['Turkey', 'TR'], UKR: ['Ukraine', 'UA'], URU: ['Uruguay', 'UY'], USA: ['United States', 'US'], UZB: ['Uzbekistan', 'UZ'], VEN: ['Venezuela', 'VE'],
  };
  function natName(code) { return NATIONS[code] ? NATIONS[code].name : NAT_INFO[code] ? NAT_INFO[code][0] : code || 'Unknown'; }
  function natFlag(code) {
    if (NATIONS[code]) return NATIONS[code].flag;
    const iso = NAT_INFO[code] && NAT_INFO[code][1];
    return iso ? String.fromCodePoint(...[...iso].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🏳️';
  }

  const SEASON_WEEKS = 41;

  const UCI = {
    GT: { gc: [1100, 885, 750, 620, 520, 445, 370, 300, 250, 210, 180, 150, 140, 130, 120, 110, 95, 80, 70, 60], stage: [210, 150, 110, 90, 60, 50, 40, 30, 20, 10], jersey: [230, 130, 80] },
    WT: { gc: [500, 400, 325, 275, 225, 175, 150, 125, 100, 85, 70, 60, 50, 40, 35, 30, 25, 20, 15, 10], stage: [60, 25, 10, 8, 6, 4, 2, 1, 1, 1], jersey: [40, 20, 10] },
    PRO: { gc: [200, 150, 125, 100, 85, 70, 60, 50, 40, 35, 30, 25, 20, 15, 10], stage: [20, 15, 10, 6, 4, 2, 1], jersey: [15, 8, 4] },
    MON: { oneday: [800, 640, 520, 440, 360, 280, 220, 160, 110, 80, 70, 60, 50, 40, 35, 30, 25, 20, 15, 10] },
    CL: { oneday: [400, 320, 260, 220, 180, 140, 110, 80, 50, 30, 25, 20, 15, 12, 10, 8, 6, 4, 2, 1] },
  };
  const PRIZE_PER_POINT = 100; // euros per UCI point

  const STAGE_POINTS = {
    flat: [50, 30, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2],
    hilly: [30, 25, 22, 19, 17, 15, 13, 11, 9, 7, 6, 5, 4, 3, 2],
    cobbles: [30, 25, 22, 19, 17, 15, 13, 11, 9, 7, 6, 5, 4, 3, 2],
    mountain: [20, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    itt: [20, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  };
  const KOM_POINTS = { HC: [20, 15, 12, 10, 8, 6, 4, 2], 1: [10, 8, 6, 4, 2, 1], 2: [5, 3, 2, 1], 3: [2, 1], 4: [1] };

  const CLIMB_PREFIX = {
    FRA: ['Col du', 'Col de la', 'Côte de', 'Montée de'], ITA: ['Passo', 'Colle', 'Salita di', 'Monte'],
    ESP: ['Alto de', 'Puerto de', 'Alto del', 'Collado de'], SUI: ['Col du', 'Pass', 'Col de'],
    BEL: ['Côte de', 'Kapelmuur', 'Berg'], NED: ['Berg', 'Heuvel'], AUS: ['Mount', 'Hill'], POR: ['Alto de', 'Serra de'],
    POL: ['Przełęcz', 'Góra'], CAN: ['Côte', 'Mont'],
  };
  const CLIMB_NAMES = ['Aurelle', 'Vasset', 'Brenna', 'Castelbruno', 'Lavaure', 'Montchal', 'Perrière', 'Roccaforte', 'Sarenne', 'Valgrande',
    'Esterel', 'Fontval', 'Gavia Nuova', 'Istrana', 'Lusenta', 'Mirabel', 'Nevada Alta', 'Orsaire', 'Piancavallo', 'Quercia',
    'Rivabella', 'Soleil', 'Tourmalet Nord', 'Urbasa', 'Vallon', 'Zanetta', 'Belvedere', 'Crestaz', 'Doncières', 'Enchastray',
    'Ferriere', 'Grosseto', 'Hautacam Sud', 'Irati', 'Joux Plane Est', 'Kruisberg', 'Lagos', 'Madeleine Petite', 'Navacerrada Alta', 'Oude Kwaremont'];

  const ATTRS = [
    { k: 'fl', label: 'Flat', long: 'Flat' },
    { k: 'mo', label: 'MTN', long: 'Mountain' },
    { k: 'hi', label: 'HIL', long: 'Hills' },
    { k: 'tt', label: 'TT', long: 'Time trial' },
    { k: 'sp', label: 'SPR', long: 'Sprint' },
    { k: 'co', label: 'COB', long: 'Cobbles' },
    { k: 'st', label: 'STA', long: 'Stamina' },
    { k: 're', label: 'REC', long: 'Recovery' },
  ];

  const SPECIALTIES = {
    gc: { label: 'GC', long: 'GC rider' },
    climber: { label: 'Climber', long: 'Climber' },
    sprinter: { label: 'Sprinter', long: 'Sprinter' },
    puncheur: { label: 'Puncheur', long: 'Puncheur' },
    cobbles: { label: 'Classics', long: 'Cobbles specialist' },
    tt: { label: 'TT', long: 'Time trialist' },
    rouleur: { label: 'Rouleur', long: 'Rouleur / domestique' },
  };

  // offsets added to a base quality for each rider type
  const TEMPLATES = {
    gc: { fl: 0, mo: 5, hi: 2, tt: 3, sp: -12, co: -9, st: 4, re: 5 },
    climber: { fl: -3, mo: 6, hi: 2, tt: -5, sp: -12, co: -12, st: 3, re: 3 },
    sprinter: { fl: 3, mo: -14, hi: -6, tt: -6, sp: 8, co: -2, st: -2, re: 0 },
    puncheur: { fl: 0, mo: -3, hi: 6, tt: -4, sp: 1, co: -2, st: 0, re: 0 },
    cobbles: { fl: 4, mo: -12, hi: 1, tt: 0, sp: -1, co: 7, st: 2, re: 0 },
    tt: { fl: 4, mo: -5, hi: -3, tt: 7, sp: -6, co: -2, st: 1, re: 1 },
    rouleur: { fl: 4, mo: -3, hi: -2, tt: 0, sp: -5, co: 0, st: 3, re: 2 },
  };

  const TRAINING_FOCUS = {
    balanced: { label: 'Balanced', attrs: ['fl', 'mo', 'hi', 'tt', 'sp', 'co', 'st', 're'] },
    mountain: { label: 'Climbing', attrs: ['mo', 'st', 're'] },
    hills: { label: 'Hills', attrs: ['hi', 'mo', 'sp'] },
    tt: { label: 'Time trial', attrs: ['tt', 'fl'] },
    sprint: { label: 'Sprint', attrs: ['sp', 'fl'] },
    cobbles: { label: 'Cobbles', attrs: ['co', 'fl', 'st'] },
    endurance: { label: 'Endurance', attrs: ['st', 're', 'fl'] },
  };
  const TRAINING_LOAD = {
    rest: { label: 'Rest', form: 48, growth: 0, fatigue: 1.5 },
    normal: { label: 'Normal', form: 62, growth: 1, fatigue: 1 },
    intense: { label: 'Intense', form: 74, growth: 1.7, fatigue: 0.55 },
  };

  return { NATIONS, NAT_INFO, natName, natFlag, TEAMS, PATTERNS, CALENDAR, SEASON_WEEKS, UCI, PRIZE_PER_POINT, STAGE_POINTS, KOM_POINTS,
    CLIMB_PREFIX, CLIMB_NAMES, ATTRS, SPECIALTIES, TEMPLATES, TRAINING_FOCUS, TRAINING_LOAD };
})();
