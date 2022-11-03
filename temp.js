var Web3=require("web3");
var web3=new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/7b3c38ebdc7c42f589edd9672188abd9"));
var abi=require("./erc721.json");
async function main(){
    var contract=new web3.eth.Contract(abi,"0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85");
    var owner=await contract.methods.ownerOf("0x2fb17fb936c1d3232efadfc990b5a8b6dedb75174f4bf5631747a9cf15b12ec2").call();
    console.log(owner);
}

main();