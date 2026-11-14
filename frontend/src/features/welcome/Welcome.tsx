import type { QuickStart } from './quickStarts'

const QUICK_STARTS: { id: QuickStart; title: string; text: string }[] = [
  {
    id: 'south-pole',
    title: 'The south pole, next lunar day',
    text: 'The Sun skims the horizon all month and hides behind mountains.',
  },
  {
    id: 'polar-trio',
    title: 'Three polar sites side by side',
    text: 'South Pole, Mons Malapert and IM-1 on the same dates: who gets light, who sees Earth?',
  },
  {
    id: 'apollo-11',
    title: 'Apollo 11 for contrast',
    text: 'Near the equator: two weeks of high Sun, then two weeks of night. Earth hangs almost still.',
  },
]

interface Props {
  onQuickStart: (id: QuickStart) => void
  disabled: boolean
}

export function Welcome({ onQuickStart, disabled }: Props) {
  return (
    <section className="panel welcome">
      <h2 className="welcome-title">Where and when can a lander get power and talk to Earth?</h2>
      <p className="welcome-text">
        Pick a landing site and dates on the left. The planner asks JPL Horizons where the Sun and
        the Earth are in the site’s sky, checks them against the real skyline from LRO laser
        altimetry near the south pole, and shows how long a lander has light and a direct radio link
        to Earth.
      </p>
      <p className="welcome-text muted">Or start with one of these:</p>
      <div className="quick-starts">
        {QUICK_STARTS.map((q) => (
          <button
            key={q.id}
            type="button"
            className="quick-start"
            disabled={disabled}
            onClick={() => onQuickStart(q.id)}
          >
            <span className="quick-start-title">{q.title}</span>
            <span className="quick-start-text">{q.text}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
