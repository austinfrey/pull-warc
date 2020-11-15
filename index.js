const fs = require('fs')
const { pull, collect } = require('pull-stream')
const pullify = require('async-iterator-to-pull-stream')
const iterator = require('pull-stream-to-async-iterator')
const paramap = require('pull-paramap')
const file = require('pull-file')
const write = require('pull-write-file')
const { WARCParser, WARCRecord, WARCSerializer, CDXIndexer } = require('warcio')

exports.getWarcRecord = function (warcPath, offset, length) {
  let sent
  const options = {
    start: offset,
    end: offset + length,
  }

  return function read(end, cb) {
    return end
      ? cb(end)
      : sent
      ? cb(true)
      : pull(
          file(warcPath, options),
          collect(async (err, chunks) => {
            if (err) {
              return cb(err)
            }

            const parser = new WARCParser(chunks)
            const record = await parser.parse()

            sent = true
            cb(null, record)
          })
        )
  }
}

exports.readWarcFile = function (warcPath) {
  const reader = fs.createReadStream(warcPath)
  const parser = new WARCParser(reader)

  return pullify(parser)
}

exports.writeWarcFile = function (warcPath, cb) {
  const warcVersion = 'WARC/1.1'
  const info = {
    software: 'warcio.js/pull-warc in nodejs',
    format: 'WARC File Format 1.1',
    isPartOf: warcPath,
  }
  const filename = warcPath.split('/').pop()
  let started

  return pull(
    paramap(async (serializedWARCRecord, _cb) => {
      const records = []

      if (!started) {
        started = true
        const warcinfo = await WARCRecord.createWARCInfo(
          { filename, warcVersion },
          info
        )
        const serializedWARCInfo = await WARCSerializer.serialize(warcinfo, {})

        records.push(Uint8Array.from(serializedWARCInfo))
      }

      records.push(Uint8Array.from(serializedWARCRecord))

      return _cb(null, Buffer.concat(records))
    }),
    write(warcPath, cb)
  )
}

exports.serializeWarcRecord = () => {
  return paramap(async (opts, cb) => {
    let contents

    if (!opts.warcVersion) {
      opts.warcVersion = 'WARC/1.1'
    }

    if (opts.contents) {
      contents = iterator(opts.contents)
    }

    const record = await WARCRecord.create(opts, contents)
    const serializedWARCRecord = await WARCSerializer.serialize(record, {
      digest: { algo: 'sha-1', prefix: 'sha1:', base32: true },
    })

    return cb(null, serializedWARCRecord)
  })
}

exports.CDXIndexerStream = function (warcPath, opts) {
  const indexer = new CDXIndexer(opts)
  const reader = fs.createReadStream(warcPath)
  const files = [{ reader, filename: warcPath }]

  return pullify(indexer.iterIndex(files))
}
