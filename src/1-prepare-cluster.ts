import { AddressPrefix, addressToScript, getTransactionSize, privateKeyToAddress } from '@nervosnetwork/ckb-sdk-utils';
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

import { getClusterData, isMainnet, getDeployVariables, CKB_PRIVATE_KEY, readStepLog } from "./config"

const prepareClusterCell = async ({
  outIndex,
  btcTxId,
}: {
  outIndex: number;
  btcTxId: string;
}) => {
  const { collector, ckbMasterLock } = getDeployVariables()
  const clusterData = getClusterData()
  
  // The capacity required to launch cells is determined by the token info cell capacity, and transaction fee.
  const clusterCellCapacity = calculateRgbppClusterCellCapacity(clusterData);

  let emptyCells = await collector.getCells({
    lock: ckbMasterLock,
  });
  if (!emptyCells || emptyCells.length === 0) {
    throw new NoLiveCellError('The address has no empty cells');
  }
  emptyCells = emptyCells.filter((cell) => !cell.output.type);

  let txFee = MAX_FEE;
  const { inputs, sumInputsCapacity } = collector.collectInputs(emptyCells, clusterCellCapacity, txFee);

  const outputs: CKBComponents.CellOutput[] = [
    {
      lock: genRgbppLockScript(buildRgbppLockArgs(outIndex, btcTxId), isMainnet),
      capacity: append0x(clusterCellCapacity.toString(16)),
    },
  ];
  let changeCapacity = sumInputsCapacity - clusterCellCapacity;
  outputs.push({
    lock: ckbMasterLock,
    capacity: append0x(changeCapacity.toString(16)),
  });
  const outputsData = ['0x', '0x'];

  const emptyWitness = { lock: '', inputType: '', outputType: '' };
  const witnesses = inputs.map((_, index) => (index === 0 ? emptyWitness : '0x'));

  const cellDeps = [getSecp256k1CellDep(isMainnet)];

  const unsignedTx = {
    version: '0x0',
    cellDeps,
    headerDeps: [],
    inputs,
    outputs,
    outputsData,
    witnesses,
  };

  const txSize = getTransactionSize(unsignedTx) + SECP256K1_WITNESS_LOCK_SIZE;
  const estimatedTxFee = calculateTransactionFee(txSize);
  changeCapacity -= estimatedTxFee;
  unsignedTx.outputs[unsignedTx.outputs.length - 1].capacity = append0x(changeCapacity.toString(16));

  const signedTx = collector.getCkb().signTransaction(CKB_PRIVATE_KEY)(unsignedTx);
  const txHash = await collector.getCkb().rpc.sendTransaction(signedTx, 'passthrough');
  console.info(`Cluster cell submitted and the tx hash ${txHash}`);

  const interval = setInterval(async () => {
    try {
      console.log("Waiting for cluster cell confirmed")
      const tx = await collector.getCkb().rpc.getTransaction(txHash)
      if(tx.txStatus.status === 'committed'){
        clearInterval(interval)
        console.info(`Cluster cell has been prepared and the tx hash ${txHash}`);
      }
    } catch(error) {
      console.error(error)
    }
  }, 5 * 1000)
};


const { txid, index } = readStepLog('0')
console.log("utxo = ", `${txid}:${index}`)


prepareClusterCell({
  outIndex: index,
  btcTxId: txid,
});
