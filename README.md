# pull-warc

`npm i pull-warc`

## Usage

Example

```js
const {pull, drain} = require('pull-stream')
const warc = require('pull-warc')

// get a warc-record starting at
// offset 0 with a length of 200
pull(
  warc.getWarcRecord(warcFilePath, 0, 200),
  drain(
    async (record) => {
      console.log(new TextDecoder.decode(await record.readFully()))
    }
  )
)

// read out all warc-records in a warc file
pull(
  warc.readWarcFile(warcFilePath),
  drain(
    (record) => {
      console.log(record)
    }
  )
)

// serialize warc-records and write them to a warc-file
pull(
  values([someWarcOpts])
  warc.serializeWarcRecord(),
  warc.writeWarcFile('path-to-warc.warc')
)

// generate CDX indexes
pull(
  warc.CDXIndexerStream('path-to-warc.warc'),
  drain(
    (cdx) => {
      if (cdx.mime === 'text/html') {
        // index it or something
      }
    }
  )
)
```

> note: consult the [warcio.js](https://github.com/webrecorder/warcio.js)
> documentation to see examples of dealing with `cdx` and `record` values

## getWarcRecord(warcFilePath, offset, length)

Source stream that emits one warc-record value

## readWarcFile(warcFilePath)

Source stream that will emit all ward-records in a warc file

## serializeWarcRecord()

Through stream that will serialize warc records

## writeWarcFile(warcFilePath)

Sink stream that will write serialized warc-records to a warc file

## CDXIndexerStream(warcFilePath)

Emits a stream of `cdx` values for indexing