class ProcessOutputBuffer {
  constructor({ send, intervalMs = 80, maxChunk = 16384, maxPending = 65536 } = {}) {
    this.send = send;
    this.intervalMs = intervalMs;
    this.maxChunk = maxChunk;
    this.maxPending = maxPending;
    this.pending = new Map();
    this.dropped = new Map();
    this.timer = null;
  }

  write(channel, value) {
    const text = String(value ?? '');
    const current = this.pending.get(channel) || '';
    const available = Math.max(0, this.maxPending - current.length);
    this.pending.set(channel, current + text.slice(0, available));
    if (text.length > available) {
      this.dropped.set(channel, (this.dropped.get(channel) || 0) + text.length - available);
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const [channel, pending] of this.pending) {
      const chunk = pending.slice(0, this.maxChunk);
      const remaining = pending.slice(this.maxChunk);
      if (chunk) this.send(channel, chunk);
      if (remaining) this.pending.set(channel, remaining);
      else this.pending.delete(channel);
    }
    for (const [channel, count] of this.dropped) {
      if (!this.pending.has(channel) && count > 0) {
        this.send(channel, `\n[codeGO limitó ${count.toLocaleString('es-MX')} caracteres de salida repetitiva para mantener la aplicación estable.]\n`);
        this.dropped.delete(channel);
      }
    }
    if (this.pending.size || this.dropped.size) this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.pending.size) this.flush();
    this.flush();
  }
}

module.exports = { ProcessOutputBuffer };
