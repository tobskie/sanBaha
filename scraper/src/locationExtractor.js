// scraper/src/locationExtractor.js

// Lipa City barangays with approximate centroids [lat, lng]
const BARANGAYS = [
  { name: 'Lodlod',           coords: [13.9442, 121.1623] },
  { name: 'Marawoy',          coords: [13.9380, 121.1710] },
  { name: 'Sampaguita',       coords: [13.9350, 121.1580] },
  { name: 'Mataas na Lupa',   coords: [13.9530, 121.1640] },
  { name: 'Bagong Pook',      coords: [13.9290, 121.1550] },
  { name: 'Balintawak',       coords: [13.9310, 121.1490] },
  { name: 'Banaybanay',       coords: [13.9460, 121.1760] },
  { name: 'Bolbok',           coords: [13.9200, 121.1430] },
  { name: 'Bugtong na Pulo',  coords: [13.9600, 121.1800] },
  { name: 'Dagatan',          coords: [13.9180, 121.1380] },
  { name: 'Halang',           coords: [13.9330, 121.1470] },
  { name: 'Inosloban',        coords: [13.9270, 121.1620] },
  { name: 'Kayumanggi',       coords: [13.9400, 121.1530] },
  { name: 'Mabini',           coords: [13.9490, 121.1510] },
  { name: 'Malagonlong',      coords: [13.9360, 121.1680] },
  { name: 'Marauoy',          coords: [13.9380, 121.1710] },
  { name: 'Pinagkawitan',     coords: [13.9220, 121.1560] },
  { name: 'Plaridel',         coords: [13.9450, 121.1570] },
  { name: 'Poblacion Barangay 1', coords: [13.9411, 121.1589] },
  { name: 'Sabang',           coords: [13.9340, 121.1740] },
  { name: 'San Benito',       coords: [13.9560, 121.1720] },
  { name: 'San Carlos',       coords: [13.9470, 121.1660] },
  { name: 'San Jose',         coords: [13.9300, 121.1400] },
  { name: 'San Sebastian',    coords: [13.9420, 121.1500] },
  { name: 'Santo Niño',       coords: [13.9250, 121.1480] },
  { name: 'Sico',             coords: [13.9150, 121.1350] },
  { name: 'Tibig',            coords: [13.9490, 121.1590] },
  { name: 'Tulo',             coords: [13.9510, 121.1650] },
];

const LIPA_CENTER = { name: 'Lipa City', coordinates: [13.9411, 121.1589], matched: false };

/**
 * Scan text for a known Lipa barangay name.
 * Returns { name, coordinates, matched }.
 */
export function extractLocation(text) {
  if (!text) return LIPA_CENTER;
  const lower = text.toLowerCase();
  for (const b of BARANGAYS) {
    if (lower.includes(b.name.toLowerCase())) {
      return {
        name: `${b.name}, Lipa City`,
        coordinates: b.coords,
        matched: true,
      };
    }
  }
  return LIPA_CENTER;
}
