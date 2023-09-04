# fast-walk-fs
[![npm version](https://badge.fury.io/js/fast-walk-fs.svg)](http://badge.fury.io/js/fast-walk-fs) [![license](https://img.shields.io/npm/l/fast-walk-fs.svg)](http://badge.fury.io/js/fast-walk-fs)

A library for efficiently walking large file system structures.

## Highlights

* Concurrently performs io operations for speed.
* Proper [backpressure](https://medium.com/@jayphelps/backpressure-explained-the-flow-of-data-through-software-2350b3e77ce7) handling for minimum memory & cpu usage.
* Built-in filtering.
* Flexible error handling.

[![js-standard-style](https://raw.githubusercontent.com/feross/standard/master/badge.png)](https://github.com/feross/standard)

  * <a href="#install">Installation</a>
  * <a href="#usage">Usage</a>
  * <a href="#examples">Examples</a>
  * <a href="#license">Licence &amp; copyright</a>

## Install

`npm i fast-walk-fs --save`

## Usage
`const walk = require('fast-walk-fs');`

`walk(directory, [options])` returns a [Readable stream](https://nodejs.org/api/stream.html#stream_class_stream_readable).
Every walked entry has following properties:
* `path` : absolute path.
* `name` : name of the entry within its parent.
* `depth` : Depth within the folder structure.
* `stats` : An instance of `fs.Stats` class.

`fast-walk-fs` will not stop iterating when an error is encountered, you have to listen to events `error-readdir` and `error-stat` to handle errors. Optionally `fs.walk` can be stopped by calling `end` explicitely.

### directory
* Required: `true`

The path of the directory to walk.

### options
* Type: `object`
* Required: `false`
* Default: undefined

#### visit
* Type: `function`
* Required: `false`
* Default: undefined

A function executed to determine if an entry should be walked or not. 

This function must return `true` if the entry has to be walked.

#### maxConcurrency
* Type: `number`
* Required: `false`
* Default: 10

The maximum number of concurrent IO operations allowed to be performed.

`fast-walk-fs` self adapts the number of concurrent operations. For example if consuming entries is slow, `fast-walk-fs` internally decreases the number of concurrent IO operations. For example, will not cause excessive memory usage:
```javascript
const walk = require('fast-walk-fs');

function pause(timeMs) {
    return new Promise(resolve => {
        setTimeout(() => resolve(true), timeMs);
    })
}

const entries = walk('./someLargeDir', { maxConcurrency });
for await (const entry of entries) {
  await pause(100);
}
```

## Examples

### Stream (push)

```javascript
const walk = require('fast-walk-fs');

walk('.').on('data', console.log)
```

### Streams (pull)

```javascript
const walk = require('fast-walk-fs');

walk('.').on('readable', () => {
  let entry;
  while ((entry = this.read()) !== null) {
    console.log(entry);
  }
})
```

### Async iteration (pull)

```javascript
const walk = require('fast-walk-fs');

for await (const entry in walk('.')) {
  console.log(entry);
}
```

### Error handling

```javascript
const walk = require('fast-walk-fs');

const entries = walk('.')
entries.on('error-readdir' (error, entry) => {
  console.log('error while reading directory contents', error, entry);
  // optionally, end to walk
  entries.end();
})
entries.on('error-stat' (error, entry) => {
  console.log('error when stat', error, entry);
})
for await (const entry in entries) {
  console.log(entry);
}
```

### Filtering out everything at depth > 3

```javascript
const walk = require('fast-walk-fs');
const path = require('path');

const visit = (entry) => {
  return !entry.depth > 3;
}

let totalSize = 0
for await (const entry in walk('.', {visit})) {
  console.log(entry);
}
```

### Totaling size of txt files

```javascript
const walk = require('fast-walk-fs');
const path = require('path');

const visit = (entry) => {
  if (entry.stats.isFile()) {
    return path.extname(entry.name) === '.txt';
  }
  return true;
}

let totalSize = 0;
for await (const entry in walk('.', {visit})) {
  totalSize += entry.stats.size;
}
console.log(totalSize);
```

## License

ISC
