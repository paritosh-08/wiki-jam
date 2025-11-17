import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './GraphView.css';

function GraphView({ pages, onPageClick, onClose }) {
  const graphRef = useRef();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    if (!pages || pages.length === 0) return;

    // Parse wiki links from text
    const parseWikiLinks = (text) => {
      if (!text) return [];
      const linkRegex = /\[([^\]]+)\]\(wiki:\/\/([^)]+)\)/g;
      const links = [];
      let match;
      while ((match = linkRegex.exec(text)) !== null) {
        links.push(match[2]); // pageName
      }
      return links;
    };

    // Create nodes from pages
    const nodes = pages.map(page => ({
      id: page.filename,
      name: page.title,
      val: 10, // Node size
      color: '#667eea'
    }));

    // Create a map for quick lookup
    const pageMap = new Map(pages.map(p => [p.filename, p]));
    const titleToFilename = new Map();
    
    // Build title to filename mapping (including aliases)
    pages.forEach(page => {
      titleToFilename.set(page.title.toLowerCase(), page.filename);
      if (page.aliases) {
        page.aliases.forEach(alias => {
          titleToFilename.set(alias.toLowerCase(), page.filename);
        });
      }
    });

    // Create links between pages
    const links = [];
    pages.forEach(page => {
      const allText = `${page.definition || ''} ${page.details || ''}`;
      const linkedPages = parseWikiLinks(allText);
      
      linkedPages.forEach(linkedPageName => {
        const targetFilename = titleToFilename.get(linkedPageName.toLowerCase());
        if (targetFilename && pageMap.has(targetFilename)) {
          links.push({
            source: page.filename,
            target: targetFilename,
            color: 'rgba(102, 126, 234, 0.3)'
          });
        }
      });
    });

    setGraphData({ nodes, links });
  }, [pages]);

  const handleNodeClick = (node) => {
    setSelectedNode(node.id);
    const page = pages.find(p => p.filename === node.id);
    if (page && onPageClick) {
      onPageClick(page);
    }
  };

  const handleNodeHover = (node) => {
    if (graphRef.current) {
      document.body.style.cursor = node ? 'pointer' : 'default';
    }
  };

  return (
    <div className="graph-view">
      <div className="graph-header">
        <div className="graph-header-left">
          <h2 className="graph-title">📊 Wiki Graph View</h2>
          <p className="graph-subtitle">
            {graphData.nodes.length} pages, {graphData.links.length} connections
          </p>
        </div>
        <button className="close-graph-button" onClick={onClose}>
          ✕ Close Graph
        </button>
      </div>

      <div className="graph-container">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeLabel="name"
          nodeAutoColorBy="group"
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            
            // Draw node circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.id === selectedNode ? '#f59e0b' : node.color;
            ctx.fill();
            
            // Draw label
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#1f2937';
            ctx.fillText(label, node.x, node.y + 10);
          }}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={2}
          linkColor={link => link.color}
          backgroundColor="#f9fafb"
          cooldownTicks={100}
          onEngineStop={() => graphRef.current?.zoomToFit(400)}
        />
      </div>

      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#667eea' }}></div>
          <span>Wiki Page</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#f59e0b' }}></div>
          <span>Selected</span>
        </div>
        <div className="legend-item">
          <div className="legend-line"></div>
          <span>Wiki Link</span>
        </div>
      </div>
    </div>
  );
}

export default GraphView;

