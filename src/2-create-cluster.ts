import {
  Collector,
  buildRgbppLockArgs,
  appendCkbTxWitnesses,
  updateCkbTxWithRealBtcTxId,
  sendCkbTx,
  genCreateClusterCkbVirtualTx,
  generateClusterCreateCoBuild,
} from '@rgbpp-sdk/ckb';
import { DataSource, ECPair, bitcoin, NetworkType, sendRgbppUtxos, transactionToHex } from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import { getClusterData, isMainnet, getDeployVariables, writeStepLog, readStepLog, getFastestFeeRate } from "./config"

const createCluster = async ({ ownerRgbppLockArgs }: { ownerRgbppLockArgs: string }) => {
  const { collector, source, service, btcAddress, btcKeyPair } = getDeployVariables()
  const feeRate = await getFastestFeeRate()
  console.log("feeRate = ", feeRate)

  const clusterData = getClusterData()

  const ckbVirtualTxResult = await genCreateClusterCkbVirtualTx({
    collector,
    rgbppLockArgs: ownerRgbppLockArgs,
    clusterData: clusterData,
    isMainnet,
    ckbFeeRate: BigInt(5000)
  });

  const { commitment, ckbRawTx, clusterId } = ckbVirtualTxResult;

  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    commitment,
    tos: [btcAddress!],
    ckbCollector: collector,
    from: btcAddress!,
    source,
    feeRate: feeRate,
  });
  psbt.signAllInputs(btcKeyPair);
  psbt.finalizeAllInputs();

  const btcTx = psbt.extractTransaction();

  const btcTxBytes = transactionToHex(btcTx, false);

  // console.log("btcTxBytes=", btcTxBytes)
  // console.log('clusterId: ', clusterId);

  const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());

  writeStepLog('2', {
    txid: btcTxId,
    index: 1,
    clusterId,
    btcTxBytes
  })

  console.log('BTC TxId =', btcTxId);

  writeStepLog('3-0', {
    txid: btcTxId,
    index: 1,
    btcTxBytes: btcTxBytes
  })

  const interval = setInterval(async () => {
    try {
      console.log('Waiting for BTC tx and proof to be ready');
      // 
      const rgbppApiSpvProof = await service.getRgbppSpvProof(btcTxId, 0);
      clearInterval(interval);

      const btcTx = await service.getBtcTransaction(btcTxId)
      if(btcTx.status.confirmed) {
        const clusterBlockHeight = btcTx.status.block_height
        writeStepLog('2-cluster-block-height', {
          clusterBlockHeight
        })
      }

      // Update CKB transaction with the real BTC txId
      const newCkbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId, isMainnet });
      const ckbTx = await appendCkbTxWitnesses({
        ckbRawTx: newCkbRawTx,
        btcTxBytes,
        rgbppApiSpvProof,
      });
      // Replace cobuild witness with the final rgbpp lock script
      ckbTx.witnesses[ckbTx.witnesses.length - 1] = generateClusterCreateCoBuild(
        ckbTx.outputs[0],
        ckbTx.outputsData[0],
      );
      // console.log("signedTx = ", JSON.stringify(ckbTx))
      const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
      console.info(`RGB++ Cluster has been created and tx hash is ${txHash}`);

    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};

// Use your real BTC UTXO information on the BTC Testnet
// rgbppLockArgs: outIndexU32 + btcTxId
const { txid, index } = readStepLog('0')
console.log("utxo = ", `${txid}:${index}`)
createCluster({
  ownerRgbppLockArgs: buildRgbppLockArgs(
    index, 
    txid
  ),
});
  
