# Nervape BTC mint - An example start repo for minting RGB++ protocol assets

## Quick start (English)
0. clone this repo, install required packages:

```bash
git clone https://github.com/nervape/nervape-btc-mint.git
cd nervape-btc-mint
npm install
```

1. `npx ts-node src/0-prepare-utxo.ts` to create a BTC cluster UTXO, used for binding [Cluster Cell](https://docs.spore.pro/basics/spore-101#what-is-a-cluster

   This will creat a btc transaction, and record the UTXO into `logs/[network]/step-0.log`, formatted in: `{"txid":[txid],"index":0}`

2.  `npx ts-node src/1-prepare-cluster.ts` create shadow Cell linked to UTXO from log. This will:
    1. Read records from `./logs/[network]/step-0.log
    2. Create RGB++ Cluster Cell on CKB
    3. Send CKB transaction, till the transaction committed

3.  `npx ts-node src/2-create-cluster.ts` Bind UTXO in log and RGB++ Cluster Cell we just created. This will:
    1. record UTXO and Cluster ID into `logs/[network]/step-2.log`
    2. record Cluster's block height into `logs/[network]/step-2-cluster-block-height.log`
    3. record UTXO and btcTxBytes into `logs/[network]/step-3-0.log`
    4. send the BTC transaction, after BTC transaction committed, send CKB side transaction

4.  `npx ts-node src/3-create-spore.ts [batchNo]` minting Spore in a batch.
    1. `batchNo` starting from 1, every batch contains 100 records
    2. read Cluster ID from `logs/[network]/step-2.log`
    3. read `clusterBlockHeight` from `logs/[network]/step-2-cluster-block-height.log`
    4. Read UTXO record from  `logs/[network]/step-3-[batchNo-1].log`
    5. send BTC transaction, after BTC transaction committed, send CKB side transaction


## 使用说明

0. 克隆该仓库，安装必要模块:
```bash
git clone https://github.com/nervape/nervape-btc-mint.git
cd nervape-btc-mint
npm install
```

1. `npx ts-node src/0-prepare-utxo.ts` 创建 BTC cluster utxo, 用于绑定[Cluster Cell](https://docs.spore.pro/basics/spore-101#what-is-a-cluster).

    创建btc utxo交易，并将utxo记录到`logs/[network]/step-0.log`，记录内容为 `{"txid":[txid],"index":0}`

2. `npx ts-node src/1-prepare-cluster.ts` 创建步骤1的utxo对应在ckb上的cell
    1. 读取 `logs/[network]/step-0.log` 中的utxo数据
    2. 创建CKB上的rgb++ cluster cell
    3. 发送ckb交易，ckb交易确认进入下一步

3. `npx ts-node src/2-create-cluster.ts` 绑定步骤1中的utxo与步骤2的rgb++ cluster cell
    1. 记录utxo及clusterId到 `logs/[network]/step-2.log`
    2. 记录cluster在btc上的块高到 `logs/[network]/step-2-cluster-block-height.log`
    3. 记录utxo和btcTxBytes信息到 `logs/[network]/step-3-0.log`，方便分发spore
    4. 发送btc交易，btc交易确认后发送ckb交易

4. `npx ts-node src/3-create-spore.ts [batchNo]` 分批次分发spore给地址列表
    1. `batchNo`从1开始，每个批次100条记录
    2. 读取 `logs/[network]/step-2.log`中的 `clusterId`
    3. 读取 `logs/[network]/step-2-cluster-block-height.log` 中的 `clusterBlockHeight`
    4. 读取 `logs/[network]/step-3-[batchNo-1].log`中的utxo
    5. 发送btc交易，btc交易确认后发送ckb交易

