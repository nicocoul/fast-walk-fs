const { strictEqual } = require("assert");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { fileURLToPath } = require("url");

function queue(fun, callback, maxConcurrency = 1) {
  const _items = []
  let _running = 0
  let _concurrency = maxConcurrency
  let _stopped = false

  function _cb(error, result) {
    _running--
    if (_stopped) return
    callback(error, result)
    if (_running < _concurrency && _items.length) {
      _run(_items.shift())
    }
  }

  function push(item) {
    if (_running < _concurrency) {
      _run(item)
    } else {
      _items.push(item)
    }
  }

  function _run(item) {
    if (_stopped) return
    _running++
    fun(item, _cb)
  }

  function increaseConcurrency() {
    if (_concurrency === maxConcurrency) return
    _concurrency++
    if (_items.length) {
      _run(_items.shift())
    }
  }

  function _wait() {
    if (_stopped) return
    if (_concurrency === 0) {
      _timeout = setTimeout(_wait, 0)
    } else {
      if (_running < _concurrency && _items.length) {
        _run(_items.shift())
      }
    }
  }

  function decreaseConcurrency() {
    if (_concurrency > 0) {
      _concurrency--
      if (_concurrency === 0) {
        _wait()
      }
    }
  }

  function length() {
    return _items.length
  }

  function stop() {
    _stopped = true
  }

  return {
    push, increaseConcurrency, decreaseConcurrency, length, stop
  }
}
class FsWalker extends Readable {
  /**
   * @param {string} directory
   * @param {Object} options
   */
  constructor(directory, options = {}) {
    if (directory instanceof URL) {
      directory = fileURLToPath(directory);
    }
    strictEqual(
      typeof directory,
      "string",
      `'directory' parameter should be of type string or file URL.`
    )
    strictEqual(
      typeof options,
      "object",
      `'options' parameter should be of type object.`
    )
    const maxConcurrency = options.maxConcurrency || 10
    strictEqual(
      typeof maxConcurrency,
      "number",
      `option 'maxConcurrency' should be of type number.`
    )
    if (options.visit) {
      strictEqual(
        typeof options.visit,
        "function",
        `option 'visit' should be of type function.`
      )
    }
    super({
      ...options,
      objectMode: true,
    })
    this.maxConcurrency = parseInt(maxConcurrency)
    this.visit = options.visit
    this.minEntries = 5000
    this.io = 1
    this.ahead = 0

    this.entries = queue(this.stat, this.onStat.bind(this), this.maxConcurrency)

    this.directories = queue(this.readdir, this.onReaddir.bind(this), 1)
    this.directories.decreaseConcurrency()
    this.directories.push({ path: path.resolve(directory), depth: -1 })
  }

  readdir(directory, cb) {
    fs.readdir(directory.path, (error, entries) => {
      if (error) {
        cb(error, { directory })
      } else {
        cb(null, { directory, entries })
      }
    })
  }

  stat(entry, cb) {
    fs.stat(entry.path, (error, stats) => {
      if (error) {
        cb(error, entry)
      } else {
        entry.stats = stats
        cb(null, entry)
      }
    })
  }

  onReaddir(error, result) {
    this.io--
    if (error) {
      this.emit('error-readdir', error, result.directory)
    } else {
      const depth = result.directory.depth + 1
      result.entries.forEach((name) => {
        this.io++
        this.entries.push({
          path: path.join(result.directory.path, name),
          name,
          depth
        })
      })
    }
  }

  onStat(error, result) {
    this.io--
    if (error) {
      this.emit('error-stat', error, result)
    } else {
      if (!this.visit || this.visit(result)) {
        if (result.stats.isDirectory()) {
          this.io++
          this.directories.push(result)
        }
        this.push(result)
        this.ahead++
      }
    }
    if (this.entries.length() > this.minEntries) {
      this.directories.decreaseConcurrency()
    } else {
      this.directories.increaseConcurrency()
    }
    if (this.ahead < this.maxConcurrency) {
      this.entries.increaseConcurrency()
    } else {
      this.entries.decreaseConcurrency()
    }
    if (this.io === 0) {
      this.end()
    }
  }

  _read() {
    this.ahead--
    if (this.entries.length() < this.minEntries) {
      this.directories.increaseConcurrency()
    }
    this.entries.increaseConcurrency()
  }

  end() {
    this.entries.stop()
    this.directories.stop()
    this.push(null)
  }
}

/**
 * @param {string} directory
 * @param {Object} [options]
 */
function fastFsWalk(directory, options) {
  return new FsWalker(directory, options)
}

module.exports = fastFsWalk
