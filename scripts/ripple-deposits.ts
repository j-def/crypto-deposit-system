import * as xrpl from 'xrpl'
import * as crypto from 'crypto'
import fs from 'fs'
import path from  'path'
import base58 from 'base58-encode'

interface XRPAddressData {
    publicKey: string | undefined,
    classicAddress: string | undefined,
    privateKey: string | undefined
}

interface BalanceChanges{
    confirmed: string,
    confirmedUpdatedBy: number
}

const client = new xrpl.Client("wss://s.altnet.rippletest.net/")

function generateAddr(): XRPAddressData{
    var seed = crypto.randomBytes(64)
    const seedWallet = xrpl.Wallet.fromEntropy(seed)
    return {publicKey: seedWallet.publicKey, classicAddress: seedWallet.classicAddress, privateKey: seedWallet.privateKey}
}

async function createTransaction(sender: XRPAddressData, receiver: string, sendAmt: string): Promise<string | undefined>{
    if (typeof sender.privateKey     == 'undefined'|| 
        typeof sender.publicKey      == 'undefined'|| 
        typeof sender.classicAddress == 'undefined'){
        return undefined
    }
    await client.connect()
    var signerWallet = new xrpl.Wallet(sender.publicKey, sender.privateKey)
    var txData = await client.autofill({
        "TransactionType": "Payment",
        "Account": sender.classicAddress,
        "Amount": xrpl.xrpToDrops(sendAmt),
        "Destination": receiver
  })
  await client.disconnect()
  var signedTx = signerWallet.sign(txData)
  return signedTx.tx_blob
}

async function findNewDeposits(receiver: string): Promise<BalanceChanges>{
    await client.connect()
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/xrp-balances.json'));
    var customerData = JSON.parse(balancesData.toString())[receiver];

    var updatedBalance = {
        'confirmed': customerData.confirmed,
        'confirmedUpdatedBy': 0
    }

    var tryNum = 0
    var maxTries = 60
    let breakFromLoop = false
    while (tryNum < maxTries){
        var balances = await client.getBalances(receiver)
        balances.forEach((item, idx) => {
            if (item.currency == 'XRP' && item.value != customerData.confirmed){
                updatedBalance.confirmed = item.value
                updatedBalance.confirmedUpdatedBy = parseFloat(xrpl.dropsToXrp(parseInt(xrpl.xrpToDrops(item.value)) - parseInt(xrpl.xrpToDrops(customerData.confirmed))))
                breakFromLoop = true
                return
            }
        })
        if (breakFromLoop){
            break
        }
        tryNum++
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    await client.disconnect()
    return updatedBalance
}

async function updateBalances(receiver: string, changesMade: BalanceChanges | undefined = undefined): Promise<BalanceChanges | undefined>{
    //Updates the balances.json with an updated confirmed and unconfirmed balance
    var balancesData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/xrp-balances.json'));
    var customerData = JSON.parse(balancesData.toString());

    if (typeof changesMade == 'undefined'){
        await client.connect()
        var balances = await client.getBalances(receiver)
        changesMade = {
            'confirmed': "0",
            'confirmedUpdatedBy': 0
        }
        balances.forEach((item, idx) => {
            if (item.currency == 'XRP'){
                changesMade = {
                    'confirmed': item.value,
                    'confirmedUpdatedBy': 0
                }
            }
        })

        await client.disconnect()
    }

    if (typeof customerData[receiver] == 'undefined'){
        customerData[receiver] = {
            confirmed: changesMade.confirmed,
            unconfirmed: 0
        }
    }

    customerData[receiver].confirmed = changesMade.confirmed
    customerData[receiver].unconfirmed = 0
    fs.writeFileSync(path.join(path.dirname(__dirname), 'balances/xrp-balances.json'), JSON.stringify(customerData));
    return changesMade
}




var add = {
    publicKey: 'EDA7DA270D9 C4D7B876E0D892D094FC6947CFC1B7CBE1781772117A462407A0DB0',
    classicAddress: 'rmVGsdqBwBwccfmQUvKFmh7cZupCm2h9o',
    privateKey: 'ED831830C1CD8CF75EA7AFE11AF0CDCA3FA61294630A216D5E9D567F6AB89B1DB5'
}

findNewDeposits(add.classicAddress).then((resp) => {
    updateBalances(add.classicAddress, resp)
})