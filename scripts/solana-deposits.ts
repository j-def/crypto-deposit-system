import * as web3 from '@solana/web3.js'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'

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

export {updateBalances, findNewDeposits, sendTransaction, createTransaction, generateAddr}