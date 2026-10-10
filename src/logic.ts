// Pure logic: no `obsidian` import, so tests/ can run it under plain Node.

export interface Engine {
  name: string;
  /** A web address with `{query}` where the search text goes. */
  url: string;
}

export const QUERY = '{query}';

export const DEFAULT_ENGINES: Engine[] = [
  { name: 'Google', url: 'https://www.google.com/search?q={query}' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search={query}' },
  { name: 'YouTube', url: 'https://www.youtube.com/results?search_query={query}' },
  { name: 'Google Scholar', url: 'https://scholar.google.com/scholar?q={query}' },
  { name: 'Bing', url: 'https://www.bing.com/search?q={query}' },
];

/** Turns selected Markdown into plain words to search for. */
export function cleanQuery(text: string): string {
  return text
    .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/!?\[\[([^\]]*)\]\]/g, (_, target: string) => target.split('#')[0].split('^')[0] || target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+|\*{1,3}|==|~~/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The search address, or null when the template has nowhere to put the text or the text is empty. */
export function buildUrl(template: string, query: string): string | null {
  const q = cleanQuery(query);
  if (!q || !template.includes(QUERY)) return null;
  return template.split(QUERY).join(encodeURIComponent(q));
}

/** Why an engine line is not usable, or null when it is. */
export function engineProblem(engine: Engine): string | null {
  if (!engine.name.trim()) return 'it has no name';
  if (!/^https?:\/\//i.test(engine.url)) return 'the address must start with http:// or https://';
  if (!engine.url.includes(QUERY)) return `the address must contain ${QUERY}`;
  return null;
}

/** One engine per line, "Name | address". */
export function formatEngines(engines: Engine[]): string {
  return engines.map((e) => `${e.name} | ${e.url}`).join('\n');
}

export interface ParsedEngines {
  engines: Engine[];
  /** One message per line that was skipped. */
  problems: string[];
}

export function parseEngines(text: string): ParsedEngines {
  const engines: Engine[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const bar = line.indexOf('|');
    const engine = bar < 0 ? { name: '', url: line } : { name: line.slice(0, bar).trim(), url: line.slice(bar + 1).trim() };
    const problem = engineProblem(engine);
    if (problem) problems.push(`Line ${i + 1} was skipped: ${problem}.`);
    else if (engines.some((e) => e.name.toLowerCase() === engine.name.toLowerCase())) problems.push(`Line ${i + 1} was skipped: "${engine.name}" is already listed.`);
    else engines.push(engine);
  });
  return { engines, problems };
}

/** The engine with this name (any case), else the first one. */
export function pickEngine(engines: Engine[], name: string): Engine | undefined {
  return engines.find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? engines[0];
}

/** Shortens text for a menu title. */
export function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).replace(/\s+$/, '')}…`;
}
