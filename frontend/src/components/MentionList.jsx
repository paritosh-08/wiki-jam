import React from 'react';
import ReactDOM from 'react-dom/client';
import './MentionList.css';

class MentionList {
  constructor({ items, command }) {
    this.items = items;
    this.command = command;
    this.selectedIndex = 0;
    this.element = document.createElement('div');
    this.element.className = 'mention-list';
    this.root = ReactDOM.createRoot(this.element);
    this.render();
  }

  onKeyDown({ event }) {
    if (event.key === 'ArrowUp') {
      this.upHandler();
      return true;
    }

    if (event.key === 'ArrowDown') {
      this.downHandler();
      return true;
    }

    if (event.key === 'Enter') {
      this.enterHandler();
      return true;
    }

    return false;
  }

  upHandler() {
    this.selectedIndex = ((this.selectedIndex + this.items.length) - 1) % this.items.length;
    this.render();
  }

  downHandler() {
    this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
    this.render();
  }

  enterHandler() {
    this.selectItem(this.selectedIndex);
  }

  selectItem(index) {
    const item = this.items[index];
    if (item) {
      this.command({ id: item.email, label: item.displayName });
    }
  }

  updateProps({ items }) {
    this.items = items;
    this.selectedIndex = 0;
    this.render();
  }

  render() {
    const MentionListComponent = () => (
      <div className="mention-list-items">
        {this.items.length > 0 ? (
          this.items.map((item, index) => (
            <button
              key={item.id}
              className={`mention-item ${index === this.selectedIndex ? 'selected' : ''}`}
              onClick={() => this.selectItem(index)}
            >
              <div className="mention-item-avatar">
                {item.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="mention-item-info">
                <div className="mention-item-name">{item.displayName}</div>
                <div className="mention-item-email">{item.email}</div>
              </div>
            </button>
          ))
        ) : (
          <div className="mention-item-empty">No users found</div>
        )}
      </div>
    );

    this.root.render(<MentionListComponent />);
  }

  destroy() {
    this.root.unmount();
    this.element.remove();
  }
}

export default MentionList;

