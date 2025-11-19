import './WikiPagePreview.css';

/**
 * Preview popup component for wiki links
 * Shows title and definition on hover
 */
function WikiPagePreview({ title, definition }) {
  // Truncate definition if too long
  const truncatedDefinition = definition && definition.length > 200
    ? definition.substring(0, 200) + '...'
    : definition;

  return (
    <div className="wiki-page-preview">
      <div className="wiki-preview-title">{title}</div>
      <div className="wiki-preview-definition">
        {truncatedDefinition || 'No definition available'}
      </div>
    </div>
  );
}

export default WikiPagePreview;

