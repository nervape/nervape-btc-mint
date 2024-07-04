import "./global-proxy";
import dotenv from 'dotenv';
import fs from "fs"
import path from 'path';
import { sha256 } from 'js-sha256';
import { AddressPrefix, hexToBytes, addressToScript, getTransactionSize, privateKeyToAddress } from '@nervosnetwork/ckb-sdk-utils';
import { DataSource, ECPair, bitcoin, NetworkType, sendRgbppUtxos, transactionToHex, sendBtc, utf8ToBuffer } from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import {
  Collector,
  MAX_FEE,
  NoLiveCellError,
  SECP256K1_WITNESS_LOCK_SIZE,
  append0x,
  buildRgbppLockArgs,
  calculateRgbppClusterCellCapacity,
  calculateTransactionFee,
  genRgbppLockScript,
  getSecp256k1CellDep,
} from '@rgbpp-sdk/ckb';

dotenv.config({ path: path.join(__dirname, "../.env.prod") })

export const CKB_PRIVATE_KEY = process.env.CKB_PRIVATE_KEY!

// BTC SECP256K1 private key
const BTC_PRIVATE_KEY = process.env.BTC_PRIVATE_KEY!
// API docs: https://btc-assets-api.testnet.mibao.pro/docs
const BTC_ASSETS_API_URL = process.env.BTC_ASSETS_API_URL!
// https://btc-assets-api.testnet.mibao.pro/docs/static/index.html#/Token/post_token_generate
const BTC_ASSETS_TOKEN = process.env.BTC_ASSETS_TOKEN!

const BTC_ASSETS_ORIGIN = process.env.BTC_ASSETS_ORIGIN!


export const network = process.env.NETWORK!
export const isMainnet = network === 'mainnet'

export function getDeployVariables() {
  const btcNetwork = isMainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const btcKeyPair = ECPair.fromPrivateKey(Buffer.from(BTC_PRIVATE_KEY, 'hex'), { network: btcNetwork });
  const { address: btcAddress } = bitcoin.payments.p2wpkh({
    pubkey: btcKeyPair.publicKey,
    network: btcNetwork,
  });
  const networkType = isMainnet ? NetworkType.MAINNET : NetworkType.TESTNET;
  const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);
  const source = new DataSource(service, networkType);

  const collector = new Collector({
    ckbNodeUrl: process.env.CKB_NODE_URL!,
    ckbIndexerUrl: process.env.CKB_INDEXER_URL!,
  });

  const ckbAddress = privateKeyToAddress(CKB_PRIVATE_KEY, {
    prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
  });
  const ckbMasterLock = addressToScript(ckbAddress);
  
  return {
    btcKeyPair,
    btcAddress,
    service,
    source,
    collector,
    ckbAddress,
    ckbMasterLock
  }
}

export function getClusterData() {
  const file = path.join(__dirname, `./data/${network}/cluster.json`)
  const {name, description} = JSON.parse(fs.readFileSync(file).toString())
  return {
    name,
    description: JSON.stringify(description)
  }
}

export function checkStepExists(step: string, batchNO: number) {
  const file = path.join(__dirname, `../logs/${network}/step-${step}-${batchNO}.log`)
  return fs.existsSync(file)
}

export function getMintList(batchNo: number) {
  if(batchNo <=0) throw new Error("Invalid batch no");
  const file = path.join(__dirname, `./data/${network}/mint-list.json`)
  const start = (batchNo - 1) * 100
  const end = batchNo * 100
  return JSON.parse(fs.readFileSync(file).toString()).slice(start, end)
}

export function calculateDNA(btcClusterBlockHeight: number, tokenId: number, receiverAddress: string) {
  var hash = sha256.create();
  hash.update(hexToBytes('0x' + btcClusterBlockHeight.toString(16)));
  hash.update(hexToBytes('0x' + tokenId.toString(16)));
  hash.update(receiverAddress);
  return hash.hex().slice(0, 32);
}

export function buildReceiversAndSpores(
  mintList: { address: string, token_id: number}[], 
  clusterId: string, 
  clusterBlockHeight: number
) {
  return mintList.map(({ address, token_id }) => {
    const dna = calculateDNA(clusterBlockHeight, token_id, address)
    return {
      toBtcAddress: address,
      sporeData: {
        contentType: 'dob/0',
        content: utf8ToBuffer(JSON.stringify({
          "id": token_id,
          "dna": dna,
        })),
        clusterId: clusterId
      }
    }
  })
}

export async function getFastestFeeRate() {
  const { source } = getDeployVariables()
  const fees = await source.getRecommendedFeeRates()
  const feeRate =  Math.ceil(fees.fastestFee * 2)
  return feeRate
}

export function writeStepLog(step: string, data: any) {
  const file = path.join(__dirname, `../logs/${network}/step-${step}.log`)
  if(typeof data !== 'string'){
    data = JSON.stringify(data)
  } 
  fs.writeFileSync(file, data);
}

export function readStepLog(step: string) {
  const file = path.join(__dirname, `../logs/${network}/step-${step}.log`)
  return JSON.parse(fs.readFileSync(file).toString());
}