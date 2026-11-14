const GLOSSARY = [
  {
    term: 'Skyline',
    text: 'The local horizon formed by hills and crater rims around the site, computed from LRO laser altimetry (LOLA). On the Moon there is no atmosphere, so the skyline is perfectly sharp.',
  },
  {
    term: 'Elevation',
    text: 'Angle of the Sun or Earth above the horizontal plane at the site. Near the poles the Sun never climbs more than a few degrees.',
  },
  {
    term: 'Lunar day',
    text: 'About 29.5 Earth days from one sunrise to the next. Near the equator that means roughly two weeks of light and two weeks of night.',
  },
  {
    term: 'Earthset',
    text: 'The Earth dipping below the skyline. Without the Earth in view, a lander needs a relay satellite to send data home.',
  },
  {
    term: 'Libration',
    text: 'A slow wobble of the Moon as seen from Earth. It makes the Earth drift a few degrees up and down in the lunar sky over a month, which matters a lot at the poles.',
  },
  {
    term: 'Why the poles?',
    text: 'Permanently shadowed craters near the poles are thought to hold water ice, while nearby peaks and ridges get sunlight most of the time. Small shifts in place or date change everything.',
  },
]

const SOURCES = [
  {
    name: 'JPL Horizons',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    what: 'Sun and Earth positions',
  },
  {
    name: 'LRO LOLA polar DEM',
    url: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/',
    what: 'terrain and skylines',
  },
  {
    name: 'IAU / USGS Gazetteer',
    url: 'https://planetarynames.wr.usgs.gov/',
    what: 'feature and landing coordinates',
  },
  { name: 'LROC', url: 'https://www.lroc.asu.edu/', what: 'landing site imagery' },
  {
    name: 'NASA SVS CGI Moon Kit',
    url: 'https://svs.gsfc.nasa.gov/4720',
    what: 'globe colour and relief maps',
  },
]

export function AppFooter() {
  return (
    <footer className="footer">
      <details className="glossary">
        <summary>How to read this planner</summary>
        <dl>
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.text}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="sources">
        Data:{' '}
        {SOURCES.map((s, i) => (
          <span key={s.name}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>{' '}
            ({s.what}){i < SOURCES.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>
      <p className="muted small">
        Built for the NASA Space Apps Challenge. Not an official NASA product.
      </p>
    </footer>
  )
}
