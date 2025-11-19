/**
 * Convert a title to a canonical ID (slug)
 * Examples:
 * - "Hello World" -> "hello-world"
 * - "API Design" -> "api-design"
 * - "Test & Example" -> "test-&-example"
 */
export function titleToId(title) {
  if (!title) return '';
  
  let t = title.normalize("NFKD").trim().toLowerCase();

  // Replace separators (space, underscore, slash, dot, colon) with '-'
  t = t.replaceAll(/[\s_/.:]+/g, "-");

  // Remove unsafe / reserved chars
  t = t.replaceAll(/[<>#?"'%';,{}[\]()|\\`^]/g, "");

  // Collapse multiple hyphens
  t = t.replaceAll(/-+/g, "-");

  // Trim leading/trailing hyphens
  t = t.replaceAll(/(^-)|(-$)/g, "");

  return t;
}

/**
 * Parse wiki links from text
 * Supports both formats:
 * - [text](wiki://page)
 * - [text](wiki://<page>)
 */
export function parseWikiLinks(text) {
  if (!text) return [];
  
  // Match wiki:// links with or without angle brackets
  const linkRegex = /\[([^\]]+)\]\(wiki:\/\/<?([^>)]+)>?\)/g;
  const links = [];
  let match;
  
  while ((match = linkRegex.exec(text)) !== null) {
    links.push({
      fullText: match[0],
      displayText: match[1],
      pageName: match[2],
      index: match.index
    });
  }
  
  return links;
}

/**
 * Search wiki pages by query
 */
export async function searchWikiPages(query, sessionId) {
  if (!query || !sessionId) return [];
  
  try {
    const response = await fetch(`/api/wiki/search?sessionId=${sessionId}&query=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error('Error searching wiki:', err);
    return [];
  }
}

/**
 * Check if a wiki page exists
 */
export async function checkPageExists(pageName, sessionId) {
  try {
    const response = await fetch(`/api/wiki/find/${encodeURIComponent(pageName)}?sessionId=${sessionId}`);
    return response.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Fetch page preview data
 */
export async function fetchPagePreview(pageName, sessionId) {
  try {
    const response = await fetch(`/api/wiki/find/${encodeURIComponent(pageName)}?sessionId=${sessionId}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      title: data.page.title,
      definition: data.page.definition,
      filename: data.page.filename
    };
  } catch (err) {
    return null;
  }
}

