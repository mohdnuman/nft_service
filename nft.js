const config = require("./config.json");
const Web3 = require("web3");
const mongoose = require("mongoose");
let { NftUserModel, EthereumModel } = require("./models.js");
const axios = require("axios");
const erc721 = require("./erc721.json");
var converter = require("hex2dec");
const abi = [
  {
    constant: true,
    inputs: [{ internalType: "bytes4", name: "", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

async function getWeb3Instance() {
  return new Promise(async (resolve, reject) => {
    try {
      resolve(new Web3(new Web3.providers.HttpProvider(config.geth.url)));
    } catch (error) {
      reject(error);
    }
  });
}

async function removeDuplicates(raw_batch, unique_field) {
  return new Promise(async (resolve, reject) => {
    try {
      const unique = [...new Set(raw_batch.map((item) => item[unique_field]))];
      resolve(unique);
    } catch (error) {
      reject(error);
    }
  });
}

async function check721(contractAddress) {
  return new Promise(async (resolve, reject) => {
    try {
      if (contractAddress == null) resolve(false);
      //   console.log(contractAddress);
      var web3 = await getWeb3Instance();
      let contract = new web3.eth.Contract(abi, contractAddress);
      let is721 = await contract.methods.supportsInterface("0x80ac58cd").call();

      resolve(is721);
    } catch (error) {
      resolve(false);
    }
  });
}

async function checkTransfer(log) {
  return new Promise(async (resolve, reject) => {
    try {
      if (
        log.topics[0] ==
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      ) {
        resolve(log);
      }
      resolve(null);
    } catch (error) {
      reject(error);
    }
  });
}

async function ignoreError(call) {
  return new Promise(async (resolve) => {
    try {
      const result = await call();
      resolve(result);
    } catch (error) {
      resolve(null);
    }
  });
};

async function getNftData(log) {
  return new Promise(async (resolve, reject) => {
    try {
      var contractAddress = log.address;
      var web3 = await getWeb3Instance();
      var contract = new web3.eth.Contract(erc721, contractAddress);
      if (log.topics[3] == undefined) {
        resolve({});
      }
      var tokenId=log.topics[3];
      var user = log.topics[2];
      user = "0x" + user.slice(26);
      var owner=await ignoreError(contract.methods.ownerOf(tokenId).call);
      console.log(owner);
      if (owner==null) {
        resolve({});
      }
      if (owner.toLowerCase() != user.toLowerCase()) {
        resolve({});
      }

      var collectionName=await ignoreError(contract.methods.name().call);
  
      var dataObject = {
        userAddress: user,
        contractAddress: contractAddress,
        collectionName: collectionName,
        tokenId: tokenId.toString(),
        image: null,
      };
      resolve(dataObject);
    } catch (error) {
      console.log("getnftdata:", log, error);
      reject(error);
    }
  });
}

function removeNullLogs(logs) {
  let logsCompressed = [];
  for (let iterLog = 0; iterLog < logs.length; iterLog++) {
    if (logs[iterLog] != null) {
      logsCompressed.push(logs[iterLog]);
    }
  }
  return logsCompressed;
}

(async () => {
  try {
    var latestBlockNumber = 0;
    var isProcessing = true;
    var startBlock = config.startBlock;
    var endBlock = config.endBlock;
    var raw_batch = [];
    var transactionReceipts = [];
    var transactionReceiptCalls = [];
    var startDate = Date.now();
    var latestBlockData, latestBlockNumber;
    var web3 = await getWeb3Instance();
    var contractChecks = [];
    var checkContractCalls = [];
    var checkTransferCalls = [];
    var transferLogs = [];
    var getNftDataCalls = [];
    var nftData = [];
    var operations = [];
    var start;
    while (true) {
      if (isProcessing) {
        for (var iterBlock = startBlock; iterBlock <= endBlock; iterBlock++) {
          start = Date.now();
          startDate = Date.now();

          if (config.stopBlock != "" && iterBlock >= config.stopBlock) {
            console.log({ status: "process completed" });
            process.exit(1);
          }
          raw_batch = await EthereumModel.find(
            { blockNumber: iterBlock },
            "transactionHash -_id"
          );
          batch = await removeDuplicates(raw_batch, "transactionHash");

          transactionReceiptCalls = [];
          batch.forEach((transactionHash) => {
            transactionReceiptCalls.push(
              web3.eth.getTransactionReceipt(transactionHash)
            );
          });
          transactionReceipts = await Promise.all(transactionReceiptCalls);

          checkTransferCalls = [];
          for (
            let iterTransaction = 0;
            iterTransaction < transactionReceipts.length;
            iterTransaction++
          ) {
            for (
              let iterLog = 0;
              iterLog < transactionReceipts[iterTransaction].logs.length;
              iterLog++
            ) {
              checkTransferCalls.push(
                checkTransfer(
                  transactionReceipts[iterTransaction].logs[iterLog]
                )
              );
            }
          }
          transferLogs = await Promise.all(checkTransferCalls);
          transferLogs = removeNullLogs(transferLogs);

          checkContractCalls = [];
          for (let iterLog = 0; iterLog < transferLogs.length; iterLog++) {
            checkContractCalls.push(
              check721(transferLogs[iterLog].address, web3)
            );
          }
          contractChecks = await Promise.all(checkContractCalls);

          getNftDataCalls = [];
          for (let iterLog = 0; iterLog < transferLogs.length; iterLog++) {
            if (contractChecks[iterLog]) {
              getNftDataCalls.push(getNftData(transferLogs[iterLog]));
            }
          }
          nftData = await Promise.all(getNftDataCalls);

          nftData.forEach((nft_user) => {
            if (nft_user != {}) {
              operations.push({
                updateOne: {
                  filter: {
                    userAddress: nft_user.userAddress,
                    contractAddress: nft_user.contractAddress,
                    tokenId: nft_user.tokenId,
                  },
                  update: nft_user,
                  upsert: true,
                },
              });
            }
          });
          await NftUserModel.bulkWrite(operations, {
            ordered: false,
          });
          var consoleObject = {
            seconds: Date.now() - start,
            blockNumber: iterBlock,
          };
          consoleObject = JSON.stringify(consoleObject);
          console.log(consoleObject);
          // console.log(Date.now() - start, "seconds taken to process block no.",blockNumber);
          // console.log(bulkReceipt.result.nModified, "documents modified");
          // console.log(bulkReceipt.result.nUpserted, "documents upserted");
        }
      }
      await new Promise((res) => setTimeout(res, config.sleepTime));
      latestBlockData = await EthereumModel.find({})
        .sort({ blockNumber: -1 })
        .limit(1);
      latestBlockNumber = latestBlockData[0].blockNumber;
      if (endBlock < latestBlockNumber) {
        startBlock = endBlock + 1;
        endBlock = latestBlockNumber;
        isProcessing = true;
      } else {
        isProcessing = false;
      }
    }
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
