const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 30;
const TOP = 16;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

// GitHub-style contribution calendar. `calendar.weeks` is a list of weeks, each a list of [date, count].
export default function Heatmap({ calendar }) {
  const weeks = calendar.weeks.filter((w) => w.length > 0);
  const max = Math.max(1, ...weeks.flat().map((d) => d[1]));
  const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const width = LEFT + weeks.length * STEP;
  const height = TOP + 7 * STEP;

  let lastMonth = -1;
  const monthLabels = [];
  weeks.forEach((w, i) => {
    const m = Number(w[0][0].slice(5, 7)) - 1;
    if (m !== lastMonth) {
      // skip a label that would collide with the previous one
      if (i === 0 || i - (monthLabels.at(-1)?.i ?? -99) >= 3) monthLabels.push({ i, m });
      lastMonth = m;
    }
  });

  return (
    <div className="hm-scroll">
      <svg
        className="hm"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${calendar.total} contributions in the last year`}
      >
        {monthLabels.map(({ i, m }) => (
          <text key={i} x={LEFT + i * STEP} y={10} className="hm-t">{MONTHS[m]}</text>
        ))}
        {Object.entries(DAY_LABELS).map(([row, label]) => (
          <text key={label} x={0} y={TOP + Number(row) * STEP + 9} className="hm-t">{label}</text>
        ))}
        {weeks.map((w, wi) => w.map(([date, count], di) => (
          <rect
            key={date}
            x={LEFT + wi * STEP}
            y={TOP + di * STEP}
            width={CELL}
            height={CELL}
            rx="2"
            className={`hm-c hm-${level(count)}`}
          >
            <title>{`${count} contribution${count === 1 ? '' : 's'} on ${date}`}</title>
          </rect>
        )))}
      </svg>
    </div>
  );
}