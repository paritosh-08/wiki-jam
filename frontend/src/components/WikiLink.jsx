import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import WikiPagePreview from './WikiPagePreview';
import { fetchPagePreview } from '../utils/wikiUtils';
import './WikiLink.css';

/**
 * Custom link component for wiki links with hover preview
 * - Blue links for existing pages
 * - Red links for non-existent pages (click to create)
 * - Hover preview after 300ms delay
 */
function WikiLink({ pageName, displayText, sessionId, onNavigate, onCreatePage }) {
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pageExists, setPageExists] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef(null);
  const linkRef = useRef(null);

  // Fetch page data to check if it exists
  useEffect(() => {
    if (!pageName || !sessionId) return;

    const fetchData = async () => {
      const data = await fetchPagePreview(pageName, sessionId);
      if (data) {
        setPreviewData(data);
        setPageExists(true);
      } else {
        setPageExists(false);
      }
    };

    fetchData();
  }, [pageName, sessionId]);

  const handleMouseEnter = () => {
    if (pageExists && previewData && linkRef.current) {
      // Calculate position for preview
      const rect = linkRef.current.getBoundingClientRect();
      setPreviewPosition({
        x: rect.left,
        y: rect.bottom + 8 // 8px below the link
      });

      // Delay showing preview to avoid flickering
      timeoutRef.current = setTimeout(() => {
        setShowPreview(true);
      }, 300);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowPreview(false);
  };

  const handleClick = (e) => {
    e.preventDefault();
    
    if (pageExists && previewData) {
      // Navigate to existing page
      if (onNavigate) {
        onNavigate(pageName);
      }
    } else {
      // Create new page
      if (onCreatePage) {
        onCreatePage(pageName);
      }
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const linkClassName = pageExists === false
    ? 'wiki-link wiki-link-broken'
    : 'wiki-link wiki-link-exists';

  const title = pageExists === false
    ? `Page not found: ${pageName} (click to create)`
    : `Go to ${pageName}`;

  return (
    <>
      <a
        ref={linkRef}
        href="#"
        className={linkClassName}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={title}
      >
        {displayText}
      </a>
      {showPreview && previewData && createPortal(
        <div
          className="wiki-page-preview"
          style={{
            position: 'fixed',
            top: `${previewPosition.y}px`,
            left: `${previewPosition.x}px`,
            zIndex: 10000
          }}
        >
          <WikiPagePreview
            title={previewData.title}
            definition={previewData.definition}
          />
        </div>,
        document.body
      )}
    </>
  );
}

export default WikiLink;

