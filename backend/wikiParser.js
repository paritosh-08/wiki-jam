import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get session directory path
export function getSessionDirectory(sessionId) {
  // __dirname is /app, so we want /app/sessions/{sessionId}
  return path.join(__dirname, 'sessions', sessionId);
}

// Get the wiki path for a specific session
async function getSessionWikiPath(sessionId) {
  const directory = getSessionDirectory(sessionId);

  // Check if directory exists
  try {
    await fs.access(directory);
    return directory;
  } catch (err) {
    throw new Error(`Session ${sessionId} not found or has no directory`);
  }
}

export async function getAllWikiPages(sessionId) {
  try {
    const wikiPath = await getSessionWikiPath(sessionId);
    const files = await fs.readdir(wikiPath);
    const hmlFiles = files.filter(f => f.endsWith('.hml'));
    
    const pages = await Promise.all(
      hmlFiles.map(async (file) => {
        try {
          const content = await fs.readFile(path.join(wikiPath, file), 'utf-8');
          const parsed = yaml.load(content);
          
          if (parsed && parsed.definition) {
            return {
              filename: file,
              title: parsed.definition.title || file.replace('.hml', ''),
              definition: parsed.definition.definition || '',
              details: parsed.definition.details || '',
              aliases: parsed.definition.aliases || [],
              sections: parsed.definition.sections || []
            };
          }
        } catch (err) {
          console.error(`Error parsing ${file}:`, err.message);
        }
        return null;
      })
    );
    
    return pages.filter(p => p !== null);
  } catch (err) {
    console.error('Error reading wiki directory:', err);
    // Return empty array if directory doesn't exist or is empty
    return [];
  }
}

export async function getWikiPage(filename, sessionId) {
  try {
    const wikiPath = await getSessionWikiPath(sessionId);
    const content = await fs.readFile(path.join(wikiPath, filename), 'utf-8');
    const parsed = yaml.load(content);
    
    if (parsed && parsed.definition) {
      return {
        filename,
        title: parsed.definition.title || filename.replace('.hml', ''),
        definition: parsed.definition.definition || '',
        details: parsed.definition.details || '',
        aliases: parsed.definition.aliases || [],
        sections: parsed.definition.sections || [],
        rawContent: content
      };
    }
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    return null;
  }
}

export async function saveWikiPage(filename, pageData, sessionId) {
  try {
    // Get the session directory path
    const wikiPath = getSessionDirectory(sessionId);

    // Create directory if it doesn't exist
    try {
      await fs.access(wikiPath);
    } catch (err) {
      console.log(`📁 Creating session directory: ${sessionId}`);
      await fs.mkdir(wikiPath, { recursive: true });
    }

    const yamlContent = {
      kind: 'WikiPage',
      version: 'v1',
      definition: {
        title: pageData.title,
        definition: pageData.definition,
        details: pageData.details,
        ...(pageData.aliases && pageData.aliases.length > 0 && { aliases: pageData.aliases }),
        ...(pageData.sections && pageData.sections.length > 0 && { sections: pageData.sections })
      }
    };

    const content = yaml.dump(yamlContent, { lineWidth: -1 });
    await fs.writeFile(path.join(wikiPath, filename), content, 'utf-8');
    console.log(`💾 Saved ${filename} to disk for session ${sessionId}`);
    return true;
  } catch (err) {
    console.error(`Error saving ${filename}:`, err);
    return false;
  }
}

export function parseWikiLinks(text) {
  if (!text) return [];
  
  // Match wiki:// links with or without angle brackets
  const linkRegex = /\[([^\]]+)\]\(wiki:\/\/<?([^>)]+)>?\)/g;
  const links = [];
  let match;
  
  while ((match = linkRegex.exec(text)) !== null) {
    links.push({
      text: match[1],
      target: match[2]
    });
  }
  
  return links;
}

export function findPageByTitle(pages, title) {
  // Try exact match first
  let page = pages.find(p => p.title === title);
  if (page) return page;
  
  // Try case-insensitive match
  page = pages.find(p => p.title.toLowerCase() === title.toLowerCase());
  if (page) return page;
  
  // Try alias match
  page = pages.find(p => 
    p.aliases && p.aliases.some(a => 
      a.toLowerCase() === title.toLowerCase()
    )
  );
  
  return page;
}

export function getPageLinks(page) {
  const links = [];

  if (page.definition) {
    links.push(...parseWikiLinks(page.definition));
  }

  if (page.details) {
    links.push(...parseWikiLinks(page.details));
  }

  if (page.sections) {
    page.sections.forEach(section => {
      if (section.content) {
        links.push(...parseWikiLinks(section.content));
      }
    });
  }

  return links;
}

export async function deleteWikiPage(filename, sessionId) {
  try {
    const wikiPath = await getSessionWikiPath(sessionId);
    const filePath = path.join(wikiPath, filename);
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    console.error(`Error deleting ${filename}:`, err.message);
    return false;
  }
}
