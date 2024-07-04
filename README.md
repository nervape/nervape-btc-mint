### Nervape mint

#### 分发步骤及说明

1. `npx ts-node src/0-prepare-utxo.ts` 创建 BTC cluster utxo, 用于绑定cluster Cell

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

