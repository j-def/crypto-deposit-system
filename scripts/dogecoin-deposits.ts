import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as bitcore from 'bitcore-lib';
const dogecore = require('dogecore-lib')
import axios from 'axios';
import fs from 'fs'
import path from 'path'

const ECPair = ECPairFactory(ecc);
const coininfo = require('coininfo')
const doge = coininfo.dogecoin.test
const dogeNetwork = doge.toBitcoinJS()
dogeNetwork.messagePrefix = '\x18Dogecoin Signed Message:\n'

interface DogeAddressData {
    publicKey: string | undefined,
    privateWIF: string | undefined
}

interface Temputxo{
    satoshis: number,
    script: string,
    address: string,
    txId: string,
    outputIndex: string
}

interface BalanceChanges {
    confirmed: string, 
    unconfirmed: string, 
    confirmedUpdatedBy: number, 
    unconfirmedUpdatedBy: number
}

function generateDogeAddress():DogeAddressData   {
    //generates a new Doge address public key and private key pair
    var keyPair = ECPair.makeRandom({ network: dogeNetwork });
    var { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: dogeNetwork });

    return {publicKey: address, privateWIF: keyPair.toWIF()}
}


async function findNewDeposits(receiver: string): Promise<BalanceChanges>{
        //Finds new deposits after running this function
        //Retries 60 times and waits 5 seconds between each retry
        var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/doge-balances.json'));
        var customerData = JSON.parse(balancesData.toString());
        var changes = {confirmed: "0.00000000", unconfirmed: "0.00000000", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}

        if (Object.keys(customerData).includes(receiver)){
            changes.confirmed = customerData[receiver].confirmed
            changes.unconfirmed = customerData[receiver].unconfirmed
        }
        let retryAmt = 60
        let tries = 0
        var shouldEnd = false
        while (tries < retryAmt){
            var result = await axios.get(`https://sochain.com/api/v2/get_address_balance/DOGETEST/${receiver}`);
            if (result.data.data.confirmed_balance !== changes.confirmed){
                changes.confirmedUpdatedBy = parseFloat(result.data.data.confirmed_balance) - parseFloat(changes.confirmed)
                changes.confirmed = result.data.data.confirmed_balance
                shouldEnd = true
            }
            if (result.data.data.unconfirmed_balance !== changes.unconfirmed){
                changes.unconfirmedUpdatedBy = parseFloat(result.data.data.unconfirmed_balance) - parseFloat(changes.unconfirmed)
                changes.unconfirmed = result.data.data.unconfirmed_balance
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
    //Updates the balances.json with an updated confirmed and unconfirmed balance
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/doge-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (!Object.keys(customerData).includes(receiver)){
        customerData[receiver] = {confirmed: "0.00000000", unconfirmed: "0.00000000"}
    }

    if (typeof changesMade == 'undefined'){
        changesMade = {confirmed: "", unconfirmed: "", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
        var result = await axios.get(`https://sochain.com/api/v2/get_address_balance/DOGETEST/${receiver}`);
        changesMade.confirmed = result.data.data.confirmed_balance
        changesMade.unconfirmed = result.data.data.unconfirmed_balance
        console.log(result.data)
    }

    customerData[receiver].confirmed = changesMade.confirmed
    customerData[receiver].unconfirmed = changesMade.unconfirmed

    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/doge-balances.json'), JSON.stringify(customerData));

    return changesMade
}

async function createTransaction(sender: DogeAddressData, receiver: string, satoshiAmt: number){
    dogecore.Networks.defaultNetwork = dogecore.Networks.testnet
    var privateKey = new dogecore.PrivateKey(sender.privateWIF);
    var result = await axios.get(`https://sochain.com/api/v2/get_tx_unspent/DOGETEST/${sender.publicKey}`);
    let totalAmountAvailable = 0;
    let inputCount = 0;
    let outputCount = 2;
    var inputs: typeof dogecore.Transaction.UnspentOutput[] = []

    result.data.data.txs.forEach(async (element: any) => {
        let utxo: Temputxo = {
            satoshis: Math.floor(Number(element.value) * 100000000),
            script: element.script_hex,
            address: result.data.data.address,
            txId: element.txid,
            outputIndex: element.output_no
        };
        totalAmountAvailable += utxo.satoshis;
        inputCount += 1;
        let utxoModified = new dogecore.Transaction.UnspentOutput(utxo)
        inputs.push(utxoModified);
    });

    console.log(inputs)

    var privateKey = new dogecore.PrivateKey(sender.privateWIF);

    var transaction = new dogecore.Transaction().from(inputs)
    .to(receiver, satoshiAmt)
    .change(sender.publicKey)
    .sign(privateKey);

    return transaction.serialize();
    
}

async function sendTx(txData: string){
    await axios.post("https://sochain.com/api/v2/send_tx/DOGETEST", {"tx_hex": txData})
}

function saveCredentials(creds: DogeAddressData): Boolean{
    if (typeof creds.publicKey == 'undefined' || typeof creds.privateWIF == 'undefined'){
        return false
    }
    var existingCredsStr = fs.readFileSync(path.join(path.basename(__dirname), "storedKeys/doge-accounts.json"))
    var existingCreds = JSON.parse(existingCredsStr.toString())
    if (!Object.keys(existingCreds).includes(creds.publicKey)){
        existingCreds[creds.publicKey] = creds.privateWIF
    }
    fs.writeFileSync(path.join(path.basename(__dirname), "storedKeys/doge-accounts.json"), JSON.stringify(existingCreds))
    return true
}

export {generateDogeAddress, createTransaction, findNewDeposits, updateBalances, sendTx, saveCredentials}