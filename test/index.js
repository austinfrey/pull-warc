const path = require('path')
const { pull, values, drain } = require('pull-stream')
const Defer = require('pull-defer').source
const tape = require('tape')
const {
  readWarcFile,
  writeWarcFile,
  CDXIndexerStream,
  getWarcRecord,
  serializeWarcRecord,
} = require('..')

tape('read out warc records from a warc file', function (t) {
  const warcPath = path.join(__dirname, 'warcs', 'example.warc')
  var warcInfo

  pull(
    readWarcFile(warcPath),
    drain(
      (warcRecord) => {
        if (!warcInfo) {
          warcInfo = warcRecord
        }
        t.ok(warcRecord)
      },
      (err) => {
        if (err) {
          t.fail(err)
        }
        t.equal(
          warcInfo.warcType,
          'warcinfo',
          'first entry WARC-Type === "warcinfo"'
        )
        t.end()
      }
    )
  )
})

tape('read out a single record using an offset', function (t) {
  t.plan(2)
  const warcPath = path.join(__dirname, 'warcs', 'example.warc')
  const index = {}
  const deferred = Defer()

  pull(
    CDXIndexerStream(warcPath),
    drain(
      (cdx) => {
        index[cdx.url] = cdx
      },
      (err) => {
        if (err) {
          return t.fail(err)
        }

        const { offset, length } = index['http://example.com/']

        t.equal(offset, 409, 'WarcRecord offset === 409')

        deferred.resolve(getWarcRecord(warcPath, offset, length))
      }
    )
  )

  pull(
    deferred,
    drain(
      (warcRecord) => {
        t.equal(
          warcRecord.warcTargetURI,
          'http://example.com/',
          'WARC-Target-URI === http://example.com/'
        )
      },
      (err) => {
        if (err) {
          t.fail(JSON.stringify(err))
        }
      }
    )
  )
})

tape('create a new warc file', function (t) {
  const warcPath = path.join(__dirname, 'warcs', 'test.warc')
  const deferredCDX = Defer()
  const deferredGetWarcRecord = Defer()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const url = 'http://example.com/'
  const date = '2000-01-01T00:00:00Z'
  const type = 'response'
  const keepHeadersCase = true
  const warcHeaders = {
    'WARC-Record-ID': '<urn:uuid:12345678-feb0-11e6-8f83-68a86d1772ce>',
  }
  const httpHeaders = {
    'Custom-Header': 'somevalue',
    'Content-Type': 'text/plain; charset="UTF-8"',
  }

  let lastWarcRecord

  // write the warc file
  pull(
    values([
      // type req w/o content stream
      {
        url,
        type: 'request',
        warcHeaders,
        httpHeaders,
        keepHeadersCase,
      },
      //type res w/ content stream
      {
        contents: values([
          encoder.encode('and this is...\n'),
          encoder.encode('some more text'),
        ]),
        url: url + 'foo',
        date,
        type,
        warcHeaders,
        httpHeaders,
        keepHeadersCase,
      },
    ]),
    serializeWarcRecord(),
    writeWarcFile(warcPath, (err) => {
      if (err) {
        return t.fail(err)
      }

      t.ok(true, 'wrote test.warc')
      deferredCDX.resolve(CDXIndexerStream(warcPath, { gzip: true }))
    })
  )

  // read the warc file and check the last record is valid
  pull(
    deferredCDX,
    drain(
      (cdx) => {
        lastWarcRecord = cdx
      },
      (err) => {
        if (err) {
          return t.fail(err)
        }

        t.equal(
          lastWarcRecord.url,
          'http://example.com/foo',
          'cdx.url === "http://example.com/foo"'
        )

        const { offset, length } = lastWarcRecord

        deferredGetWarcRecord.resolve(
          getWarcRecord(warcPath, offset, length)
        )
      }
    )
  )

  var record
  // get last record and check contents
  pull(
    deferredGetWarcRecord,
    drain(
      (rec) => (record = rec),
      async (err) => {
        if (err) {
          return t.fail(err)
        }

        const buf = decoder.decode(await record.readFully())

        t.equal(
          buf,
          'and this is...\nsome more text',
          'record.readFully() === "and this is...\\nsome more text"'
        )
        t.end()
      }
    )
  )
})
