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
  deleteWikiPage
} from '../wikiParser.js';
import { getSession } from '../yjsServer.js';

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

    // Add link information to each page
    const pagesWithLinks = pages.map(page => {
      const links = getPageLinks(page);
      return {
        ...page,
        linkCount: links.length,
        links: links.map(l => l.target)
      };
    });

    res.json({ pages: pagesWithLinks });
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
    res.json({
      page: {
        ...page,
        links
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

    const session = await getSession(sessionId);
    if (!session || !session.directory) {
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

        const destPath = path.join(session.directory, filename);

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

// Download all wiki pages as a ZIP file
wikiRouter.get('/download', async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = await getSession(sessionId);
    if (!session || !session.directory) {
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

    // Add all .hml files from session directory
    const files = await fs.readdir(session.directory);
    const hmlFiles = files.filter(f => f.endsWith('.hml'));

    for (const file of hmlFiles) {
      const filePath = path.join(session.directory, file);
      archive.file(filePath, { name: file });
    }

    // Finalize the archive
    await archive.finalize();
  } catch (err) {
    console.error('Error creating ZIP:', err);
    res.status(500).json({ error: err.message });
  }
});
