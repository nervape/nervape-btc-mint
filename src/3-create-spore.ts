import "global-agent/bootstrap";
import {
  Collector,
  buildRgbppLockArgs,
  appendCkbTxWitnesses,
  updateCkbTxWithRealBtcTxId,
  sendCkbTx,
  genCreateSporeCkbVirtualTx,
  Hex,
  appendIssuerCellToSporesCreate,
  generateSporeCreateCoBuild,
} from '@rgbpp-sdk/ckb';
import { DataSource, ECPair, bitcoin, NetworkType, sendRgbppUtxos, transactionToHex, utf8ToBuffer } from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import { RawSporeData } from '@spore-sdk/core'
import fs from 'fs';
import path from 'path';
import { 
  CKB_PRIVATE_KEY, isMainnet, getMintList, calculateDNA, 
  getDeployVariables, writeStepLog, readStepLog,
  getFastestFeeRate,
  buildReceiversAndSpores,
  checkStepExists
} from "./config"

interface Params {
  utxo: {
    txid: string,
    index: number
  };
  receivers: {
    toBtcAddress: string,
    sporeData: RawSporeData
  }[];
}

const createSpore = async ({ utxo, receivers }: Params) => {
  const feeRate = await getFastestFeeRate()
  console.log("feeRate = ", feeRate)
  const clusterRgbppLockArgs = buildRgbppLockArgs(utxo.index, utxo.txid)

  const { collector, source, service, ckbAddress, btcKeyPair, btcAddress } = getDeployVariables()

  const ckbVirtualTxResult = await genCreateSporeCkbVirtualTx({
    collector,
    sporeDataList: receivers.map(receiver => receiver.sporeData),
    clusterRgbppLockArgs,
    isMainnet,
    ckbFeeRate: BigInt(5000)
  });

  const { commitment, ckbRawTx, sumInputsCapacity, clusterCell } = ckbVirtualTxResult;

  // Send BTC tx
  // The first btc address is the owner of the cluster cell and the rest btc addresses are spore receivers
  const btcTos = [btcAddress!, ...receivers.map((receiver) => receiver.toBtcAddress)];
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    commitment,
    tos: btcTos,
    ckbCollector: collector,
    from: btcAddress!,
    source,
    feeRate: feeRate,
  });
  psbt.signAllInputs(btcKeyPair);
  psbt.finalizeAllInputs();

  const btcTx = psbt.extractTransaction();
  const btcTxBytes = transactionToHex(btcTx, false);
  
  writeStepLog(`3-${batchNo}-btcTxBytes`, {
    btcTxBytes
  })

  const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());

  console.log('BTC TxId: ', btcTxId);
  // console.log('BTC btcTxBytes: ', btcTxBytes);

  writeStepLog(`3-${batchNo}`, {
    txid: btcTxId,
    index: 1,
    btcTxBytes: btcTxBytes
  })

  const interval = setInterval(async () => {
    try {
      console.log('Waiting for BTC tx and proof to be ready');
      const rgbppApiSpvProof = await service.getRgbppSpvProof(btcTxId, 0);
      clearInterval(interval);
      // Update CKB transaction with the real BTC txId
      const newCkbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId, isMainnet });
      console.log('The new cluster lock args: ', newCkbRawTx.outputs[0].lock.args);

      const ckbTx = await appendCkbTxWitnesses({
        ckbRawTx: newCkbRawTx,
        btcTxBytes,
        rgbppApiSpvProof,
      });

      // Replace cobuild witness with the final rgbpp lock script
      ckbTx.witnesses[ckbTx.witnesses.length - 1] = generateSporeCreateCoBuild({
        // The first output is cluster cell and the rest of the outputs are spore cells
        sporeOutputs: ckbTx.outputs.slice(1),
        sporeOutputsData: ckbTx.outputsData.slice(1),
        clusterCell,
        clusterOutputCell: ckbTx.outputs[0]
      });

      const signedTx = await appendIssuerCellToSporesCreate({
        secp256k1PrivateKey: CKB_PRIVATE_KEY,
        issuerAddress: ckbAddress,
        ckbRawTx: ckbTx,
        collector,
        sumInputsCapacity,
        isMainnet,
      });

      const txHash = await sendCkbTx({ collector, signedTx });
      console.info(`RGB++ Spore has been created and tx hash is ${txHash}`);

      writeStepLog(`3-${batchNo}-ckbtx`, {
        txHash
      })
    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};


const batchNo = process.argv[2]
if (!batchNo) {
  throw new Error("No `batchNO`");
}
if (checkStepExists('3', parseInt(batchNo))) {
  throw new Error(`batchNo: ${batchNo} distributed`);
}
const { clusterId } = readStepLog('2')
const { clusterBlockHeight } = readStepLog('2-cluster-block-height')
const mintList = getMintList(parseInt(batchNo))
if (mintList.length === 0) {
  throw new Error("No mint list");
}

// console.log("mintList=", mintList)

const { txid, index } = readStepLog(`3-${parseInt(batchNo) - 1}`)
console.log("utxo = ", `${txid}:${index}`)

// createSpore({
//   utxo: {
//     txid: txid,
//     index: index
//   },
//   receivers: buildReceiversAndSpores(mintList, clusterId, clusterBlockHeight)
// })