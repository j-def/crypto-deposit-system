import Web3 from 'web3'
import { AbiItem } from 'web3-utils'
import fs from 'fs'
import path from 'path'
const web3 = new Web3('https://data-seed-prebsc-1-s1.binance.org:8545/')

interface EthereumAddressData {
    publicKey: string | undefined,
    privateKey: string | undefined
}
interface BalanceChanges {
    confirmed: string, 
    unconfirmed: string, 
    confirmedUpdatedBy: number, 
    unconfirmedUpdatedBy: number
}


function generateAddr(): EthereumAddressData{
    var entropyString = web3.utils.randomHex(32)
    var account = web3.eth.accounts.create(entropyString)
    return {publicKey: account.address, privateKey: account.privateKey}
}

async function createTransaction(sender: EthereumAddressData, receiver: string, sendAmount: string | number): Promise<string | undefined>{
    if (typeof sendAmount == 'number'){
        sendAmount = sendAmount.toString()
    }
    var txData =   {
        from: sender.publicKey,
        to: receiver,
        value: web3.utils.toWei(sendAmount, 'ether'),
        gas: '21000',
     }
     if (typeof sender.privateKey == 'undefined'){
        return undefined
     }
    var signedTx = await web3.eth.accounts.signTransaction(
        txData,
        sender.privateKey
     );
     return signedTx.rawTransaction
}

async function findNewDeposits(receiver: string | undefined): Promise<BalanceChanges | undefined>{
    if (typeof receiver == "undefined"){
        return undefined
    }
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bsc-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (Object.keys(customerData).includes(receiver)){
        customerData = customerData[receiver]
    } else{
        customerData = {"confirmed": "0", "unconfirmed": "0"}
    }

    let retryAmt = 1000
    let tries = 0

    while (tries < retryAmt){
        var currentBlock = await web3.eth.getBlockNumber()
        var blockConfirmedBalance = await web3.eth.getBalance(receiver, currentBlock-100)
        var blockUnconfirmedBalance = (parseInt(await web3.eth.getBalance(receiver, currentBlock)) - parseInt(blockConfirmedBalance)).toString()

        if (blockConfirmedBalance !== customerData.confirmed || blockUnconfirmedBalance !== customerData.unconfirmed){
            return {
                confirmed: blockConfirmedBalance, 
                unconfirmed: blockUnconfirmedBalance, 
                confirmedUpdatedBy: parseInt(blockConfirmedBalance) - parseInt(customerData.confirmed) , 
                unconfirmedUpdatedBy: parseInt(blockUnconfirmedBalance) - parseInt(customerData.unconfirmed)
            }
        }

        tries++
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    return undefined
}

async function updateBalances(receiver: string | undefined, changesMade: BalanceChanges | undefined = undefined): Promise<BalanceChanges | undefined>{
    if (typeof receiver == "undefined"){
        return undefined
    }
    //Updates the balances.json with an updated confirmed and unconfirmed balance
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bsc-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

        
    if (!Object.keys(customerData).includes(receiver)){
        customerData[receiver] = {confirmed: "0", unconfirmed: "0", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
    }

    if (typeof changesMade == 'undefined'){
        changesMade = {confirmed: "", unconfirmed: "", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
        var currentBlock = await web3.eth.getBlockNumber()
        changesMade.confirmed = await web3.eth.getBalance(receiver, currentBlock-100)
        changesMade.unconfirmed = (parseInt(await web3.eth.getBalance(receiver, currentBlock)) - parseInt(changesMade.confirmed)).toString()
    }

    customerData[receiver].confirmed = changesMade.confirmed
    customerData[receiver].unconfirmed = changesMade.unconfirmed

    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/bsc-balances.json'), JSON.stringify(customerData));
    return changesMade
}


async function updateBep20Balance(receiver: string, contractAddress: string, changesMade: BalanceChanges | undefined = undefined): Promise<BalanceChanges>{

    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bep20-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (!Object.keys(customerData).includes(contractAddress)){
        customerData[contractAddress] = {}
    }
    if (!Object.keys(customerData[contractAddress]).includes(receiver)){
        customerData[contractAddress][receiver] = {"confirmed": "0", "unconfirmed": "0"}
    } 

    var changes = {"confirmed": "0", "unconfirmed": "0", "confirmedUpdatedBy": 0, "unconfirmedUpdatedBy": 0}


    if (typeof changesMade == 'undefined'){
        console.log(1)
        var abi = fs.readFileSync(path.join(path.dirname(__dirname), 'contractInterfaces/bep20.abi.json'))
        var contract = new web3.eth.Contract(JSON.parse(abi.toString()) as AbiItem, contractAddress)
        var userBalance: number = await contract.methods.balanceOf(receiver).call()
        console.log(userBalance)

        var unconfirmed = 0
        var blockNumber = await web3.eth.getBlockNumber()
        var pastEvents = await contract.getPastEvents("Transfer", {
            fromBlock: blockNumber - 100,
            filter: {"to": receiver}
        })
        pastEvents.forEach((val, idx) => {
            unconfirmed += parseInt(val.returnValues.value)
        })
    }
    else {
        console.log(2)
        var unconfirmed = parseInt(changesMade.unconfirmed)
        var userBalance = parseInt(changesMade.confirmed) + unconfirmed
    }

    console.log(userBalance, unconfirmed)


    changes.confirmed = (userBalance - unconfirmed).toString()
    changes.unconfirmed = (unconfirmed).toString()
    customerData[contractAddress][receiver].confirmed = (userBalance - unconfirmed).toString()
    customerData[contractAddress][receiver].unconfirmed = (unconfirmed).toString()
    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/bep20-balances.json'), JSON.stringify(customerData));
    return changes
}

async function findNewBep20Deposits(receiver: string, contractAddress: string): Promise<BalanceChanges>{
    var abi = fs.readFileSync(path.join(path.dirname(__dirname), 'contractInterfaces/bep20.abi.json'))
    var contract = new web3.eth.Contract(JSON.parse(abi.toString()) as AbiItem, contractAddress)
    var changes = {"confirmed": "0", "unconfirmed": "0", "confirmedUpdatedBy": 0, "unconfirmedUpdatedBy": 0}

    var firstConfirmed = 0
    var firstUnconfirmed = 0

    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bep20-balances.json'));
    var customerData = JSON.parse(balancesData.toString());
    if (Object.keys(customerData).includes(contractAddress) && Object.keys(customerData[contractAddress]).includes(receiver)){
        firstConfirmed = parseInt(customerData[contractAddress][receiver].confirmed)
        firstUnconfirmed = parseInt(customerData[contractAddress][receiver].unconfirmed)
    }
    
    let retryAmt = 60
    let tries = 0

    var blockNumber = await web3.eth.getBlockNumber()
    console.log(blockNumber)
    while(tries < retryAmt){
        var newEvents = await contract.getPastEvents("Transfer", {
            fromBlock: blockNumber,
            filter: {"to": receiver}
        })
        console.log(newEvents.length)
        if (newEvents.length != 0){
            var confirmed = 0
            var unconfirmed = 0
            confirmed = await contract.methods.balanceOf(receiver).call()
            blockNumber = await web3.eth.getBlockNumber()
            var unconfirmedEvents = await contract.getPastEvents("Transfer", {
                fromBlock: blockNumber - 100,
                filter: {"to": receiver}
            })
            if (unconfirmedEvents.length > 0){
                unconfirmedEvents.forEach((val, idx) => {
                    unconfirmed += parseInt(val.returnValues.value)
                })
            }


            var confirmedDelta = confirmed - firstConfirmed
            var unconfirmedDelta = unconfirmed - firstUnconfirmed
            changes.confirmed = (confirmed - unconfirmed).toString()
            changes.unconfirmed = unconfirmed.toString()
            changes.confirmedUpdatedBy = confirmedDelta
            changes.unconfirmedUpdatedBy = unconfirmedDelta

            break
        }

        tries++
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return changes
}

async function withdrawBep20Token(sender: EthereumAddressData, receiver: string, contractAddress: string, amount: string): Promise<string | undefined>{
    var abi = fs.readFileSync(path.join(path.dirname(__dirname), 'contractInterfaces/bep20.abi.json'))
    var contract = new web3.eth.Contract(JSON.parse(abi.toString()) as AbiItem, contractAddress, { from: sender.publicKey })
    if (typeof sender.privateKey != 'string' || typeof sender.publicKey != 'string'){
        return undefined
    }
    var count = await web3.eth.getTransactionCount(sender.publicKey)
    var txData = contract.methods.transfer(receiver, amount).encodeABI()
    var tx = {
        'gasLimit': web3.utils.toHex(2100000),
        'gasPrice': web3.utils.toHex(2 * 1e10),
        'to': receiver,
        'value': '0x0',
        'data': txData,
        'from': sender.publicKey,
        'nonce': count
    }
    var signedTx = await web3.eth.accounts.signTransaction(tx, sender.privateKey)
    if (typeof signedTx.rawTransaction == 'undefined'){
        return undefined
    }
    console.log(signedTx.rawTransaction)
    return signedTx.rawTransaction
}

async function sendTx(signedTx: string){
    var resp = await web3.eth.sendSignedTransaction(signedTx)
    console.log(resp)
}

var add1 = {
    publicKey: '0x39476Be9502BC2693A275074C34fD70B982F8156',
    privateKey: '0xa798b8970c6daa90e605af90e170abe8181122e388278230cdfe288761597210'
  }

var add2 = {
    publicKey: '0xe5e088C80E71397532958c8861019aC8FA65C9ec',
    privateKey: '0x9e6b5673e3cbb3a6812476d69970773f711719469ae212d5a2bba649aeb3bd50'
  }

 var addr3 = {
    publicKey: '0xf28F881ACFA3300Ce49817050c8a05Da0Ebe48f2',
    privateKey: '0xd2878adfc520f9b70e1bb1875c0ddb257d30b33c8a8577699349fdde8b97926c'
  }



withdrawBep20Token(add1, add2.publicKey, '0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867', '10000000').then((val) => {
    if (typeof val == 'string'){
        sendTx(val)
    }
})


export { updateBalances, generateAddr, createTransaction, findNewDeposits, updateBep20Balance, findNewBep20Deposits}