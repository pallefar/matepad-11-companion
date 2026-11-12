'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

/**
 * Run one process, stream both stdout and stderr as lines, and never use a shell
 * for arguments we build ourselves. Cancellation kills the whole tree.
 */
function runProcess(command, args = [], options = {}) {
  const {
    cwd,
    env,
    timeoutMs = 180000,
    onLine,
    signal,
    windowsHide = true,
    maxBuffer = 300000,
  } = options;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let child;
    let killTimer = null;

    const emitLine = (line, stream) => {
      if (!line) return;
      if (typeof onLine === 'function') {
        try {
          onLine(line, stream);
        } catch {
          /* a consumer error must not break process handling */
        }
      }
    };

    const lineFeeders = {
      stdout: makeLineFeeder((line) => emitLine(line, 'stdout')),
      stderr: makeLineFeeder((line) => emitLine(line, 'stderr')),
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      lineFeeders.stdout.flush();
      lineFeeders.stderr.flush();
      resolve({
        command,
        args,
        code: result.code ?? null,
        signal: result.signal ?? null,
        stdout,
        stderr,
        combined: `${stdout}${stderr}`,
        timedOut,
        error: result.error ? String(result.error.message || result.error) : null,
        durationMs: Date.now() - startedAt,
      });
    };

    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...(env || {}) },
        windowsHide,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (error) {
      finish({ code: -1, error });
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) stdout = stdout.slice(-maxBuffer);
      lineFeeders.stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) stderr = stderr.slice(-maxBuffer);
      lineFeeders.stderr.push(chunk);
    });
    child.on('error', (error) => finish({ code: -1, error }));
    child.on('close', (code, closeSignal) => finish({ code, signal: closeSignal }));

    if (typeof signal !== 'undefined' && signal) {
      if (signal.aborted) {
        killChild(child);
        finish({ code: null, signal: 'SIGTERM' });
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          killChild(child);
          finish({ code: null, signal: 'SIGTERM' });
        },
        { once: true },
      );
    }

    if (timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        killChild(child);
      }, timeoutMs);
      if (typeof killTimer.unref === 'function') killTimer.unref();
    }
  });
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 1500).unref?.();
    }
  } catch {
    /* ignore */
  }
}

function makeLineFeeder(onLine) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n/g, '\n');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.length > 0) onLine(line);
        index = buffer.indexOf('\n');
      }
      if (buffer.length > 4000) {
        onLine(buffer);
        buffer = '';
      }
    },
    flush() {
      if (buffer.trim()) onLine(buffer);
      buffer = '';
    },
  };
}

/**
 * A tiny helper for callers that only need captured output.
 */
async function runCapture(command, args, options = {}) {
  return runProcess(command, args, { ...options, onLine: undefined });
}

class ProcessRegistry {
  constructor() {
    this.events = new EventEmitter();
    this.active = new Map();
  }

  run(id, command, args, options = {}) {
    const controller = new AbortController();
    this.active.set(id, controller);
    this.events.emit('start', { id, command, args });
    return runProcess(command, args, {
      ...options,
      signal: controller.signal,
    }).finally(() => {
      this.active.delete(id);
      this.events.emit('end', { id });
    });
  }

  cancel(id) {
    const controller = this.active.get(id);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  cancelAll() {
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  isRunning(id) {
    return this.active.has(id);
  }
}

module.exports = { runProcess, runCapture, killChild, ProcessRegistry };
