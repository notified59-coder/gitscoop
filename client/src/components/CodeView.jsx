import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { copy } from '../util.js';
import { useToast } from './Toast.jsx';

const EXT = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json', md: 'markdown', html: 'xml', xml: 'xml', css: 'css', scss: 'scss', sql: 'sql', toml: 'ini', dockerfile: 'dockerfile' };

export default function CodeView({ file, githubUrl }) {
  const toast = useToast();
  const [wrap, setWrap] = useState(false);
  const html = useMemo(() => {
    if (!file?.text) return [];
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : file.name.toLowerCase();
    const lang = EXT[ext];
    let out;
    try {
      out = lang && hljs.getLanguage(lang)
        ? hljs.highlight(file.text, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(file.text.slice(0, 20000)).value;
    } catch { out = file.text.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    // split into lines but keep open spans balanced per line
    const lines = []; let open = [];
    out.split('\n').forEach((raw) => {
      let line = open.join('') + raw;
      const tags = raw.match(/<\/?span[^>]*>/g) || [];
      tags.forEach((t) => (t.startsWith('</') ? open.pop() : open.push(t)));
      line += '</span>'.repeat(open.length);
      lines.push(line);
    });
    return lines;
  }, [file]);

  if (file?.binary || file?.tooLarge) {
    return (
      <div className="empty">
        <p>{file.binary ? 'This file is binary, so it can’t be shown as text.' : 'This file is too large to preview here.'}</p>
        <a className="btn btn-ghost" href={githubUrl} target="_blank" rel="noopener noreferrer">View on GitHub</a>
      </div>
    );
  }
  return (
    <div className="code">
      <div className="code-bar">
        <span className="code-name">{file.path}</span>
        <span className="code-meta">{lines(file.text)} lines · {(file.size / 1024).toFixed(1)} KB</span>
        <button className="btn-mini" onClick={() => setWrap(!wrap)} aria-pressed={wrap}>Wrap lines</button>
        <button className="btn-mini" onClick={async () => toast((await copy(file.text)) ? 'Copied' : 'Copy failed', 'ok')}>Copy</button>
        <a className="btn-mini" href={githubUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
      <pre className={wrap ? 'wrap-on' : ''}><code>
        {html.map((l, i) => (
          <div className="ln" key={i}><span className="no">{i + 1}</span><span className="tx" dangerouslySetInnerHTML={{ __html: l || ' ' }} /></div>
        ))}
      </code></pre>
    </div>
  );
}
const lines = (t) => t.split('\n').length;
