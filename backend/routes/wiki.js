import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';
import yaml from 'js-yaml';
import {
  getAllWikiPages,
  getWikiPage,
  saveWikiPage,
  getPageLinks,
  findPageByTitle,
  deleteWikiPage,
  getSessionDirectory
} from '../wikiParser.js';
import {
  addPageTag,
  removePageTag,
  getPageTags,
  getAllTagsForSession,
  setPageTags
} from '../db.js';

export const wikiRouter = express.Router();

// Configure multer for file uploads - store in temp directory first
const upload = multer({ dest: '/tmp/wiki-uploads' });

// Validate if a file is a valid HML (YAML) file
async function validateHmlFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(content);

    // Check if it has the expected structure
    if (parsed && parsed.definition && typeof parsed.definition === 'object') {
      return { valid: true };
    }
    return { valid: false, reason: 'Missing or invalid "definition" structure' };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

// Get all wiki pages for a session
wikiRouter.get('/pages', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const pages = await getAllWikiPages(sessionId);

    // Add link information and tags to each page
    const pagesWithLinksAndTags = await Promise.all(pages.map(async (page) => {
      const links = getPageLinks(page);
      const tags = await getPageTags(sessionId, page.filename);
      return {
        ...page,
        linkCount: links.length,
        links: links.map(l => l.target),
        tags
      };
    }));

    res.json({ pages: pagesWithLinksAndTags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific wiki page
wikiRouter.get('/pages/:filename', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const page = await getWikiPage(req.params.filename, sessionId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const links = getPageLinks(page);
    const tags = await getPageTags(sessionId, req.params.filename);
    res.json({
      page: {
        ...page,
        links,
        tags
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Find page by title (for wiki link resolution)
wikiRouter.get('/find/:title', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const pages = await getAllWikiPages(sessionId);
    const page = findPageByTitle(pages, decodeURIComponent(req.params.title));

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search wiki pages
wikiRouter.get('/search', async (req, res) => {
  try {
    const { sessionId, query } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!query) {
      return res.json({ results: [] });
    }

    const pages = await getAllWikiPages(sessionId);
    const lowerQuery = query.toLowerCase();

    // Score and filter pages based on relevance
    const scoredPages = pages.map(page => {
      let score = 0;
      const title = page.title.toLowerCase();
      const definition = (page.definition || '').toLowerCase();
      const aliases = (page.aliases || []).map(a => a.toLowerCase());

      // Title matches (highest priority)
      if (title === lowerQuery) score += 1000;
      else if (title.startsWith(lowerQuery)) score += 500;
      else if (title.includes(lowerQuery)) score += 100;

      // Alias matches
      if (aliases.some(a => a === lowerQuery)) score += 800;
      else if (aliases.some(a => a.startsWith(lowerQuery))) score += 400;
      else if (aliases.some(a => a.includes(lowerQuery))) score += 80;

      // Definition matches (lower priority)
      if (definition.includes(lowerQuery)) score += 50;

      return { ...page, score };
    });

    // Filter out pages with no matches and sort by score
    const results = scoredPages
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Limit to top 10 results
      .map(({ score, ...page }) => page); // Remove score from response

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a wiki page
wikiRouter.post('/pages/:filename', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const success = await saveWikiPage(req.params.filename, req.body, sessionId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save page' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new wiki page
wikiRouter.post('/create', async (req, res) => {
  try {
    const { sessionId, filename, title } = req.body;

    if (!sessionId || !filename) {
      return res.status(400).json({ error: 'sessionId and filename are required' });
    }

    // Ensure .hml extension
    const fullFilename = filename.endsWith('.hml') ? filename : filename + '.hml';

    // Create empty page
    const pageData = {
      title: title || filename.replace('.hml', ''),
      definition: '',
      details: '',
      aliases: [],
      sections: []
    };

    const success = await saveWikiPage(fullFilename, pageData, sessionId);
    if (success) {
      res.json({ success: true, filename: fullFilename });
    } else {
      res.status(500).json({ error: 'Failed to create page' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload wiki files
wikiRouter.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const sessionDirectory = getSessionDirectory(sessionId);

    // Check if session directory exists
    try {
      await fs.access(sessionDirectory);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid session' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];
    const failedFiles = [];

    // Validate and move files
    for (const file of req.files) {
      const validation = await validateHmlFile(file.path);

      if (validation.valid) {
        // Ensure .hml extension
        const filename = file.originalname.endsWith('.hml')
          ? file.originalname
          : file.originalname + '.hml';

        const destPath = path.join(sessionDirectory, filename);

        // Copy file from temp to session directory (works across filesystems)
        await fs.copyFile(file.path, destPath);
        // Delete the temp file after successful copy
        await fs.unlink(file.path).catch(() => {});

        uploadedFiles.push({
          filename: filename,
          originalName: file.originalname,
          size: file.size
        });
      } else {
        // Delete invalid file from temp
        await fs.unlink(file.path).catch(() => {});

        failedFiles.push({
          filename: file.originalname,
          reason: validation.reason
        });
      }
    }

    res.json({
      success: true,
      uploaded: uploadedFiles,
      failed: failedFiles,
      uploadedCount: uploadedFiles.length,
      failedCount: failedFiles.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a wiki page
wikiRouter.delete('/pages/:filename', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const { filename } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const success = await deleteWikiPage(filename, sessionId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to delete page' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download all wiki pages as a ZIP file (with optional tag filtering)
wikiRouter.get('/download', async (req, res) => {
  try {
    const { sessionId, tags } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const sessionDirectory = getSessionDirectory(sessionId);

    // Check if session directory exists
    try {
      await fs.access(sessionDirectory);
    } catch (err) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="wiki-${sessionId}.zip"`);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Pipe archive to response
    archive.pipe(res);

    // Get all .hml files from session directory
    const files = await fs.readdir(sessionDirectory);
    let hmlFiles = files.filter(f => f.endsWith('.hml'));

    // Filter by tags if provided
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      const filteredFiles = new Set();

      // Get files for each tag and find intersection
      for (const file of hmlFiles) {
        const fileTags = await getPageTags(sessionId, file);
        // Check if file has ALL the specified tags
        const hasAllTags = tagArray.every(tag => fileTags.includes(tag));
        if (hasAllTags) {
          filteredFiles.add(file);
        }
      }

      hmlFiles = Array.from(filteredFiles);
    }

    // Add filtered files to archive
    for (const file of hmlFiles) {
      const filePath = path.join(sessionDirectory, file);
      archive.file(filePath, { name: file });
    }

    // Finalize the archive
    await archive.finalize();
  } catch (err) {
    console.error('Error creating ZIP:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get tags for a specific page
wikiRouter.get('/pages/:filename/tags', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const { filename } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const tags = await getPageTags(sessionId, filename);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set tags for a specific page
wikiRouter.post('/pages/:filename/tags', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const { filename } = req.params;
    const { tags } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags must be an array' });
    }

    await setPageTags(sessionId, filename, tags);
    res.json({ success: true, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all tags for a session
wikiRouter.get('/tags', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const tags = await getAllTagsForSession(sessionId);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
