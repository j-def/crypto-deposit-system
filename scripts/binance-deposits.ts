import Web3 from 'web3'
import { AbiItem } from 'web3-utils'
import fs from 'fs'
import path from 'path'
const web3 = new Web3('https://data-seed-prebsc-1-s1.binance.org:8545/')

interface BinanceAddressData {
    publicKey: string | undefined,
    privateKey: string | undefined
}
interface BalanceChanges {
    confirmed: string, 
    unconfirmed: string, 
    confirmedUpdatedBy: number, 
    unconfirmedUpdatedBy: number
}


function generateAddr(): BinanceAddressData{
    var entropyString = web3.utils.randomHex(32)
    var account = web3.eth.accounts.create(entropyString)
    return {publicKey: account.address, privateKey: account.privateKey}
}

async function createTransaction(sender: BinanceAddressData, receiver: string, sendAmount: string | number): Promise<string | undefined>{
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

async function sendBep20Tokens(sender: BinanceAddressData, receiver: string, contractAddress: string, amount: string){
    var abi = fs.readFileSync(path.join(path.dirname(__dirname), 'contractInterfaces/bep20.abi.json'))
    var contract = new web3.eth.Contract(JSON.parse(abi.toString()) as AbiItem, contractAddress, { from: sender.publicKey })
    if (typeof sender.privateKey != 'string' || typeof sender.publicKey != 'string'){
        return undefined
    }
    var count = await web3.eth.getTransactionCount(sender.publicKey)
    var txData = contract.methods.transfer(receiver, amount).encodeABI()
    var tx = {
        'gas': web3.utils.toHex(210000),
        'to': contractAddress,
        'value': '0x0',
        'data': txData,
        'from': sender.publicKey,
        'nonce': count
    }
    var signedTx = await web3.eth.accounts.signTransaction(tx, sender.privateKey)
    if (typeof signedTx.rawTransaction == 'undefined'){
        return undefined
    }
    return signedTx.rawTransaction
}

async function sendTx(signedTx: string){
    var resp = await web3.eth.sendSignedTransaction(signedTx)
    return resp
}

function saveCredentials(creds: BinanceAddressData): Boolean{
    if (typeof creds.publicKey == 'undefined' || typeof creds.privateKey == 'undefined'){
        return false
    }
    var existingCredsStr = fs.readFileSync(path.join(path.basename(__dirname), "storedKeys/bsc-accounts.json"))
    var existingCreds = JSON.parse(existingCredsStr.toString())
    if (!Object.keys(existingCreds).includes(creds.publicKey)){
        existingCreds[creds.publicKey] = creds.privateKey
    }
    fs.writeFileSync(path.join(path.basename(__dirname), "storedKeys/bsc-accounts.json"), JSON.stringify(existingCreds))
    return true
}




export { updateBalances, generateAddr, createTransaction, findNewDeposits, updateBep20Balance, findNewBep20Deposits, sendBep20Tokens, sendTx, saveCredentials}