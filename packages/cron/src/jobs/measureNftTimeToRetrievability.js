import * as assert from 'assert'
import fetch from '@web-std/fetch'
import { NFTStorage } from 'nft.storage'
import { EnvironmentLoader } from 'safe-env-vars'
import { Milliseconds, now } from '../lib/time.js'
import { File } from '@web-std/file'

const env = new EnvironmentLoader()
const NFT_STORAGE_API_KEY = env.string.get('NFT_STORAGE_API_KEY')
export const EXAMPLE_NFT_IMG_URL = new URL(
  'https://bafybeiarmhq3d7msony7zfq67gmn46syuv6jrc6dagob2wflunxiyaksj4.ipfs.dweb.link/1681.png'
)

/**
 * @typedef RetrieveLog
 * @property {"retrieve"}   type
 * @property {string}       image
 * @property {URL}          url
 * @property {number}       contentLength
 * @property {Date}         startTime
 * @property {Milliseconds} duration
 */

/**
 * @typedef {import('nft.storage/dist/src/token').TokenInput} TokenInput
 */

/**
 * @template {TokenInput} T
 * @typedef {import('nft.storage').TokenType<T>} TokenType
 */

/**
 * @typedef {(token: TokenInput) => Promise<Pick<TokenType<TokenInput>, 'ipnft'>>} StoreFunction
 */

/**
 * @returns {AsyncIterable<File>}
 */
export function TestImages(count = 1) {
  return (async function* () {
    while (count--) {
      yield new File([Uint8Array.from([1, 2, 3])], 'image.png', {
        type: 'image/png',
      })
    }
  })()
}

/**
 * @param  {...URL} urls
 * @returns {AsyncIterable<Blob>}
 */
export function UrlImages(...urls) {
  return (async function* () {
    for (const url of urls) {
      const resp = await fetch(url.toString())
      yield resp.blob()
    }
  })()
}

/**
 * Job that tests/measures steps
 * * prepare a sample image
 * * upload to nft.storage
 * * retrieve image through ipfs gateway
 * @template {import('nft.storage/dist/src/lib/interface').TokenInput} T
 * @param {object} config
 * @param {AsyncIterable<Blob>} config.images - images to upload/retrieve
 * @param {StoreFunction} [config.store] - function to store nft
 * @param {string} [config.url] - URL to nft.storage to measure
 * @param {string} [config.metricsPushGateway] - Server to send metrics to. should be a https://github.com/prometheus/pushgateway
 * @param {import('../lib/log.js').LogFunction} config.log - logger
 * @param {object} secrets
 * @param {string} secrets.nftStorageToken - API Token for nft.storage
 * @param {string} [secrets.metricsPushGatewayBasicAuthUser] - authorization for metricsPushGateway
 */
export async function measureNftTimeToRetrievability(config, secrets) {
  const start = {
    type: 'start',
    job: 'measureNftTimeToRetrievability',
    config,
  }
  config.log('info', start)
  for await (const image of config.images) {
    const imageId = Number(new Date()).toString()
    const nft = {
      image: /** @type {Blob} */ (image), // use image Blob as `image` field
      name: 'Example NFT',
      description: 'Example NFT used by nft.storage cron nft-ttr',
    }
    const client = new NFTStorage({
      token: secrets.nftStorageToken,
    })
    const storeStartedDate = new Date()
    const storeStartedAt = now()
    /** @type {StoreFunction} */
    const store = config.store || ((nft) => client.store(nft))
    const metadata = await store(nft)
    const storeEndAt = now()
    const storeLog = {
      type: 'store',
      image: imageId,
      startTime: storeStartedDate,
      duration: new Milliseconds(
        storeEndAt.toNumber() - storeStartedAt.toNumber()
      ),
    }
    config.log('info', storeLog)
    const retrievalUrl = new URL(
      `https://${metadata.ipnft}.ipfs.nftstorage.link/image/blob`
    )
    const retrieveFetchDate = new Date()
    const retrieveFetchStart = now()
    const retrieveImageResponse = await fetch(retrievalUrl.toString())
    const retrievedImage = await retrieveImageResponse.blob()
    const retrieveReadEnd = now()
    const retrievalDuration = new Milliseconds(
      retrieveReadEnd.toNumber() - retrieveFetchStart.toNumber()
    )
    /** @type {RetrieveLog} */
    const retrieve = {
      type: 'retrieve',
      image: imageId,
      url: retrievalUrl,
      contentLength: retrievedImage.size,
      startTime: retrieveFetchDate,
      duration: retrievalDuration,
    }
    config.log('info', retrieve)
    const { metricsPushGateway } = config
    const { metricsPushGatewayBasicAuthUser } = secrets
    if (metricsPushGateway) {
      assert.ok(
        metricsPushGatewayBasicAuthUser,
        'expected metricsPushGatewayBasicAuthUser'
      )
      await pushRetrieveMetrics(
        {
          metricsPushGateway,
          metricsPushGatewayBasicAuthUser,
          log: config.log,
        },
        retrieve
      )
    } else {
      config.log(
        'warn',
        'skipping pushRetrieveMetrics because no metricsPushGateway is configured'
      )
    }
  }
  config.log('info', { type: 'finish' })
}

/**
 * Push retrieval metrics to a pushgateway
 * @param {object} config
 * @param {string} config.metricsPushGateway - Server to send metrics to. should be a https://github.com/prometheus/pushgateway
 * @param {string} config.metricsPushGatewayBasicAuthUser - authorization for metricsPushGateway
 * @param {import('../lib/log.js').LogFunction} config.log - logger
 * @param {RetrieveLog} retrieval
 */
async function pushRetrieveMetrics(config, retrieval) {
  /** @type [string, RequestInit] */
  const pushRequest = [
    config.metricsPushGateway,
    {
      method: 'post',
      headers: {
        authorization: basicAuthorizationHeaderValue(
          config.metricsPushGatewayBasicAuthUser
        ),
        'content-type': 'application/octet-stream',
      },
      body: [formatRetrievalMetrics(retrieval)].join('/n'),
    },
  ]
  const pushResponse = await fetch.apply(null, pushRequest)
  if (![200, 201].includes(pushResponse.status)) {
    config.log('warn', {
      type: 'error',
      message: 'unsuccessful metrics push',
      text: await pushResponse.text(),
    })
  }
  assert.equal(pushResponse.status, 201)
}

/**
 * @param {string} [user]
 * @param {string} [password]
 * @returns {`Basic ${string}`} - http Authorization header value
 */
function basicAuthorizationHeaderValue(user = '', password = '') {
  const basicAuthValue = btoa(`${user}:${password}`)
  const headerValue = /** @type {const} */ (`Basic ${basicAuthValue}`)
  return headerValue
}

/**
 * Format metrics about a retrieval into a format that a prometheus pushgateway expects.
 * Example output: https://github.com/web3-storage/web3.storage/blob/main/.github/workflows/cron-test.yml#L38
 * @param {RetrieveLog} retrieval
 * @returns {string} prometheus metrics string
 */
function formatRetrievalMetrics(retrieval) {
  const durationSeconds = retrieval.duration.size / 1000
  return [
    '# HELP nftstorage_retrieval_duration_seconds How long it took to retrieve an nft image',
    '# TYPE nftstorage_retrieval_duration_seconds gauge',
    `nftstorage_retrieval_duration_seconds{image="${retrieval.image}",url="${retrieval.url}",size="${retrieval.contentLength}"} ${durationSeconds}`,
  ].join('\n')
}
