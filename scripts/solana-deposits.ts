import * as web3 from '@solana/web3.js'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { token } from '@project-serum/anchor/dist/cjs/utils'

interface SolanaAddressData {
    publicKey: string
    privateKey: string
}

interface BalanceChanges {
    confirmed: string, 
    confirmedUpdatedBy: number, 
}

const conn = new web3.Connection(
    "https://devnet.genesysgo.net/"
)

function buildKeypairFromStringSecret(secretKey: string): web3.Keypair{
    let secretArray = new Uint8Array( secretKey.split(',').map((item) => (parseInt(item))) )
    return web3.Keypair.fromSecretKey(secretArray)
}

function generateAddr(): SolanaAddressData{
    var seed = crypto.randomBytes(32)
    var gennedAccount = web3.Keypair.fromSeed(seed)
    return {publicKey: gennedAccount.publicKey.toString(), privateKey: gennedAccount.secretKey.toString()}
}

async function createTransaction(sender: SolanaAddressData, receiver: string, sendAmount: string | number): Promise<web3.Transaction>{
    var signer = buildKeypairFromStringSecret(sender.privateKey)
    var receiverPubkey = new web3.PublicKey(receiver)
    if (typeof sendAmount != 'number'){
        sendAmount = parseFloat(sendAmount)
    }
    var transaction = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: receiverPubkey,
          lamports: parseInt((sendAmount * web3.LAMPORTS_PER_SOL).toString())
        }),
      );

    return transaction
}

async function sendTransaction(sender: SolanaAddressData, tx: web3.Transaction){
    var signer = buildKeypairFromStringSecret(sender.privateKey)
    var resp = await web3.sendAndConfirmTransaction(conn, tx, [signer])
}

async function findNewDeposits(receiver: string): Promise<BalanceChanges>{
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/sol-balances.json'));
    var customerData = JSON.parse(balancesData.toString())[receiver];
    var receiverPubkey = new web3.PublicKey(receiver)

    let retryAmt = 60
    let tries = 0
    var shouldEnd: Boolean = false
    var changes: BalanceChanges = {confirmed: "", confirmedUpdatedBy: 0}

    while (tries < retryAmt){
        var currentBalance = await conn.getBalance(receiverPubkey)
        
        if (currentBalance != parseInt(customerData.confirmed)){
            changes.confirmed = currentBalance.toString()
            changes.confirmedUpdatedBy =  parseInt(customerData.confirmed) - currentBalance
            shouldEnd = true
        }

        if (shouldEnd){
            break
        }
        tries++
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return changes
}

async function updateBalances(receiver: string, changesMade: BalanceChanges | undefined = undefined): Promise<BalanceChanges>{
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/sol-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (!Object.keys(customerData).includes(receiver)){
        customerData[receiver] = {confirmed: "0"}
    }

    if (typeof changesMade == 'undefined'){
        changesMade = {confirmed: "", confirmedUpdatedBy: 0}
        var receiverPubkey = new web3.PublicKey(receiver)
        var currentBalance = await conn.getBalance(receiverPubkey)
        changesMade.confirmed = currentBalance.toString()
        changesMade.confirmedUpdatedBy = 0
    }
    customerData[receiver].confirmed = changesMade.confirmed
    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/sol-balances.json'), JSON.stringify(customerData));
    return changesMade
}

async function findNewSplDeposits(receiver: string, tokenMint: string): Promise<BalanceChanges>{

    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/spl-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    var previousConfirmed = 0

    if (Object.keys(customerData).includes(tokenMint) && Object.keys(customerData[tokenMint]).includes(receiver)){
        previousConfirmed = customerData[tokenMint][receiver].confirmed
    }


    var receiverPubkey = new web3.PublicKey(receiver)
    var tokenAccount = await conn.getTokenAccountsByOwner(receiverPubkey, {'mint': new web3.PublicKey(tokenMint)})
    var preBalance = 0

    tokenAccount.value.forEach(async (item, idx) => {
        var balance = await conn.getTokenAccountBalance(item.pubkey)
        preBalance += parseInt(balance.value.amount)
    })
    var changes: BalanceChanges = {"confirmed": preBalance.toString(), "confirmedUpdatedBy": 0}

    let retryAmt = 60
    let tries = 0
    while(tries < retryAmt){
        var postBalance = 0
        tokenAccount = await conn.getTokenAccountsByOwner(receiverPubkey, {'mint': new web3.PublicKey(tokenMint)})                                                               
        tokenAccount.value.forEach(async (item, idx) => {
            var balance = await conn.getTokenAccountBalance(item.pubkey)
            postBalance += parseInt(balance.value.amount)
        })

        if (previousConfirmed != postBalance){
            changes.confirmed = postBalance.toString()
            changes.confirmedUpdatedBy = (postBalance - previousConfirmed)
        }

        tries++
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    return changes
}

async function updateSplBalance(receiver: string, tokenMint: string, changesMade: BalanceChanges | undefined = undefined): Promise<BalanceChanges>{
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/spl-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (!Object.keys(customerData).includes(tokenMint)){
        customerData[tokenMint] = {}
    }
    if (!Object.keys(customerData[tokenMint]).includes(receiver)){
        customerData[tokenMint][receiver] = {"confirmed": "0"}
    } 

    var changes = {"confirmed": "0", "confirmedUpdatedBy": 0}

    if (typeof changesMade == 'undefined'){
        var cummulativeBalance = 0
        var tokenAccount = await conn.getTokenAccountsByOwner(new web3.PublicKey(receiver), {'mint': new web3.PublicKey(tokenMint)})
        
        for (var i = 0;i<tokenAccount.value.length;i++){
            var tokenAccountBalance = await conn.getTokenAccountBalance(tokenAccount.value[i].pubkey)
            cummulativeBalance += parseInt(tokenAccountBalance.value.amount)
        }

        changes.confirmed = cummulativeBalance.toString()
    }
    else {
        changes.confirmed = changesMade.confirmed.toString()
    }

    customerData[tokenMint][receiver].confirmed = changes.confirmed

    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/spl-balances.json'), JSON.stringify(customerData));
    return changes
}

var add1 = {
    publicKey: '6bTxoMU1xBETy81hsG4KSGNEDRL5EqGkzsBCdiGD5dkR',
    privateKey: '49,156,154,199,215,128,48,249,163,170,155,245,91,33,233,17,84,151,244,227,49,228,214,251,66,244,211,146,35,29,194,115,83,30,171,17,82,7,175,145,235,86,113,124,253,80,224,97,194,31,131,115,15,3,104,9,87,39,67,68,86,224,85,230'
}
var add2 = {
    publicKey: 'pUvrcENjtEgXEgE9r5Zd4CmLetZgQ4UxNdj6ZL1mbpZ',
    privateKey: '240,251,11,141,152,248,198,235,39,86,126,78,162,195,248,14,174,39,110,147,229,204,103,75,176,251,168,218,86,19,19,70,12,41,224,126,73,170,202,19,171,232,144,27,239,40,76,111,76,202,184,85,137,11,99,34,171,152,204,12,80,186,77,206'
}
updateSplBalance(add1.publicKey, "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr").then((val) => {
    console.log(val)
})

export {updateBalances, findNewDeposits, sendTransaction, createTransaction, generateAddr}