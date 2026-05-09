// creator.js — Creator ↔ Arash chat panel
export class CreatorPanel {
  constructor(onDirectivesUpdate) {
    this.onDirectivesUpdate = onDirectivesUpdate;
    this.isOpen = false;
    this._buildPanel();
    this._loadHistory();
  }

  _buildPanel() {
    // ── Main toggle button ─────────────────────────────────────
    this.$toggle = document.getElementById('creator-toggle');
    if (this.$toggle) {
      this.$toggle.addEventListener('click', () => this.togglePanel());
    }

    // ── Panel container ────────────────────────────────────────
    this.$panel    = document.getElementById('creator-panel');
    this.$messages = document.getElementById('creator-messages');
    this.$input    = document.getElementById('creator-input');
    this.$send     = document.getElementById('creator-send');
    this.$closeBtn = document.getElementById('creator-close');

    if (this.$send) {
      this.$send.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._sendMessage();
      });
    }
    if (this.$input) {
      this.$input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendMessage();
        }
      });
    }
    if (this.$closeBtn) {
      this.$closeBtn.addEventListener('click', () => this.closePanel());
    }
  }

  async _loadHistory() {
    try {
      const res = await fetch('/api/creator-messages');
      if (!res.ok) return;
      const messages = await res.json();
      messages.forEach(m => this._addMessage(m.role, m.content, false));
      this._scrollToBottom();
    } catch (e) {
      console.warn('[Creator] Could not load history:', e.message);
    }
  }

  async _sendMessage() {
    const text = this.$input?.value?.trim();
    if (!text) return;

    this.$input.value = '';
    this.$input.disabled = true;
    this.$send.disabled = true;
    this.$send.textContent = '...';

    // Show creator message immediately
    this._addMessage('creator', text, true);

    try {
      const res = await fetch('/api/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Arash response is handled by the WebSocket broadcast (creator_message event)
      // to ensure all connected clients see it without duplication here.

      // Notify about new directives
      if (data.directives && data.directives.length > 0 && this.onDirectivesUpdate) {
        this.onDirectivesUpdate(data.directives);
        this._showDirectiveConfirm(data.directives);
      }
    } catch (e) {
      this._addMessage('system', 'Failed to reach the creator channel. Try again.', true);
      console.error('[Creator] Send failed:', e.message);
    } finally {
      this.$input.disabled = false;
      this.$send.disabled = false;
      this.$send.textContent = 'Send';
      this.$input.focus();
    }
  }

  _addMessage(role, content, animate = false) {
    if (!this.$messages) return;

    const div = document.createElement('div');
    div.className = `creator-msg creator-msg--${role}${animate ? ' creator-msg--new' : ''}`;

    const label = role === 'creator' ? '👁️ Creator' : role === 'arash' ? '🧑‍🌾 Arash' : '⚙️ System';
    div.innerHTML = `<span class="msg-label">${label}</span><p class="msg-text">${this._escapeHtml(content)}</p>`;

    this.$messages.appendChild(div);
    this._scrollToBottom();
  }

  _showDirectiveConfirm(directives) {
    const count = directives.length;
    const labels = directives.map(d => `• ${d.label} @ ${d.time}${d.recurring ? ' (daily)' : ''}`).join('\n');
    const div = document.createElement('div');
    div.className = 'creator-msg creator-msg--system creator-msg--new';
    div.innerHTML = `<span class="msg-label">📅 Schedule Updated</span><p class="msg-text">${count} directive(s) scheduled:\n${this._escapeHtml(labels)}</p>`;
    this.$messages.appendChild(div);
    this._scrollToBottom();
  }

  _scrollToBottom() {
    if (this.$messages) {
      this.$messages.scrollTop = this.$messages.scrollHeight;
    }
  }

  _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  // Called from WebSocket when a new message arrives
  onNewMessage(arashResponse) {
    this._addMessage('arash', arashResponse, true);
  }

  togglePanel() {
    this.isOpen ? this.closePanel() : this.openPanel();
  }

  openPanel() {
    this.isOpen = true;
    if (this.$panel) this.$panel.classList.add('open');
    if (this.$toggle) this.$toggle.classList.add('active');
    if (this.$input) this.$input.focus();
  }

  closePanel() {
    this.isOpen = false;
    if (this.$panel) this.$panel.classList.remove('open');
    if (this.$toggle) this.$toggle.classList.remove('active');
  }
}
