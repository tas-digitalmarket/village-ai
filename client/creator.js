// creator.js — Creator ↔ village chat panel
export class CreatorPanel {
  constructor(onDirectivesUpdate) {
    this.onDirectivesUpdate = onDirectivesUpdate;
    this.isOpen = false;
    this._sendInProgress = false;
    this.target = 'arash';
    this._buildPanel();
    this._setTarget('arash', false);
  }

  _buildPanel() {
    this.$toggle = document.getElementById('creator-toggle');
    if (this.$toggle) this.$toggle.addEventListener('click', () => this.togglePanel());

    this.$panel    = document.getElementById('creator-panel');
    this.$messages = document.getElementById('creator-messages');
    this.$input    = document.getElementById('creator-input');
    this.$send     = document.getElementById('creator-send');
    this.$closeBtn = document.getElementById('creator-close');
    this.$title    = document.getElementById('creator-title');
    this.$arashTab = document.getElementById('creator-target-arash');
    this.$aidaTab  = document.getElementById('creator-target-aida');

    if (this.$send) {
      const handleSend = (e) => {
        e.preventDefault();
        this._sendMessage();
      };
      this.$send.addEventListener('mousedown', handleSend);
      this.$send.addEventListener('click', handleSend);
      this.$send.addEventListener('touchstart', handleSend);
    }
    if (this.$input) {
      this.$input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendMessage();
        }
      });
    }
    if (this.$closeBtn) this.$closeBtn.addEventListener('click', () => this.closePanel());
    if (this.$arashTab) this.$arashTab.addEventListener('click', () => this._setTarget('arash'));
    if (this.$aidaTab) this.$aidaTab.addEventListener('click', () => this._setTarget('aida'));
  }

  async _setTarget(target, reload = true) {
    this.target = target === 'aida' ? 'aida' : 'arash';
    this.$arashTab?.classList.toggle('active', this.target === 'arash');
    this.$aidaTab?.classList.toggle('active', this.target === 'aida');
    if (this.$title) this.$title.textContent = 'Creator Conversation';
    if (this.$input) this.$input.placeholder = this.target === 'aida' ? 'Speak with Aida...' : 'Speak with Arash...';
    if (reload) await this._loadHistory();
    else await this._loadHistory();
  }

  async _loadHistory() {
    if (!this.$messages) return;
    this.$messages.innerHTML = '';
    this._addMessage('system', this.target === 'aida'
      ? 'Aida is listening with care.'
      : 'Arash is listening as a person. Ask normally, or give him a clear task when you want action.', false);
    try {
      const endpoint = this.target === 'aida' ? '/api/aida-messages' : '/api/creator-messages';
      const res = await fetch(endpoint);
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
    if (!text || this._sendInProgress) return;

    this._sendInProgress = true;
    this.$input.value = '';
    this.$input.disabled = true;
    this.$send.disabled = true;
    this.$send.textContent = '...';
    this._addMessage('creator', text, true);

    try {
      const endpoint = this.target === 'aida' ? '/api/aida-message' : '/api/directive';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (this.target === 'arash' && data.directives && data.directives.length > 0 && this.onDirectivesUpdate) {
        this.onDirectivesUpdate(data.directives);
        this._showDirectiveConfirm(data.directives);
      }
    } catch (e) {
      this._addMessage('system', 'The village channel did not answer. Try again.', true);
      console.error('[Creator] Send failed:', e.message);
    } finally {
      this.$input.disabled = false;
      this.$send.disabled = false;
      this.$send.textContent = 'Send';
      this._sendInProgress = false;
      this.$input.focus();
    }
  }

  _addMessage(role, content, animate = false) {
    if (!this.$messages || !content) return;
    const div = document.createElement('div');
    div.className = `creator-msg creator-msg--${role}${animate ? ' creator-msg--new' : ''}`;
    const label = role === 'creator'
      ? 'Creator'
      : role === 'arash'
        ? 'Arash'
        : role === 'aida'
          ? 'Aida'
          : 'System';
    div.innerHTML = `<span class="msg-label">${label}</span><p class="msg-text">${this._escapeHtml(content)}</p>`;
    this.$messages.appendChild(div);
    this._scrollToBottom();
  }

  _showDirectiveConfirm(directives) {
    const count = directives.length;
    const labels = directives.map(d => `• ${d.label} @ ${d.time}${d.recurring ? ' (daily)' : ''}`).join('\n');
    const div = document.createElement('div');
    div.className = 'creator-msg creator-msg--system creator-msg--new';
    div.innerHTML = `<span class="msg-label">Schedule Updated</span><p class="msg-text">${count} directive(s) scheduled:\n${this._escapeHtml(labels)}</p>`;
    this.$messages.appendChild(div);
    this._scrollToBottom();
  }

  _scrollToBottom() {
    if (this.$messages) this.$messages.scrollTop = this.$messages.scrollHeight;
  }

  _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  onNewMessage(arashResponse) {
    if (this.target === 'arash') this._addMessage('arash', arashResponse, true);
  }

  onNewAidaMessage(aidaResponse) {
    if (this.target === 'aida') this._addMessage('aida', aidaResponse, true);
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
