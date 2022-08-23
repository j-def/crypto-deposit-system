import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as bitcore from 'bitcore-lib';
import axios from 'axios';
import fs from 'fs'
import path from 'path'

const ECPair = ECPairFactory(ecc);
const TESTNET = bitcoin.networks.testnet;

interface BitcoinAddressData {
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

function generateBitcoinAddress():BitcoinAddressData   {
    //generates a new bitcoin address public key and private key pair
    var keyPair = ECPair.makeRandom();
    var { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: TESTNET, });

    return {publicKey: address, privateWIF: keyPair.toWIF()}
}

async function createTransaction(sender: BitcoinAddressData, receiver: string, satoshiAmt: number): Promise<string>{
    //creates a transaction

    if (sender.publicKey == undefined){
        return ""
    }

    var result = await axios.get(`https://sochain.com/api/v2/get_tx_unspent/BTCTEST/${sender.publicKey}`);

    let totalAmountAvailable = 0;
    let inputCount = 0;
    let outputCount = 2;
    let inputs: bitcore.Transaction.UnspentOutput[] = [];

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
        let utxoModified = new bitcore.Transaction.UnspentOutput(utxo)
        inputs.push(utxoModified);
        });


    var privateKey = new bitcore.PrivateKey(sender.privateWIF);

    var transaction = new bitcore.Transaction().from(inputs)
        .to(receiver, satoshiAmt)
        .change(sender.publicKey)
        .sign(privateKey);

    return transaction.serialize();
}

async function findNewDeposits(receiver: string): Promise<BalanceChanges>{
        //Finds new deposits after running this function
        //Retries 60 times and waits 5 seconds between each retry
        var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/btc-balances.json'));
        var customerData = JSON.parse(balancesData.toString())[receiver];
    
        let retryAmt = 60
        let tries = 0
        var shouldEnd = false
        var changes = {confirmed: "", unconfirmed: "", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
        while (tries < retryAmt){
            var result = await axios.get(`https://sochain.com/api/v2/get_address_balance/BTCTEST/${receiver}`);
            if (result.data.data.confirmed_balance !== customerData.confirmed){
                changes.confirmedUpdatedBy = parseFloat(changes.confirmed) - parseFloat(result.data.data.confirmed_balance)
                changes.confirmed = result.data.data.confirmed_balance
                shouldEnd = true
            }
            if (result.data.data.unconfirmed_balance !== customerData.unconfirmed){
                changes.unconfirmedUpdatedBy = parseFloat(changes.unconfirmed) - parseFloat(result.data.data.unconfirmed_balance)
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
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/btc-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (!Object.keys(customerData).includes(receiver)){
        customerData[receiver] = {confirmed: "0", unconfirmed: "0"}
    }

    if (typeof changesMade == 'undefined'){
        changesMade = {confirmed: "", unconfirmed: "", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
        var result = await axios.get(`https://sochain.com/api/v2/get_address_balance/BTCTEST/${receiver}/6`);
        changesMade.confirmed = result.data.data.confirmed_balance
        changesMade.unconfirmed = result.data.data.unconfirmed_balance
    }

    customerData[receiver].confirmed = changesMade.confirmed
    customerData[receiver].unconfirmed = changesMade.unconfirmed

    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/btc-balances.json'), JSON.stringify(customerData));

    return changesMade
}



export {generateBitcoinAddress, createTransaction, findNewDeposits, updateBalances}