//var Web3 = require('web3');
import Web3 from 'web3'
import fs from 'fs'
import path from 'path'
const web3 = new Web3('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161')

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
    console.log(signedTx.rawTransaction)
     return signedTx.rawTransaction
}

async function findNewDeposits(receiver: string): Promise<BalanceChanges | undefined>{
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/eth-balances.json'));
    var customerData = JSON.parse(balancesData.toString())[receiver];

    let retryAmt = 1000
    let tries = 0

    while (tries < retryAmt){
        var currentBlock = await web3.eth.getBlockNumber()
        var blockConfirmedBalance = await web3.eth.getBalance(receiver, currentBlock-10)
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

async function updateBalances(receiver: string, changesMade: BalanceChanges | undefined = undefined): Promise<BalanceChanges>{
    //Updates the balances.json with an updated confirmed and unconfirmed balance
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/eth-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

        
    if (!Object.keys(customerData).includes(receiver)){
        customerData[receiver] = {confirmed: "0", unconfirmed: "0", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
    }

    if (typeof changesMade == 'undefined'){
        changesMade = {confirmed: "", unconfirmed: "", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
        var currentBlock = await web3.eth.getBlockNumber()
        changesMade.confirmed = await web3.eth.getBalance(receiver, currentBlock-10)
        changesMade.unconfirmed = (parseInt(await web3.eth.getBalance(receiver, currentBlock)) - parseInt(changesMade.confirmed)).toString()
    }

    customerData[receiver].confirmed = changesMade.confirmed
    customerData[receiver].unconfirmed = changesMade.unconfirmed

    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/eth-balances.json'), JSON.stringify(customerData));
    return changesMade
}
