import { useState } from 'react';
import { copy } from '../util.js';
import { useToast } from './Toast.jsx';

// "Add to your GitHub README": live badge previews + copy-paste snippets.
export default function Embed({ username, name }) {
  const toast = useToast();
  const origin = window.location.origin;
  const page = `${origin}/u/${username}`;
  const [style, setStyle] = useState('flat');
  const [tab, setTab] = useState('md');

  const badge = `${origin}/badge/${username}.svg${style === 'big' ? '?style=big' : ''}`;
  const snippets = {
    md: `[![My portfolio](${badge})](${page})`,
    html: `<a href="${page}"><img src="${badge}" alt="My portfolio on GitScoop" /></a>`,
    readme: `## 👋 Hi, I'm ${name || username}\n\nI build things with code. Browse my best projects, READMEs and code in one place:\n\n[![My portfolio](${badge})](${page})\n`,
  };
  const labels = { md: 'Markdown', html: 'HTML', readme: 'Full README section' };

  return (
    <div className="embed">
      <h3 className="embed-h">Add to your GitHub README</h3>
      <p className="fine">Paste a live badge into your profile README (the repo named <code>{username}</code>) so visitors can jump to your portfolio.</p>

      <div className="embed-prev" aria-label="Badge preview">
        <img src={badge} alt="Portfolio badge preview" height={style === 'big' ? 28 : 20} />
      </div>

      <div className="embed-row" role="group" aria-label="Badge style">
        <button type="button" className="btn-mini" aria-pressed={style === 'flat'} onClick={() => setStyle('flat')}>Compact</button>
        <button type="button" className="btn-mini" aria-pressed={style === 'big'} onClick={() => setStyle('big')}>Large</button>
      </div>

      <div className="embed-row" role="tablist" aria-label="Snippet format">
        {Object.keys(snippets).map((k) => (
          <button key={k} type="button" role="tab" className="btn-mini" aria-pressed={tab === k} onClick={() => setTab(k)}>{labels[k]}</button>
        ))}
      </div>

      <pre className="embed-code"><code>{snippets[tab]}</code></pre>
      <button type="button" className="btn-mini" onClick={async () => toast((await copy(snippets[tab])) ? 'Snippet copied' : 'Copy failed')}>Copy snippet</button>
    </div>
  );
}