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
import { utf8ToBuffer } from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import { RawSporeData } from '@spore-sdk/core'
import { 
  CKB_PRIVATE_KEY, isMainnet, 
  getMintList, getDeployVariables,
  readStepLog,
  buildReceiversAndSpores,
  writeStepLog
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
  const { collector, service, ckbAddress } = getDeployVariables()
  const clusterRgbppLockArgs = buildRgbppLockArgs(utxo.index, utxo.txid)

  const ckbVirtualTxResult = await genCreateSporeCkbVirtualTx({
    collector,
    sporeDataList: receivers.map(receiver => receiver.sporeData),
    clusterRgbppLockArgs,
    isMainnet
  });

  const { commitment, ckbRawTx, sumInputsCapacity, clusterCell } = ckbVirtualTxResult;

  const { txid: btcTxId, btcTxBytes } = readStepLog(`3-${batchNo}`)

  const interval = setInterval(async () => {
    try {
      console.log('Waiting for BTC tx and proof to be ready');
      console.log("btcTxId=", btcTxId)
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
      writeStepLog(`3-${batchNo}-ckbtx`, {
        txHash
      })
      console.info(`RGB++ Spore has been created and tx hash is ${txHash}`);
    } catch (error) {
      console.log("err = ", error)
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
const { clusterId } = readStepLog('2')
const { clusterBlockHeight } = readStepLog('2-cluster-block-height')
const mintList = getMintList(parseInt(batchNo))
if (mintList.length === 0) {
  throw new Error("No mint list");
}

const { txid, index } = readStepLog(`3-${parseInt(batchNo) - 1}`)
console.log("utxo = ", `${txid}:${index}`)

createSpore({
  utxo: {
    txid: txid,
    index: index
  },
  receivers: buildReceiversAndSpores(mintList, clusterId, clusterBlockHeight)
})

