import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 mb-3 text-2xl font-semibold text-[var(--color-ink)]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-3 text-xl font-semibold text-[var(--color-ink)]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-lg font-semibold text-[var(--color-ink)]">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-2 text-base font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-2)]">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-3 text-lg leading-[1.65] text-[var(--color-ink)]">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--color-accent-strong)] underline decoration-[var(--color-accent)]/40 underline-offset-[3px] transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-3 ml-5 list-disc space-y-1.5 text-base leading-[1.55] marker:text-[var(--color-ink-3)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-5 list-decimal space-y-1.5 text-base leading-[1.55] marker:text-[var(--color-ink-3)]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-[var(--color-ink)]">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--color-ink)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-[var(--color-rule-2)] pl-4 text-base italic text-[var(--color-ink-2)]">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} font-mono text-sm`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-sm border border-[var(--color-rule)] bg-[var(--color-panel)] px-1.5 py-0.5 font-mono text-sm text-[var(--color-ink)]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-sm leading-[1.5]">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-6 border-0 border-t border-[var(--color-rule)]" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-base">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--color-rule)] px-3 py-2 text-left font-semibold text-[var(--color-ink)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--color-rule)] px-3 py-2 text-[var(--color-ink-2)]">
      {children}
    </td>
  )
};

export function MarkdownView({ source }: { source: string }) {
  return (
    <div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
