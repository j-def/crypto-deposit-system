

import * as web3 from '@solana/web3.js'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction, getMint } from '@solana/spl-token';

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

async function sendSplToken(sender: SolanaAddressData, receiver: string, tokenMint: string, amount: string | number){
    var senderKeypair = buildKeypairFromStringSecret(sender.privateKey)
    var receiverPubkey = new web3.PublicKey(receiver)
    var tokenPubkey = new web3.PublicKey(tokenMint)
    var mintData = getMint(conn, tokenPubkey)

    amount = (typeof amount == 'string')?parseInt(amount):amount

    var fromTokenAccount = await getOrCreateAssociatedTokenAccount(conn, senderKeypair, tokenPubkey, senderKeypair.publicKey)
    var toTokenAccount = await getOrCreateAssociatedTokenAccount(conn, senderKeypair, tokenPubkey, receiverPubkey)
    let tx = new web3.Transaction();
    tx.add(
        createTransferCheckedInstruction(
          fromTokenAccount.address, // from
          tokenPubkey, // mint
          toTokenAccount.address, // to
          senderKeypair.publicKey, // from's owner
          amount, // amount
          (await mintData).decimals // decimals
        )
      );
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash
    tx.sign(senderKeypair)
    return tx.serialize()
}

async function sendTx(rawTx: Buffer){
    return (await conn.sendRawTransaction(rawTx))
}

function saveCredentials(creds: SolanaAddressData): Boolean{
    if (typeof creds.publicKey == 'undefined' || typeof creds.privateKey == 'undefined'){
        return false
    }
    var existingCredsStr = fs.readFileSync(path.join(path.basename(__dirname), "storedKeys/sol-accounts.json"))
    var existingCreds = JSON.parse(existingCredsStr.toString())
    if (!Object.keys(existingCreds).includes(creds.publicKey)){
        existingCreds[creds.publicKey] = creds.privateKey
    }
    fs.writeFileSync(path.join(path.basename(__dirname), "storedKeys/sol-accounts.json"), JSON.stringify(existingCreds))
    return true
}

export {updateBalances, findNewDeposits, sendTransaction, createTransaction, generateAddr, sendTx, saveCredentials, sendSplToken, updateSplBalance, findNewSplDeposits}