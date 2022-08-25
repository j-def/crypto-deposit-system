import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
const coininfo = require('coininfo')
import fs from 'fs'
import path from 'path'
import axios from 'axios'

const litecore = require('litecore-lib')

const ltc = coininfo.litecoin.test
const ltcNetwork = ltc.toBitcoinJS()
const ECPair = ECPairFactory(ecc);

interface LitecoinAddressData {
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

function generateLtcAddr(): LitecoinAddressData{
    const keyPair = ECPair.makeRandom({ network: ltcNetwork });
    const { address } = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: ltcNetwork,
    });

    return {publicKey: address, privateWIF: keyPair.toWIF()}
}



async function findNewDeposits(receiver: string): Promise<BalanceChanges>{
    //Finds new deposits after running this function
    //Retries 60 times and waits 5 seconds between each retry
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/ltc-balances.json'));
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
        var result = await axios.get(`https://sochain.com/api/v2/get_address_balance/LTCTEST/${receiver}`);
        if (result.data.data.confirmed_balance !== parseInt(changes.confirmed)){
            changes.confirmedUpdatedBy = parseFloat(changes.confirmed) - parseFloat(result.data.data.confirmed_balance)
            changes.confirmed = result.data.data.confirmed_balance
            shouldEnd = true
        }
        if (result.data.data.unconfirmed_balance !== parseInt(changes.unconfirmed)){
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
var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/ltc-balances.json'));
var customerData = JSON.parse(balancesData.toString());

if (!Object.keys(customerData).includes(receiver)){
    customerData[receiver] = {confirmed: "0", unconfirmed: "0"}
}

if (typeof changesMade == 'undefined'){
    changesMade = {confirmed: "", unconfirmed: "", confirmedUpdatedBy: 0, unconfirmedUpdatedBy: 0}
    var result = await axios.get(`https://sochain.com/api/v2/get_address_balance/LTCTEST/${receiver}`);
    changesMade.confirmed = result.data.data.confirmed_balance
    changesMade.unconfirmed = result.data.data.unconfirmed_balance
}

customerData[receiver].confirmed = changesMade.confirmed
customerData[receiver].unconfirmed = changesMade.unconfirmed

fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/ltc-balances.json'), JSON.stringify(customerData));

return changesMade
}

async function createTransaction(sender: LitecoinAddressData, receiver: string, satoshiAmt: number){
    litecore.Networks.defaultNetwork = litecore.Networks.testnet
    var privateKey = new litecore.PrivateKey(sender.privateWIF);
    var result = await axios.get(`https://sochain.com/api/v2/get_tx_unspent/LTCTEST/${sender.publicKey}`);
    let totalAmountAvailable = 0;
    let inputCount = 0;
    let outputCount = 2;
    var inputs: typeof litecore.Transaction.UnspentOutput[] = []

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
        let utxoModified = new litecore.Transaction.UnspentOutput(utxo)
        inputs.push(utxoModified);
    });

    console.log(inputs)

    var privateKey = new litecore.PrivateKey(sender.privateWIF);

    var transaction = new litecore.Transaction().from(inputs)
    .to(receiver, satoshiAmt)
    .change(sender.publicKey)
    .sign(privateKey);

    return transaction.serialize();
    
}

var add1 = {
    publicKey: 'mhVECZ1mSrqmHtcKJFU19jn6Wpbb9iszAw',
    privateWIF: 'cR9H3emfNeF45LFK7JrDDbWHYJUS2Bh6WUrDNKajDzCCzeXSkNZu'
  }

var add2 = {
    publicKey: 'mz8TcgiqBYYCjo1gFKDvyGbsa9vTyAr7wG',
    privateWIF: 'cUkWnZPCbLc4RvEP4JMw4Lzi8JQUE1o268yiCs3HFLpZz2wbJgiS'
  }

createTransaction(add1, add2.publicKey, 50000) .then((val) => {
    axios.post("https://sochain.com/api/v2/send_tx/LTCTEST", {"tx_hex": val}).then((val) => {
        console.log(val.data)
    })
})