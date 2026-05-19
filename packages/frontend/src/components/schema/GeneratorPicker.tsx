import { useState, useMemo } from 'react';
import { Check, X, Wand2, Globe } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ColumnDataType, GeneratorConfig } from '../../types/index.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GeneratorOption {
  type: ColumnDataType;
  label: string;
  description: string;
  icon: string;
  defaultConfig: GeneratorConfig;
}

interface FakerMapping {
  fn: string;
  label: string;
  description: string;
}

interface FakerGroup {
  group: string;
  items: FakerMapping[];
}

// ─── Available types ───────────────────────────────────────────────────────────

const GENERATORS: GeneratorOption[] = [
  { type: 'string',   label: 'String',   description: 'Text — Faker or pattern',       icon: 'Aa', defaultConfig: { minLength: 5, maxLength: 20 } },
  { type: 'integer',  label: 'Integer',  description: 'Integers in a range',            icon: '#',  defaultConfig: { min: 1, max: 9999 } },
  { type: 'float',    label: 'Float',    description: 'Decimal numbers',                 icon: '~',  defaultConfig: { min: 0, max: 9999, precision: 2 } },
  { type: 'uuid',     label: 'UUID',     description: 'UUID v4',                         icon: '🔑', defaultConfig: {} },
  { type: 'email',    label: 'Email',    description: 'Valid email address',             icon: '@',  defaultConfig: {} },
  { type: 'phone',    label: 'Phone',    description: 'Phone number',                    icon: '☎',  defaultConfig: {} },
  { type: 'url',      label: 'URL',      description: 'HTTP/S URL',                      icon: '🔗', defaultConfig: {} },
  { type: 'boolean',  label: 'Boolean',  description: 'true / false',                    icon: '⚡', defaultConfig: {} },
  { type: 'date',     label: 'Date',     description: 'ISO date (YYYY-MM-DD)',            icon: '📅', defaultConfig: { dateFrom: '2020-01-01', dateTo: '2025-12-31' } },
  { type: 'datetime', label: 'Datetime', description: 'ISO datetime',                    icon: '🕐', defaultConfig: { dateFrom: '2020-01-01', dateTo: '2025-12-31' } },
  { type: 'enum',     label: 'Enum',     description: 'Pick from a fixed list',          icon: '≡',  defaultConfig: { enumValues: ['active', 'inactive'] } },
  { type: 'regex',    label: 'Regex',    description: 'Match a pattern',                 icon: '.*', defaultConfig: { pattern: '[A-Z]{2}[0-9]{4}' } },
];

// ─── Faker mappings per type (grouped) ────────────────────────────────────────

const STRING_FAKER_GROUPS: FakerGroup[] = [
  {
    group: 'Person',
    items: [
      { fn: 'person.fullName',    label: 'Full Name',       description: 'First and last name' },
      { fn: 'person.firstName',   label: 'First Name',      description: 'Given name' },
      { fn: 'person.lastName',    label: 'Last Name',       description: 'Family name' },
      { fn: 'person.middleName',  label: 'Middle Name',     description: 'Middle name' },
      { fn: 'person.prefix',      label: 'Prefix',          description: 'Mr., Mrs., Dr.' },
      { fn: 'person.suffix',      label: 'Suffix',          description: 'Jr., Sr., PhD' },
      { fn: 'person.bio',         label: 'Bio',             description: 'Short biography' },
      { fn: 'person.gender',      label: 'Gender',          description: 'Gender label' },
      { fn: 'person.jobTitle',    label: 'Job Title',       description: 'e.g. Senior Engineer' },
      { fn: 'person.jobArea',     label: 'Job Area',        description: 'e.g. Infrastructure' },
      { fn: 'person.jobType',     label: 'Job Type',        description: 'e.g. Coordinator' },
      { fn: 'person.zodiacSign',  label: 'Zodiac Sign',     description: 'e.g. Gemini' },
    ],
  },
  {
    group: 'Internet',
    items: [
      { fn: 'internet.username',    label: 'Username',        description: 'e.g. john_doe42' },
      { fn: 'internet.displayName', label: 'Display Name',    description: 'Public display name' },
      { fn: 'internet.email',       label: 'Email',           description: 'user@example.com' },
      { fn: 'internet.domainName',  label: 'Domain Name',     description: 'e.g. example.com' },
      { fn: 'internet.domainWord',  label: 'Domain Word',     description: 'e.g. acme' },
      { fn: 'internet.url',         label: 'URL',             description: 'https://example.com/...' },
      { fn: 'internet.ip',          label: 'IP v4',           description: 'e.g. 192.168.1.1' },
      { fn: 'internet.ipv6',        label: 'IP v6',           description: 'Full IPv6 address' },
      { fn: 'internet.mac',         label: 'MAC Address',     description: 'Network MAC address' },
      { fn: 'internet.userAgent',   label: 'User Agent',      description: 'Browser UA string' },
      { fn: 'internet.password',    label: 'Password',        description: 'Random password' },
      { fn: 'internet.emoji',       label: 'Emoji',           description: 'Random emoji 🎉' },
      { fn: 'internet.httpMethod',  label: 'HTTP Method',     description: 'GET, POST, PUT...' },
    ],
  },
  {
    group: 'Location',
    items: [
      { fn: 'location.streetAddress', label: 'Street Address', description: 'e.g. 123 Main St' },
      { fn: 'location.buildingNumber',label: 'Building No.',   description: 'e.g. 42B' },
      { fn: 'location.street',         label: 'Street Name',   description: 'No number' },
      { fn: 'location.city',           label: 'City',          description: 'e.g. New York' },
      { fn: 'location.county',         label: 'County',        description: 'e.g. Suffolk' },
      { fn: 'location.state',          label: 'State / Province', description: 'e.g. California' },
      { fn: 'location.country',        label: 'Country',       description: 'e.g. United States' },
      { fn: 'location.countryCode',    label: 'Country Code',  description: 'e.g. US' },
      { fn: 'location.zipCode',        label: 'Zip / Postal',  description: 'e.g. 10001' },
      { fn: 'location.timeZone',       label: 'Time Zone',     description: 'e.g. America/New_York' },
      { fn: 'location.direction',      label: 'Direction',     description: 'N, NE, South...' },
    ],
  },
  {
    group: 'Company & Commerce',
    items: [
      { fn: 'company.name',             label: 'Company Name',    description: 'e.g. Acme Corp' },
      { fn: 'company.catchPhrase',      label: 'Catch Phrase',    description: 'Marketing slogan' },
      { fn: 'company.buzzNoun',         label: 'Buzz Noun',       description: 'e.g. paradigm' },
      { fn: 'company.buzzVerb',         label: 'Buzz Verb',       description: 'e.g. leverage' },
      { fn: 'company.buzzAdjective',    label: 'Buzz Adjective',  description: 'e.g. scalable' },
      { fn: 'commerce.productName',     label: 'Product Name',    description: 'e.g. Ergonomic Chair' },
      { fn: 'commerce.product',         label: 'Product Type',    description: 'e.g. Shirt' },
      { fn: 'commerce.productAdjective',label: 'Product Adjective',description: 'e.g. Handmade' },
      { fn: 'commerce.productMaterial', label: 'Product Material',description: 'e.g. Granite' },
      { fn: 'commerce.department',      label: 'Department',      description: 'e.g. Electronics' },
      { fn: 'commerce.isbn',            label: 'ISBN',            description: 'Book ISBN' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { fn: 'finance.accountNumber',   label: 'Account Number',   description: 'Bank account no.' },
      { fn: 'finance.accountName',     label: 'Account Name',     description: 'e.g. Savings' },
      { fn: 'finance.routingNumber',   label: 'Routing Number',   description: 'ABA routing no.' },
      { fn: 'finance.creditCardNumber',label: 'Credit Card No.',  description: 'Card number' },
      { fn: 'finance.creditCardCVV',   label: 'CVV',              description: '3-4 digit CVV' },
      { fn: 'finance.iban',            label: 'IBAN',             description: 'International bank account' },
      { fn: 'finance.bic',             label: 'BIC / SWIFT',      description: 'Bank identifier' },
      { fn: 'finance.currency',        label: 'Currency Code',    description: 'e.g. USD, EUR' },
      { fn: 'finance.currencyName',    label: 'Currency Name',    description: 'e.g. US Dollar' },
      { fn: 'finance.transactionDescription', label: 'Transaction', description: 'Payment memo' },
      { fn: 'finance.bitcoinAddress',  label: 'Bitcoin Address',  description: 'BTC wallet address' },
      { fn: 'finance.ethereumAddress', label: 'Ethereum Address', description: 'ETH wallet' },
      { fn: 'finance.pin',             label: 'PIN',              description: '4-digit PIN' },
    ],
  },
  {
    group: 'Text / Lorem',
    items: [
      { fn: 'lorem.word',      label: 'Word',      description: 'Single word' },
      { fn: 'lorem.words',     label: 'Few Words', description: '3 lorem words' },
      { fn: 'lorem.slug',      label: 'Slug',      description: 'url-safe-slug' },
      { fn: 'lorem.sentence',  label: 'Sentence',  description: 'One sentence' },
      { fn: 'lorem.sentences', label: 'Sentences', description: 'Two sentences' },
      { fn: 'lorem.paragraph', label: 'Paragraph', description: 'Full paragraph' },
      { fn: 'lorem.text',      label: 'Text',      description: 'Multi-paragraph' },
      { fn: 'word.adjective',  label: 'Adjective', description: 'e.g. important' },
      { fn: 'word.adverb',     label: 'Adverb',    description: 'e.g. quickly' },
      { fn: 'word.noun',       label: 'Noun',      description: 'e.g. table' },
      { fn: 'word.verb',       label: 'Verb',      description: 'e.g. run' },
    ],
  },
  {
    group: 'Science & Tech',
    items: [
      { fn: 'science.chemicalElement', label: 'Chemical Element', description: 'e.g. Hydrogen' },
      { fn: 'science.unit',            label: 'SI Unit',          description: 'e.g. kilogram' },
      { fn: 'hacker.abbreviation',     label: 'Tech Abbreviation',description: 'e.g. HTTP' },
      { fn: 'hacker.adjective',        label: 'Tech Adjective',   description: 'e.g. digital' },
      { fn: 'hacker.noun',             label: 'Tech Noun',        description: 'e.g. firewall' },
      { fn: 'hacker.phrase',           label: 'Tech Phrase',      description: 'Full hacker phrase' },
      { fn: 'git.branch',              label: 'Git Branch',       description: 'e.g. feature/login' },
      { fn: 'git.commitMessage',       label: 'Commit Message',   description: 'Git commit msg' },
      { fn: 'git.commitSha',           label: 'Commit SHA',       description: '40-char SHA' },
    ],
  },
  {
    group: 'System & Files',
    items: [
      { fn: 'system.fileName',      label: 'File Name',     description: 'e.g. report.csv' },
      { fn: 'system.fileExt',       label: 'File Extension',description: 'e.g. .pdf' },
      { fn: 'system.mimeType',      label: 'MIME Type',     description: 'e.g. image/png' },
      { fn: 'system.semver',        label: 'Semver',        description: 'e.g. 2.4.1' },
      { fn: 'system.directoryPath', label: 'Directory Path',description: '/usr/local/...' },
    ],
  },
  {
    group: 'Misc',
    items: [
      { fn: 'color.human',        label: 'Color Name',    description: 'e.g. coral, teal' },
      { fn: 'color.rgb',          label: 'RGB Hex',       description: 'e.g. #a1b2c3' },
      { fn: 'music.genre',        label: 'Music Genre',   description: 'e.g. Jazz, Rock' },
      { fn: 'music.songName',     label: 'Song Name',     description: 'e.g. "Blue Skies"' },
      { fn: 'vehicle.vehicle',    label: 'Vehicle',       description: 'e.g. Toyota Corolla' },
      { fn: 'vehicle.manufacturer',label: 'Car Brand',    description: 'e.g. BMW' },
      { fn: 'vehicle.model',      label: 'Car Model',     description: 'e.g. Mustang' },
      { fn: 'vehicle.type',       label: 'Vehicle Type',  description: 'e.g. Minivan' },
      { fn: 'vehicle.fuel',       label: 'Fuel Type',     description: 'e.g. Electric' },
      { fn: 'vehicle.vin',        label: 'VIN',           description: 'Vehicle ID number' },
      { fn: 'animal.dog',         label: 'Dog Breed',     description: 'e.g. Labrador' },
      { fn: 'animal.cat',         label: 'Cat Breed',     description: 'e.g. Siamese' },
      { fn: 'animal.bird',        label: 'Bird',          description: 'e.g. Parrot' },
      { fn: 'animal.fish',        label: 'Fish',          description: 'e.g. Salmon' },
      { fn: 'animal.type',        label: 'Animal Type',   description: 'e.g. Mammal' },
      { fn: 'airline.flightNumber',label: 'Flight No.',   description: 'e.g. AA1234' },
      { fn: 'airline.airline',     label: 'Airline',      description: 'e.g. American Airlines' },
      { fn: 'airline.airport',     label: 'Airport',      description: 'e.g. JFK' },
      { fn: 'airline.seat',        label: 'Seat',         description: 'e.g. 14C' },
      { fn: 'date.month',          label: 'Month Name',   description: 'e.g. January' },
      { fn: 'date.weekday',        label: 'Weekday',      description: 'e.g. Monday' },
      { fn: 'phone.imei',          label: 'IMEI',         description: 'Device IMEI' },
    ],
  },
  {
    group: '✨ Rich Text (AI-feel)',
    items: [
      { fn: 'rich.bio',                label: 'Personal Bio',        description: '2-3 sentence bio: role + company + hobby' },
      { fn: 'rich.productDescription', label: 'Product Description', description: 'Marketing copy with material + use-case' },
      { fn: 'rich.review',             label: 'Product Review',      description: '★-rated review with sentiment' },
      { fn: 'rich.supportTicket',      label: 'Support Ticket',      description: 'Realistic complaint subject + body' },
      { fn: 'rich.companyAbout',       label: 'Company "About"',     description: '3-sentence company description' },
      { fn: 'rich.tagline',            label: 'Marketing Tagline',   description: 'Short brand tagline' },
      { fn: 'rich.tweet',              label: 'Social Post',         description: '< 280 chars w/ optional @ and #' },
      { fn: 'rich.addressFull',        label: 'Full Address',        description: 'Multi-line: street + apt + city + zip + country' },
    ],
  },
  {
    group: '👤 Persona (coherent per row)',
    items: [
      { fn: 'persona.fullName',      label: 'Persona · Full Name',  description: 'Same person as other persona.* cols in same group' },
      { fn: 'persona.firstName',     label: 'Persona · First Name', description: 'Coherent with persona.lastName' },
      { fn: 'persona.lastName',      label: 'Persona · Last Name',  description: 'Coherent with persona.firstName' },
      { fn: 'persona.email',         label: 'Persona · Email',      description: 'Email derived from name (alice.zhang@…)' },
      { fn: 'persona.username',      label: 'Persona · Username',   description: 'Handle derived from name' },
      { fn: 'persona.phone',         label: 'Persona · Phone',      description: 'Phone for the same person' },
      { fn: 'persona.birthdate',     label: 'Persona · Birthdate',  description: 'YYYY-MM-DD, age 21-65' },
      { fn: 'persona.age',           label: 'Persona · Age',        description: 'Matches birthdate' },
      { fn: 'persona.jobTitle',      label: 'Persona · Job Title',  description: 'Coherent with company' },
      { fn: 'persona.company',       label: 'Persona · Company',    description: 'Same company as job title' },
      { fn: 'persona.city',          label: 'Persona · City',       description: 'Coherent with state/country' },
      { fn: 'persona.state',         label: 'Persona · State',      description: 'Coherent with city' },
      { fn: 'persona.country',       label: 'Persona · Country',    description: 'Coherent with city/state' },
      { fn: 'persona.postalCode',    label: 'Persona · Postal Code',description: 'Same locale as address' },
      { fn: 'persona.streetAddress', label: 'Persona · Street',     description: 'Same locale as city' },
      { fn: 'persona.avatarUrl',     label: 'Persona · Avatar URL', description: 'Dicebear seeded by persona' },
      { fn: 'persona.bio',           label: 'Persona · Bio',        description: 'Bio mentioning their job and city' },
    ],
  },
];

const FLOAT_FAKER_GROUPS: FakerGroup[] = [
  {
    group: 'Finance',
    items: [
      { fn: 'commerce.price',   label: 'Product Price',  description: 'Retail price' },
      { fn: 'finance.amount',   label: 'Finance Amount', description: 'Financial value' },
    ],
  },
  {
    group: 'Geo',
    items: [
      { fn: 'location.latitude',  label: 'Latitude',  description: '-90 to 90' },
      { fn: 'location.longitude', label: 'Longitude', description: '-180 to 180' },
    ],
  },
];

const FAKER_GROUPS_BY_TYPE: Partial<Record<ColumnDataType, FakerGroup[]>> = {
  string: STRING_FAKER_GROUPS,
  float:  FLOAT_FAKER_GROUPS,
};

// Flat lookup for label resolution
const ALL_FAKER_ITEMS: FakerMapping[] = [
  ...STRING_FAKER_GROUPS.flatMap(g => g.items),
  ...FLOAT_FAKER_GROUPS.flatMap(g => g.items),
];

// ─── Locale options ────────────────────────────────────────────────────────────

interface LocaleOption {
  value: string;
  label: string;
  flag: string;
}

const LOCALE_GROUPS: { group: string; locales: LocaleOption[] }[] = [
  {
    group: 'Locales',
    locales: [
      { value: 'en_US', label: 'English (US)', flag: '🇺🇸' },
      { value: 'fr',    label: 'French',       flag: '🇫🇷' },
      { value: 'de',    label: 'German',       flag: '🇩🇪' },
      { value: 'es',    label: 'Spanish',      flag: '🇪🇸' },
      { value: 'da',    label: 'Danish',       flag: '🇩🇰' },
      { value: 'vi',    label: 'Vietnamese',   flag: '🇻🇳' },
      { value: 'ja',    label: 'Japanese',     flag: '🇯🇵' },
    ],
  },
];

// Semantic auto-detect: column name → fakerFn (mirrors backend SEMANTIC_MAP)
const COLUMN_NAME_TO_FAKER: Record<string, string> = {
  fullname: 'person.fullName', name: 'person.fullName', displayname: 'person.fullName', realname: 'person.fullName',
  firstname: 'person.firstName', givenname: 'person.firstName', fname: 'person.firstName',
  lastname: 'person.lastName', surname: 'person.lastName', familyname: 'person.lastName', lname: 'person.lastName',
  username: 'internet.username', login: 'internet.username', handle: 'internet.username', nickname: 'internet.username',
  address: 'location.streetAddress', streetaddress: 'location.streetAddress', fulladdress: 'location.streetAddress', street: 'location.streetAddress',
  city: 'location.city', town: 'location.city',
  state: 'location.state', province: 'location.state', region: 'location.state',
  country: 'location.country',
  countrycode: 'location.countryCode',
  zip: 'location.zipCode', zipcode: 'location.zipCode', postalcode: 'location.zipCode', postcode: 'location.zipCode',
  company: 'company.name', companyname: 'company.name', organisation: 'company.name', organization: 'company.name',
  jobtitle: 'person.jobTitle', position: 'person.jobTitle', occupation: 'person.jobTitle',
  department: 'commerce.department', division: 'commerce.department', team: 'commerce.department',
  product: 'commerce.productName', productname: 'commerce.productName', item: 'commerce.productName',
  description: 'lorem.sentence', bio: 'lorem.sentence', about: 'lorem.sentence', summary: 'lorem.sentence',
  color: 'color.human', colour: 'color.human',
  currency: 'finance.currency',
  ip: 'internet.ip', ipaddress: 'internet.ip', ipv4: 'internet.ip',
  ipv6: 'internet.ipv6',
  useragent: 'internet.userAgent',
  password: 'internet.password',
  genre: 'music.genre',
  filename: 'system.fileName',
  slug: 'lorem.slug',
};

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectDefaultFakerFn(columnName: string): string | undefined {
  return COLUMN_NAME_TO_FAKER[normalizeName(columnName)];
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  current: ColumnDataType;
  currentFakerFn?: string;
  currentLocale?: string;
  currentPersonaGroup?: string;
  columnName: string;
  onSelect: (type: ColumnDataType, config: GeneratorConfig) => void;
  onClose: () => void;
}

type TabId = 'mapping' | 'locale';

export function GeneratorPicker({ current, currentFakerFn, currentLocale, currentPersonaGroup, columnName, onSelect, onClose }: Props) {
  const [selectedType, setSelectedType] = useState<ColumnDataType>(current);
  const [selectedLocale, setSelectedLocale] = useState<string>(currentLocale ?? 'en_US');
  const [activeTab, setActiveTab] = useState<TabId>('mapping');
  const [personaGroup, setPersonaGroup] = useState<string>(currentPersonaGroup ?? 'default');

  const groups = FAKER_GROUPS_BY_TYPE[selectedType];
  const autoFn = useMemo(() => detectDefaultFakerFn(columnName), [columnName]);

  const [selectedFn, setSelectedFn] = useState<string | undefined>(
    currentFakerFn ?? (selectedType === 'string' || selectedType === 'float' ? autoFn : undefined),
  );

  const isPersonaFn = selectedFn?.startsWith('persona.');

  function handleTypeSelect(type: ColumnDataType) {
    setSelectedType(type);
    const newGroups = FAKER_GROUPS_BY_TYPE[type];
    setSelectedFn(newGroups ? detectDefaultFakerFn(columnName) : undefined);
  }

  function handleApply() {
    const gen = GENERATORS.find(g => g.type === selectedType)!;
    const config: GeneratorConfig = { ...gen.defaultConfig };
    if (selectedFn) config.fakerFn = selectedFn;
    if (selectedLocale && selectedLocale !== 'en_US') config.locale = selectedLocale;
    if (selectedFn?.startsWith('persona.') && personaGroup.trim()) {
      config.personaGroup = personaGroup.trim();
    }
    onSelect(selectedType, config);
    onClose();
  }

  const selectedMappingLabel = ALL_FAKER_ITEMS.find(m => m.fn === selectedFn)?.label;
  const selectedLocaleOption = LOCALE_GROUPS.flatMap(g => g.locales).find(l => l.value === selectedLocale);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant shrink-0">
          <h3 className="font-semibold text-sm">Data Generator</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Type grid */}
          <div className="p-4 pb-3">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2.5">Type</p>
            <div className="grid grid-cols-6 gap-1.5">
              {GENERATORS.map(g => (
                <button
                  key={g.type}
                  onClick={() => handleTypeSelect(g.type)}
                  title={g.description}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border py-2 px-1 text-center transition-colors',
                    selectedType === g.type
                      ? 'border-primary bg-primary/10'
                      : 'border-outline-variant hover:border-primary/40 text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <span className="text-sm font-mono leading-none">{g.icon}</span>
                  <span className="text-[11px] font-medium text-on-surface">{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tabs: Mapping | Locale */}
          <div className="flex border-b border-outline-variant/60 px-4 gap-4 shrink-0">
            <button
              onClick={() => setActiveTab('mapping')}
              className={cn(
                'flex items-center gap-1.5 text-xs pb-2 border-b-2 transition-colors',
                activeTab === 'mapping'
                  ? 'border-primary text-on-surface font-medium'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Wand2 className="w-3 h-3" /> Faker Mapping
            </button>
            <button
              onClick={() => setActiveTab('locale')}
              className={cn(
                'flex items-center gap-1.5 text-xs pb-2 border-b-2 transition-colors',
                activeTab === 'locale'
                  ? 'border-primary text-on-surface font-medium'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Globe className="w-3 h-3" /> Locale
              {selectedLocale !== 'en_US' && (
                <span className="ml-1 text-primary">{selectedLocaleOption?.flag}</span>
              )}
            </button>
          </div>

          {/* Tab: Faker Mapping */}
          {activeTab === 'mapping' && (
            <div className="p-4 space-y-4">
              {!groups ? (
                <p className="text-xs text-on-surface-variant text-center py-4">
                  This type has no Faker mapping — values are generated from config settings.
                </p>
              ) : (
                <>
                  {/* None / Random option */}
                  <button
                    onClick={() => setSelectedFn(undefined)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors w-full',
                      selectedFn === undefined
                        ? 'border-primary bg-primary/10'
                        : 'border-outline-variant hover:border-primary/40 text-on-surface-variant',
                    )}
                  >
                    {selectedFn === undefined && <Check className="w-3 h-3 text-primary shrink-0" />}
                    <div>
                      <span className="font-medium text-on-surface">Random / None</span>
                      <span className="text-on-surface-variant ml-2">Use semantic column-name detection or random fallback</span>
                    </div>
                  </button>

                  {groups.map(group => (
                    <div key={group.group}>
                      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                        {group.group}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {group.items.map(m => (
                          <button
                            key={m.fn}
                            onClick={() => setSelectedFn(m.fn)}
                            className={cn(
                              'flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors text-xs',
                              selectedFn === m.fn
                                ? 'border-primary bg-primary/10'
                                : 'border-outline-variant hover:border-primary/40 text-on-surface-variant hover:text-on-surface',
                              autoFn === m.fn && selectedFn !== m.fn && 'border-primary/25',
                            )}
                          >
                            <div className="flex items-center justify-between w-full gap-1">
                              <span className="font-medium text-on-surface truncate">{m.label}</span>
                              {selectedFn === m.fn && <Check className="w-3 h-3 text-primary shrink-0" />}
                              {autoFn === m.fn && selectedFn !== m.fn && (
                                <span className="text-primary/60 text-[10px] shrink-0">auto</span>
                              )}
                            </div>
                            <span className="text-on-surface-variant leading-tight line-clamp-1">{m.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Tab: Locale */}
          {activeTab === 'locale' && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-on-surface-variant">
                Locale affects name, address, phone, and other region-specific Faker output.
              </p>
              {LOCALE_GROUPS.map(group => (
                <div key={group.group}>
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                    {group.group}
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {group.locales.map(loc => (
                      <button
                        key={loc.value}
                        onClick={() => setSelectedLocale(loc.value)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors',
                          selectedLocale === loc.value
                            ? 'border-primary bg-primary/10'
                            : 'border-outline-variant hover:border-primary/40 text-on-surface-variant hover:text-on-surface',
                        )}
                      >
                        <span>{loc.flag}</span>
                        <span className="truncate">{loc.label}</span>
                        {selectedLocale === loc.value && <Check className="w-3 h-3 text-primary shrink-0 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Persona Group input — only shown when a persona.* fn is selected */}
        {isPersonaFn && (
          <div className="px-4 py-3 border-t border-outline-variant bg-surface-container-high/30 shrink-0">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider block mb-1.5">
              Persona Group
            </label>
            <input
              type="text"
              value={personaGroup}
              onChange={e => setPersonaGroup(e.target.value)}
              placeholder="e.g. customer, employee, default"
              className="w-full bg-surface border border-outline-variant rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[11px] text-on-surface-variant mt-1.5">
              All <code className="font-mono">persona.*</code> columns sharing this group will reference the same person per row.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-outline-variant flex items-center justify-between shrink-0">
          <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
            <span className="font-mono text-primary">{selectedType}</span>
            {selectedMappingLabel && <><span>→</span><span className="text-on-surface">{selectedMappingLabel}</span></>}
            {selectedLocale !== 'en_US' && (
              <span className="ml-1 text-primary/80">{selectedLocaleOption?.flag} {selectedLocaleOption?.label}</span>
            )}
            {isPersonaFn && (
              <span className="ml-1 text-primary/80">👤 {personaGroup}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm border border-outline-variant rounded-md hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 text-sm bg-primary text-on-primary-fixed rounded-md hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper exports ────────────────────────────────────────────────────────────

export function getFakerMappingLabel(fn: string): string | undefined {
  return ALL_FAKER_ITEMS.find(m => m.fn === fn)?.label;
}

const LOCALE_FLAG_MAP = new Map<string, string>(
  LOCALE_GROUPS.flatMap(g => g.locales.map(l => [l.value, l.flag] as [string, string]))
);

export function LOCALE_FLAG(locale: string): string {
  return LOCALE_FLAG_MAP.get(locale) ?? '🌐';
}
