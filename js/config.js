// Sve što vlasnik mijenja nalazi se ovdje. Vrijednosti označene s PROVJERI su primjeri.
window.CHARTER = {
  brand: {
    name: 'Jukić Charter',           // PROVJERI: ime firme
    phone: '+385 91 000 0000',        // PROVJERI
    whatsapp: '385910000000',         // PROVJERI: broj bez + i razmaka
    email: 'info@example.com',        // PROVJERI
    siteUrl: 'https://www.example.com', // PROVJERI: za SEO i dijeljenje
    address: 'Marina Kornati, Biograd na Moru', // PROVJERI: točan vez
  },

  boat: {
    model: 'Jeanneau Merry Fisher 795',
    // PROVJERI sve brojke prema svom brodu i dokumentima.
    maxGuests: 8,
    engine: 'Izvanbrodski motor 200 KS',
    lengthM: 7.7,
    fuelTankL: 200,
    features: ['Kabina s ležajem za dvoje', 'WC', 'Bimini tenda', 'Tuš na krmi', 'Ljestve za kupanje', 'Hladnjak'],
  },

  // Polazna točka svih ruta (vez u Biogradu).
  home: { id: 'home', name: 'Biograd na Moru', lat: 43.9395, lon: 15.4425 },

  // Model potrošnje za MF 795 s jednim izvanbrodskim motorom od 200 KS.
  // Brojke su procjena iz tipičnih mjerenja za brodove ~2,5 t; podesi prema svom motoru.
  speeds: [
    { id: 'eco',    label: { hr: 'Štedljivo', en: 'Economy' }, kn: 6,  lph: 5 },
    { id: 'cruise', label: { hr: 'Krstarenje', en: 'Cruise' }, kn: 20, lph: 34 },
    { id: 'fast',   label: { hr: 'Brzo', en: 'Fast' },         kn: 26, lph: 50 },
  ],
  defaultSpeed: 'cruise',
  fuelPriceEur: 1.55,      // PROVJERI: cijena goriva na pumpi
  fuelReserve: 0.2,        // 20 % rezerve u procjeni

  // Pragovi upozorenja za mali brod s gostima koji nisu profesionalni skiperi.
  // MF 795 ima CE kategoriju C, ali gostima savjetujemo stroža ograničenja.
  safety: {
    windCaution: 12, windDanger: 18,     // čvorovi, srednji vjetar
    gustCaution: 18, gustDanger: 25,     // čvorovi, udari
    waveCaution: 0.5, waveDanger: 1.0,   // metri, značajna visina vala
    buraGustDanger: 20,                  // bura je mahovita; ranije upozorenje
    jugoWindDanger: 15,                  // jugo diže valove; ranije upozorenje
  },

  weather: {
    // Open-Meteo: besplatni API (bez ključa) dopušten je SAMO za nekomercijalnu upotrebu.
    // Za komercijalnu stranicu upiši API ključ (plan "API Standard") pa se koriste customer-* adrese.
    apiKey: '',
    forecastUrl: 'https://api.open-meteo.com/v1/forecast',
    marineUrl: 'https://marine-api.open-meteo.com/v1/marine',
    customerForecastUrl: 'https://customer-api.open-meteo.com/v1/forecast',
    customerMarineUrl: 'https://customer-marine-api.open-meteo.com/v1/marine',
  },

  map: {
    style: 'https://tiles.openfreemap.org/styles/liberty',
    seamarkTiles: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    center: [15.34, 43.85],
    zoom: 9.3,
  },

  // Cijene, sezone, skiper, polog i način plaćanja su u data/booking.json (čita ih i server za Stripe).
};
