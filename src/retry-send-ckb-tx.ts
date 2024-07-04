import {
  Collector,
  buildRgbppLockArgs,
  appendCkbTxWitnesses,
  updateCkbTxWithRealBtcTxId,
  sendCkbTx,
  getSporeTypeScript,
  Hex,
  generateSporeTransferCoBuild,
  genTransferSporeCkbVirtualTx,
} from '@rgbpp-sdk/ckb';
import { DataSource, ECPair, bitcoin, NetworkType, sendRgbppUtxos, transactionToHex, utf8ToBuffer } from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError, ErrorCodes } from '@rgbpp-sdk/service';
import { RawSporeData } from '@spore-sdk/core'
import { serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  CKB_PRIVATE_KEY, isMainnet, getMintList, calculateDNA,
  getDeployVariables, writeStepLog, readStepLog,
  getFastestFeeRate,
  buildReceiversAndSpores
} from "./config"

// send ckb tx

const NERVAPE_SPORE_CODE_HASH = '0x4a4dce1df3dffff7f8b2cd7dff7303df3b6150c9788cb75dcf6747247132b9f5'
const RGBPP_CODE_HASH = '0xbc6c568a1a0d0a09f6844dc9d74ddb4343c32143ff25f727c59edf4fb72d6936'

const { collector, service } = getDeployVariables()

const vinput = process.argv[2]

const [ txid, i ] = vinput.split(":")

const index = parseInt(i) // input index

const retrySendTransferCkbTx = async() => {
  const tx = await service.getBtcTransaction(txid)
  const vin = tx.vin[index]
  
  const [ asset ] = await service.getRgbppAssetsByBtcUtxo(vin.txid, vin.vout)

  if (asset.cellOutput.lock.codeHash !== RGBPP_CODE_HASH) throw new Error("Not rgbpp asset");
  if (asset.cellOutput.type?.codeHash !== NERVAPE_SPORE_CODE_HASH) throw new Error("Not nervape spore");

  const sporeRgbppLockArgs = asset.cellOutput.lock.args
  const sporeId = asset.cellOutput.type.args

  const sporeTypeBytes = serializeScript({
    ...getSporeTypeScript(isMainnet),
    args: sporeId,
  });

  const ckbVirtualTxResult = await genTransferSporeCkbVirtualTx({
    collector,
    sporeRgbppLockArgs,
    sporeTypeBytes,
    isMainnet,
  });
  const { commitment } = ckbVirtualTxResult

  // check commitment
  // "scriptpubkey": "6a20beca3d7875be552b157fc563e882eedf0179a16cacf8cccf4178769364033eb5",
  // "scriptpubkey_asm": "OP_RETURN OP_PUSHBYTES_32 beca3d7875be552b157fc563e882eedf0179a16cacf8cccf4178769364033eb5",
  // "scriptpubkey_type": "op_return",
  // "value": 0
  if (tx.vout[0].scriptpubkey_type !== 'op_return') throw new Error("Not op_return");  
  if (tx.vout[0].scriptpubkey.slice(4) !== commitment) throw new Error("Mismatch commitment");
  
  try {
    const { state, failedReason } = await service.getRgbppTransactionState(txid)
    console.log("rgbpp state = ", state, failedReason)
  } catch(e: any) {
    if ((e instanceof BtcAssetsApiError) && e.code === ErrorCodes.ASSETS_API_RESOURCE_NOT_FOUND) {
      // send rgpp transaction
      const payload = { btc_txid: txid, ckb_virtual_result: ckbVirtualTxResult }
      console.log('start send rgbpp ckb tx')
      const { state } = await service.sendRgbppCkbTransaction(payload)
      console.log("rgbpp ckb tx sent = ", state)
    }
  }
}

retrySendTransferCkbTx()