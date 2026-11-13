import { Fragment } from 'react';

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="rounded bg-accent px-1.5 py-0.5 text-[0.9em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// Render a small text-only Markdown subset; never execute model HTML or load external images.
// Position keys are intentional: each completed message is immutable and has no interactive children.
export function AiMessageContent({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  return (
    <div className="min-w-0 space-y-4 text-sm leading-7 [overflow-wrap:anywhere]">
      {blocks.filter(Boolean).map((block, index) => {
        const lines = block.split('\n');
        if (lines[0]?.startsWith('```'))
          return (
            <pre
              key={index}
              className="max-w-full overflow-x-auto rounded-xl border border-border bg-accent p-4 text-xs leading-6"
            >
              <code>
                {lines.slice(1, lines.at(-1)?.startsWith('```') ? -1 : undefined).join('\n')}
              </code>
            </pre>
          );
        if (lines.length > 1 && /^\s*\|?\s*:?-{3,}/.test(lines[1]!)) {
          const cells = (line: string) =>
            line
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map((s) => s.trim());
          return (
            <div
              key={index}
              className="glass-card max-w-full overflow-x-auto rounded-xl border border-border"
            >
              <table className="w-full text-left text-xs">
                <thead className="bg-accent">
                  <tr>
                    {cells(lines[0]!).map((c, i) => (
                      <th key={i} className="px-3 py-2 font-semibold">
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.slice(2).map((line, i) => (
                    <tr key={i} className="border-t border-border">
                      {cells(line).map((c, j) => (
                        <td key={j} className="px-3 py-2 align-top">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (lines.every((line) => /^\s*[-*•]\s+/.test(line)))
          return (
            <ul key={index} className="list-disc space-y-2 pl-5 marker:text-primary/70">
              {lines.map((line, i) => (
                <li key={i}>{inline(line.replace(/^\s*[-*•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line)))
          return (
            <ol key={index} className="list-decimal space-y-2 pl-5 marker:text-primary/70">
              {lines.map((line, i) => (
                <li key={i}>{inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>
              ))}
            </ol>
          );
        return (
          <div key={index} className="space-y-2">
            {lines.map((line, i) =>
              /^#{1,6}\s+/.test(line) ? (
                <h3 key={i} className="pt-1 text-base font-semibold">
                  {inline(line.replace(/^#{1,6}\s+/, ''))}
                </h3>
              ) : /^\s*[-*•]\s+/.test(line) ? (
                <ul key={i} className="list-disc pl-5 marker:text-primary/70">
                  <li>{inline(line.replace(/^\s*[-*•]\s+/, ''))}</li>
                </ul>
              ) : (
                <p key={i}>{inline(line)}</p>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
