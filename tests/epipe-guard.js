'use strict';

// Test runners may close their stdout/stderr capture pipes before Electron has
// finished shutting down.  Windows reports that harmless condition as EPIPE;
// without an early listener Electron displays a modal "main process" error.
// Install this before importing Electron or any module that can write output.
const INSTALL_KEY = Symbol.for('syncwatch.tests.epipeGuardInstalled');

function isBrokenPipe(error) {
  return error?.code === 'EPIPE' || error?.cause?.code === 'EPIPE';
}

if (!process[INSTALL_KEY]) {
  process[INSTALL_KEY] = true;
  let fatalStreamErrorScheduled = false;

  for (const stream of new Set([
    process.stdout, process.stderr, console._stdout, console._stderr
  ])) {
    stream?.on?.('error', (error) => {
      if (isBrokenPipe(error) || fatalStreamErrorScheduled) return;
      fatalStreamErrorScheduled = true;
      process.nextTick(() => { throw error; });
    });
  }

  // Writable streams normally emit EPIPE asynchronously.  Keep a narrow
  // fallback for runtimes that surface the same error synchronously from a
  // console call or as an unhandled rejection.
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method];
    if (typeof original !== 'function') continue;
    console[method] = function guardedConsoleWrite(...arguments_) {
      try {
        return Reflect.apply(original, this, arguments_);
      } catch (error) {
        if (!isBrokenPipe(error)) throw error;
        return undefined;
      }
    };
  }

  const handleUncaughtException = (error) => {
    if (isBrokenPipe(error)) return;
    process.removeListener('uncaughtException', handleUncaughtException);
    throw error;
  };
  const handleUnhandledRejection = (error) => {
    if (isBrokenPipe(error)) return;
    process.removeListener('unhandledRejection', handleUnhandledRejection);
    throw error instanceof Error ? error : new Error(String(error));
  };
  process.prependListener('uncaughtException', handleUncaughtException);
  process.prependListener('unhandledRejection', handleUnhandledRejection);
}

module.exports = { isBrokenPipe };
