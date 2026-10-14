import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ['className', /^language-./, 'hljs']],
    span: [...(defaultSchema.attributes?.span || []), ['className', /^hljs/]],
    img: [...(defaultSchema.attributes?.img || []), 'width', 'height', 'align'],
    p: [...(defaultSchema.attributes?.p || []), 'align'],
    div: [...(defaultSchema.attributes?.div || []), 'align'],
    h1: [...(defaultSchema.attributes?.h1 || []), 'align'],
    h2: [...(defaultSchema.attributes?.h2 || []), 'align'],
    td: [...(defaultSchema.attributes?.td || []), 'align'],
    th: [...(defaultSchema.attributes?.th || []), 'align'],
  },
  tagNames: [...(defaultSchema.tagNames || []), 'picture', 'source', 'details', 'summary'],
};

// Resolve README-relative links/images against the repo on GitHub.
export default function Markdown({ text, repo }) {
  const base = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/`;
  const blob = `https://github.com/${repo.full_name}/blob/${repo.default_branch}/`;
  const resolve = (url, isImg) => {
    if (!url) return url;
    if (/^(https?:|mailto:|#|data:image\/)/i.test(url)) return url;
    const clean = url.replace(/^\.?\//, '');
    return (isImg ? base : blob) + clean;
  };
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        urlTransform={(u) => u}
        components={{
          a: ({ href, children }) => {
            const h = resolve(href, false);
            const ext = h && !h.startsWith('#');
            return <a href={h} target={ext ? '_blank' : undefined} rel="noopener noreferrer">{children}</a>;
          },
          img: ({ src, alt, ...r }) => <img src={resolve(src, true)} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" {...r} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
