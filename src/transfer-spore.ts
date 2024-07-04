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
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import { RawSporeData } from '@spore-sdk/core'
import { serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  CKB_PRIVATE_KEY, isMainnet, getMintList, calculateDNA,
  getDeployVariables, writeStepLog, readStepLog,
  getFastestFeeRate,
  buildReceiversAndSpores
} from "./config"

// your btc private key
const OWNER_BTC_PRIVATE_KEY = ''

const transferSpore = async ({ sporeId, sporeRgbppLockArgs, toBtcAddress }: { sporeId: string, sporeRgbppLockArgs: Hex; toBtcAddress: string }) => {
  const feeRate = await getFastestFeeRate()
  const { collector, service, source } = getDeployVariables()
  const btcNetwork = isMainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const btcKeyPair = ECPair.fromPrivateKey(Buffer.from(OWNER_BTC_PRIVATE_KEY, 'hex'), { network: btcNetwork });
  const { address: btcAddress } = bitcoin.payments.p2wpkh({
    pubkey: btcKeyPair.publicKey,
    network: btcNetwork,
  });
  // console.log("btcAddress=", btcAddress)
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

  const { commitment, ckbRawTx, sporeCell } = ckbVirtualTxResult;

  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    commitment,
    tos: [toBtcAddress],
    ckbCollector: collector,
    from: btcAddress!,
    source,
    feeRate: feeRate,
  });
  psbt.signAllInputs(btcKeyPair);
  psbt.finalizeAllInputs();

  const btcTx = psbt.extractTransaction();
  const btcTxBytes = transactionToHex(btcTx, false);
  const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());

  console.log('BTC TxId = ', btcTxId);

  const interval = setInterval(async () => {
    try {
      console.log('Waiting for BTC tx and proof to be ready');
      const rgbppApiSpvProof = await service.getRgbppSpvProof(btcTxId, 0);
      clearInterval(interval);
      // Update CKB transaction with the real BTC txId
      const newCkbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId, isMainnet });

      const ckbTx = await appendCkbTxWitnesses({
        ckbRawTx: newCkbRawTx,
        btcTxBytes,
        rgbppApiSpvProof,
      });

      // Replace cobuild witness with the final rgbpp lock script
      ckbTx.witnesses[ckbTx.witnesses.length - 1] = generateSporeTransferCoBuild(sporeCell, ckbTx.outputs[0]);

      const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
      console.info(`RGB++ Spore has been transferred and tx hash is ${txHash}`);
    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};

// transferSpore({
//   sporeId: 'spore id',
//   sporeRgbppLockArgs: buildRgbppLockArgs(index, 'txid'),
//   toBtcAddress: 'to',
// });