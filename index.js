var SWEEM = require('sweem'),
    BS = require('bitsyntax');

function streamParser(stream, pattern) { // must have rest/binary
  var parse = BS.compile(pattern);
  var data = [];
  return SWEEM(stream).frames(function(accum, newdata) {
    var data;
    var frames = [];

    if (accum.length === 0) { data = newdata }
    else if (newdata.length === 0) { data = accum }
    else {
      data = new Buffer(accum.length + newdata.length);
      accum.copy(data, 0);
      newdata.copy(data, accum.length);
    }
    var bindings = parse(data);
    while (bindings) {
      frames.push(bindings);
      data = bindings.rest;
      bindings = parse(data);
    }

    return (frames.length > 0) ?
      {value: frames, rest: data} :
      {rest: data};
  }, []);
}

exports.parser = streamParser;
