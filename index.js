var pattern = require('bitsyntax').compile,
constructor = require('bitsyntax').constructor,
EventEmitter = require('events').EventEmitter;

// All SPDY drafts <= 3 have the same framing.
var parseFrame = pattern('header:32, ' +
                         'flags:8, length:24, ' +
                         'data:length/binary, rest/binary');

function SPDYParser(stream) {
  this.stream = stream;
  this.accum = new Buffer(0);

  var self = this;
  stream.on('data', function(data) {
    return self.parse(data);
  });
  stream.on('end', function() {
    return self.emit('end');
  });
  stream.on('error', function(err) {
    return self.emit('error', err);
  });
  stream.on('close', function() {
    return self.emit('close');
  });
}
var P = SPDYParser.prototype = new EventEmitter();

// FIXME better to detect an incorrect header (first 32 bits) before
// interpreting anything as the length. This won't matter for data
// frames, which have no distinguishing features other than 0 in the
// highest bit, but it might help with pathological control(-looking)
// frames.
P.parse = function(data0) {
  var accum = this.accum;

  if (data0.length === 0) { return true; }

  var data;
  if (accum.length === 0) {
    data = data0;
  }
  else {
    data = new Buffer(accum.length + data0.length);
    accum.copy(data, 0);
    data0.copy(data, accum.length);
  }

  var frame = parseFrame(data);
  while (frame) {
    data = frame.rest;
    this.emitFrame(frame);
    frame = parseFrame(data);
  }
  this.accum = data;
  return true;
}

P.emitFrame = function(frame) {
  var header = frame.header;
  // is the top bit set? (header is 32 bits)
  if (header > 0x80000000) {
    var version = (header & 0x7fff0000) / 0x10000;
    var type = header & 0x0000ffff;
    return this.emit('controlFrame', {version: version,
                                      type: type,
                                      flags: frame.flags,
                                      data: frame.data});
  }
  else {
    var streamId = header & 0x7fffffff;
    return this.emit('dataFrame', {streamId: streamId,
                                   flags: frame.flags,
                                   data: frame.data});
  }
};

var controlFrame = constructor('header:16, type:16,' +
                               'flagsAndLength:32, data/binary');
var dataFrame = constructor('header:32, flagsAndLength:32, data/binary');

P.writeControl = function(version, type, flags, data) {
  // Interpreters can do better than this
  if (version > 0x8000) {
    throw "Version out of bounds; must fit in 15 bits";
  }
  if (type > 0xffff) {
    throw "Type out of bounds; must fit in 16 bits";
  }
  var length = data.length;
  if (length > 0xffffff) {
    throw "Data too large; size must be <= 0xffffff";
  }
  var header = 0x8000 + version;
  return this.stream.write(
    controlFrame({header: header, type: type,
                  flagsAndLength: flags * 0x1000000 + length,
                  data: data}));
};

P.writeData = function(streamId, flags, data) {
  if (streamId > 0x80000000) {
    throw "StreamId out of range (must be 31 bits integer): " + streamId;
  }
  var length = data.length;
  if (length > 0xffffff) {
    throw "Data too large; size must be <= 0xffffff";
  }
  return this.stream.write(
    dataFrame({header: streamId,
               flagsAndLength: flags * 0x1000000 + length,
               data: data}));
};

exports.SPDYParser = SPDYParser;
