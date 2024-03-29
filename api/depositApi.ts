import * as crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import * as utils from './utils'
import * as bsc from '../scripts/binance-deposits'
import * as eth from '../scripts/ethereum-deposits'
import * as btc from '../scripts/bitcoin-deposits'
import * as ltc from '../scripts/litecoin-deposits'
import * as doge from '../scripts/dogecoin-deposits'
import * as sol from '../scripts/solana-deposits'
import * as xrp from '../scripts/ripple-deposits'

interface Transaction{
    Id: string,
    URL: string,
    Vendor: string,
    Chains: string[],
    Items: ReceiptItem[],
    SuccessCallbackURL: string,
    FailureCallbackURL: string,
    Status: string
}
interface ReceiptItem{
    Name: string,
    Price: number,
    Description: string,
    ItemId: string
}
interface VendorOptions{
    AcceptedChains: string[],
    AcceptedContracts: string[]
}
interface SmartContractConnection{
    Chain: string,
    Address: string
}
interface ItemData{
    name: string,
    description: string,
    price: number,
    denomination: string
    itemId?: string,
}

/*
Transaction Endpoint

POST - /transaction - Creates a new transaction
GET - /transaction/{txid} - Gets a transactions data
DELETE - /transaction/{txid} - Cancels a transaction
*/

const postTransaction = (vendor: string, itemIds: string[], successCallback: string, failureCallback: string) => {
    let txid = crypto.randomBytes(14).toString('hex')
    let url = "https://www.example.com/checkout/"+txid.slice(0, 14)

    let vendorJsonBuffer = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorData = JSON.parse(vendorJsonBuffer.toString())
    let itemData = itemIds.map((val) => (
        vendorData[vendor].items[val]
    ))
    let chains = vendorData[vendor].acceptedChains

    let txDataStr = fs.readFileSync(path.join(__dirname, 'transactionData.json'))
    let txDataJson = JSON.parse(txDataStr.toString())

    while (Object.keys(txDataJson).includes(txid)){
        txid = crypto.randomBytes(14).toString('hex')
        url = "https://www.example.com/checkout/"+txid.slice(0, 14)
    }
    let txData: Transaction = {Id: txid, URL: url, Vendor: vendor, Chains: chains, Items: itemData, SuccessCallbackURL: successCallback, FailureCallbackURL: failureCallback, Status: "Unpaid"}
    txDataJson[txid] = txData

    fs.writeFileSync(path.join(__dirname, 'transactionData.json'), JSON.stringify(txDataJson));
    return txData
}

const deleteTransaction = (vendor: string, txid: string) => {
    let txDataStr = fs.readFileSync(path.join(__dirname, 'transactionData.json'))
    let txDataJson = JSON.parse(txDataStr.toString())

    if (!Object.keys(txDataJson).includes(txid) || txDataJson[txid].Status.toLowerCase() == "paid"){
        return false
    }

    let txArchinvedDataStr = fs.readFileSync(path.join(__dirname, 'archivedTransactions.json'))
    let txArchinvedDataJson = JSON.parse(txArchinvedDataStr.toString())

    txArchinvedDataJson[txid] = txDataJson[txid]
    delete txDataJson[txid]
    fs.writeFileSync(path.join(__dirname, 'archivedTransactions.json'), JSON.stringify(txArchinvedDataJson));
    fs.writeFileSync(path.join(__dirname, 'transactionData.json'), JSON.stringify(txDataJson));
    return true
}

const getTransaction = (txid: string) => {
    let txDataStr = fs.readFileSync(path.join(__dirname, 'transactionData.json'))
    let txDataJson = JSON.parse(txDataStr.toString())
    return txDataJson[txid]
}

/*
Menu Endpoint

GET - /menu - Retreives the menu items
POST - /menu - Adds a new menu item
PUT - /menu - Replaces menu

PATCH - /menu/{itemid} - Updates a menu item
DELETE - /menu/{itemid} - Deletes a menu item
*/

const getMenu = (vendorid: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())

    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    return Object.values(vendorDataJson[vendorid].items)
}

const postMenu = (vendorid: string, newItem: ItemData) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    let itemid = crypto.randomBytes(7).toString('hex')
    while (Object.keys(vendorDataJson[vendorid].items).includes(itemid)){
        itemid = crypto.randomBytes(7).toString('hex')
    }
    newItem.itemId = itemid
    vendorDataJson[vendorid].items[itemid] = newItem
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const putMenu = (vendorid: string, newItems: ItemData[]) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    newItems.forEach((item) => {
        item.itemId = crypto.randomBytes(7).toString('hex')
    })
    let itemIdList = newItems.map((item) => (
        item.itemId
    ))
    itemIdList.forEach((elem, idx, arr) => {
        while (!utils.isUniqueItem(arr, elem)){
            newItems[idx].itemId = crypto.randomBytes(7).toString('hex')
        }
    })
    vendorDataJson[vendorid].items = newItems
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

interface PatchMenuItemUpdate{
    setKey: string,
    setValue: string | number
}

const patchMenuItem = (vendorid: string, itemId: string, update: PatchMenuItemUpdate) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid) || !Object.keys(vendorDataJson[vendorid].items).includes(itemId)){
        return false
    }
    vendorDataJson[vendorid].items[itemId][update.setKey] = update.setValue

    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const deleteMenuItem = (vendorid: string, itemId: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid) || !Object.keys(vendorDataJson[vendorid].items).includes(itemId)){
        return false
    }
    delete vendorDataJson[vendorid].items[itemId]
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

/*
Accepted Chains Endpoint

GET - /accaptedchains - Retreives the accepted chains
POST - /accaptedchains - Adds an accepted chain
PUT - /accaptedchains - Replaces accepted chains
DELETE - /accaptedchains - Deletes an accepted chain
*/

const getAcceptedChains = (vendorid: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    return vendorDataJson[vendorid].acceptedChains
}

const postAcceptedChains = (vendorid: string, newChain: string) => {
        //chain Options : ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge", "erc20", "bep20", "spl"]

    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    if (utils.countItems(vendorDataJson[vendorid].acceptedChains, newChain) == 0){
        vendorDataJson[vendorid].acceptedChains.push(newChain)
    }
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const putAcceptedChains = (vendorid: string, newChains: string[]) => {
        //chain Options : ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge", "erc20", "bep20", "spl"]

    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    vendorDataJson[vendorid].acceptedChains = newChains
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const deleteAcceptedChains = (vendorid: string, oldChain: string) => {
        //chain Options : ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge", "erc20", "bep20", "spl"]

    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    if (utils.countItems(vendorDataJson[vendorid].acceptedChains, oldChain) !== 0){
        delete vendorDataJson[vendorid].acceptedChains[oldChain]
    }
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

/*
Balances Endpoint

GET - /balance - Retreives the balance from all chains
PUT - /balance - Update all balances in all chains

GET - /balance/{chain} - Retreives balance from all chain addresses
PUT - /balance/{chain} - Updates the blanace of all addresses in the chain

GET - /balance/{chain}/{address} - Retreives balance from specific address and chain
PUT - /balance/{chain}/{address} - Updates a specific address balance and chain
*/

const getBalance = (vendorid: string) => {
    let vendorKeysStr = fs.readFileSync(path.join(__dirname, 'vendorOwnedKeys.json'))
    let vendorKeysJson = JSON.parse(vendorKeysStr.toString())
    if (!Object.keys(vendorKeysJson).includes(vendorid)){
        return false
    }
    var balances: any = {}
    let ownedKeys = vendorKeysJson[vendorid]
    for (var chain in ownedKeys){
        let chainBalancesStr = fs.readFileSync(path.join(path.dirname(__dirname), `balances/${chain}-balances.json`))
        let chainBalancesJson = JSON.parse(chainBalancesStr.toString())
        balances[chain] = {"confirmed": 0, "unconfirmed": 0}
        ownedKeys[chain].forEach(( pubkey: string ) => {
            balances[chain].confirmed += parseFloat(chainBalancesJson[pubkey].confirmed)
            balances[chain].unconfirmed += Object.keys(chainBalancesJson[pubkey]).includes("unconfirmed")?parseFloat(chainBalancesJson[pubkey].unconfirmed):0
        })
        let customToken = ""
        switch(chain){
            case "eth":
                customToken = "erc20"
                break
            case "sol":
                customToken = "spl"
                break
            case "bsc":
                customToken = "bep20"
                break
            default:
                break
        }
        if (!customToken){
            continue
        }

        //get custom token balances
        chainBalancesStr = fs.readFileSync(path.join(path.dirname(__dirname), `balances/${customToken}-balances.json`))
        chainBalancesJson = JSON.parse(chainBalancesStr.toString())
        balances[customToken] = {"confirmed": 0, "unconfirmed": 0}
        ownedKeys[chain].forEach(( pubkey: string ) => {
            for (let tokenAddress in chainBalancesJson){
                if (!Object.keys(chainBalancesJson[tokenAddress]).includes(pubkey)){
                    continue
                }
                balances[customToken].confirmed += parseFloat(chainBalancesJson[pubkey].confirmed)
                balances[customToken].unconfirmed += Object.keys(chainBalancesJson[pubkey]).includes("unconfirmed")?parseFloat(chainBalancesJson[pubkey].unconfirmed):0
            }
        })

    }

}

const putBalance = (vendorid: string) => {
    let vendorKeysStr = fs.readFileSync(path.join(__dirname, 'vendorOwnedKeys.json'))
    let vendorKeysJson = JSON.parse(vendorKeysStr.toString())
    if (!Object.keys(vendorKeysJson).includes(vendorid)){
        return false
    }
    var chainList = ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge"]
    let balances: any = {}
    
    for (var chain of chainList){
        switch(chain){
            case "eth":
                var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/erc20-balances.json'));
                var CustomTokensData = JSON.parse(customTokensData.toString());
    
                vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                    balances[chain][pubkey] = eth.updateBalances(pubkey)
                    for (var tokenAddress in CustomTokensData){
                        if (CustomTokensData[tokenAddress].includes(pubkey)){
                            balances['erc20'][tokenAddress][pubkey] = eth.updateErc20Balance(pubkey, tokenAddress)
                        }
                    }
                })
    
                break
            case "btc":
                vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                    balances[chain] = btc.updateBalances(pubkey)
                })
                break
            case "ltc":
                vendorKeysJson[vendorid][chain].forEach((pubkey: string ) => {
                    balances[chain] = ltc.updateBalances(pubkey)
                })
                break
            case "doge":
                vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                    balances[chain] = doge.updateBalances(pubkey)
                })
                break
            case "xrp":
                vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                    balances[chain] = xrp.updateBalances(pubkey)
                })
                break
            case "bsc":
                var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bep20-balances.json'));
                var CustomTokensData = JSON.parse(customTokensData.toString());
    
                vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                    balances[chain][pubkey] = bsc.updateBalances(pubkey)
                    for (var tokenAddress in CustomTokensData){
                        if (CustomTokensData[tokenAddress].includes(pubkey)){
                            balances['bep20'][tokenAddress][pubkey] = bsc.updateBep20Balance(pubkey, tokenAddress)
                        }
                    }
                })
                break
            case "sol":
                var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/spl-balances.json'));
                var CustomTokensData = JSON.parse(customTokensData.toString());
    
                vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                    balances[chain][pubkey] = sol.updateBalances(pubkey)
                    for (var tokenAddress in CustomTokensData){
                        if (CustomTokensData[tokenAddress].includes(pubkey)){
                            balances['spl'][tokenAddress][pubkey] = sol.updateSplBalance(pubkey, tokenAddress)
                        }
                    }
                })
                break
        }
    }
    return balances
}

const getBalanceChain = (vendorid: string, chain: string) => {
        //chain Options : ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge", "erc20", "bep20", "spl"]

    let vendorKeysStr = fs.readFileSync(path.join(__dirname, 'vendorOwnedKeys.json'))
    let vendorKeysJson = JSON.parse(vendorKeysStr.toString())
    if (!Object.keys(vendorKeysJson).includes(vendorid)){
        return false
    }
    var balances: any = {}
    let ownedKeys = vendorKeysJson[vendorid]
    if (chain !== "erc20" && chain !== "bep20" && chain !== "spl"){
        balances[chain] = {"confirmed": 0, "unconfirmed": 0}
        let chainBalancesStr = fs.readFileSync(path.join(path.dirname(__dirname), `balances/${chain}-balances.json`))
        let chainBalancesJson = JSON.parse(chainBalancesStr.toString())
        ownedKeys[chain].forEach(( pubkey: string ) => {
            balances[chain].confirmed += parseFloat(chainBalancesJson[pubkey].confirmed)
            balances[chain].unconfirmed += Object.keys(chainBalancesJson[pubkey]).includes("unconfirmed")?parseFloat(chainBalancesJson[pubkey].unconfirmed):0
        })
    } else {
        balances[chain] = {}
        let chainBalancesStr = fs.readFileSync(path.join(path.dirname(__dirname), `balances/${chain}-balances.json`))
        let chainBalancesJson = JSON.parse(chainBalancesStr.toString())
        ownedKeys[chain].forEach(( pubkey: string ) => { 
            for (let tokenAddress in chainBalancesJson){
                if (!Object.keys(chainBalancesJson[tokenAddress]).includes(pubkey)){
                    continue
                }
                if (!Object.keys(balances[chain][tokenAddress]).includes("confirmed")){
                    balances[chain][tokenAddress] = {"confirmed": 0, "unconfirmed": 0}
                }
                balances[chain][tokenAddress].confirmed += parseFloat(chainBalancesJson[tokenAddress][pubkey].confirmed)
                balances[chain][tokenAddress].unconfirmed += Object.keys(chainBalancesJson[tokenAddress][pubkey]).includes("unconfirmed")?parseFloat(chainBalancesJson[pubkey].unconfirmed):0
            }
        })
    }
    return balances
}

const putBalanceChain = (vendorid: string, chain: string) => {
    let vendorKeysStr = fs.readFileSync(path.join(__dirname, 'vendorOwnedKeys.json'))
    let vendorKeysJson = JSON.parse(vendorKeysStr.toString())
    if (!Object.keys(vendorKeysJson).includes(vendorid)){
        return false
    }
    let balances: any = {}
    switch(chain){
        case "eth":
            var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/erc20-balances.json'));
            var CustomTokensData = JSON.parse(customTokensData.toString());

            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain][pubkey] = eth.updateBalances(pubkey)
                for (var tokenAddress in CustomTokensData){
                    if (CustomTokensData[tokenAddress].includes(pubkey)){
                        balances['erc20'][tokenAddress][pubkey] = eth.updateErc20Balance(pubkey, tokenAddress)
                    }
                }
            })

            break
        case "btc":
            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain] = btc.updateBalances(pubkey)
            })
            break
        case "ltc":
            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain] = ltc.updateBalances(pubkey)
            })
            break
        case "doge":
            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain] = doge.updateBalances(pubkey)
            })
            break
        case "xrp":
            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain] = xrp.updateBalances(pubkey)
            })
            break
        case "bsc":
            var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bep20-balances.json'));
            var CustomTokensData = JSON.parse(customTokensData.toString());

            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain][pubkey] = bsc.updateBalances(pubkey)
                for (var tokenAddress in CustomTokensData){
                    if (CustomTokensData[tokenAddress].includes(pubkey)){
                        balances['bep20'][tokenAddress][pubkey] = bsc.updateBep20Balance(pubkey, tokenAddress)
                    }
                }
            })
            break
        case "sol":
            var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/spl-balances.json'));
            var CustomTokensData = JSON.parse(customTokensData.toString());

            vendorKeysJson[vendorid][chain].forEach((pubkey: string) => {
                balances[chain][pubkey] = sol.updateBalances(pubkey)
                for (var tokenAddress in CustomTokensData){
                    if (CustomTokensData[tokenAddress].includes(pubkey)){
                        balances['spl'][tokenAddress][pubkey] = sol.updateSplBalance(pubkey, tokenAddress)
                    }
                }
            })
            break
    }
    return balances
}

const getBalanceChainAddress = (vendorid: string, chain: string, pubkey: string) => {
    //chain Options : ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge", "erc20", "bep20", "spl"]

    let vendorKeysStr = fs.readFileSync(path.join(__dirname, 'vendorOwnedKeys.json'))
    let vendorKeysJson = JSON.parse(vendorKeysStr.toString())
    let balances: any = {}
    if (!Object.keys(vendorKeysJson).includes(vendorid) || !vendorKeysJson[vendorid][chain].includes(pubkey)){
        return false
    }
    if (chain !== "erc20" && chain !== "bep20" && chain !== "spl"){
        balances[chain] = {"confirmed": 0, "unconfirmed": 0}
        let chainBalancesStr = fs.readFileSync(path.join(path.dirname(__dirname), `balances/${chain}-balances.json`))
        let chainBalancesJson = JSON.parse(chainBalancesStr.toString())
        balances[chain].confirmed += parseFloat(chainBalancesJson[pubkey].confirmed)
        balances[chain].unconfirmed += Object.keys(chainBalancesJson[pubkey]).includes("unconfirmed")?parseFloat(chainBalancesJson[pubkey].unconfirmed):0
    }
    else {
        balances[chain] = {}
        let chainBalancesStr = fs.readFileSync(path.join(path.dirname(__dirname), `balances/${chain}-balances.json`))
        let chainBalancesJson = JSON.parse(chainBalancesStr.toString())
        for (let tokenAddress in chainBalancesJson){
            if (!Object.keys(chainBalancesJson[tokenAddress]).includes(pubkey)){
                continue
            }
            if (!Object.keys(balances[chain][tokenAddress]).includes("confirmed")){
                balances[chain][tokenAddress] = {"confirmed": 0, "unconfirmed": 0}
            }
            balances[chain][tokenAddress].confirmed += parseFloat(chainBalancesJson[tokenAddress][pubkey].confirmed)
            balances[chain][tokenAddress].unconfirmed += Object.keys(chainBalancesJson[tokenAddress][pubkey]).includes("unconfirmed")?parseFloat(chainBalancesJson[pubkey].unconfirmed):0
        }
    }
    return balances
}

const putBalanceChainAddress = (vendorid: string, chain: string, pubkey: string) => {
    //chainOptions : ["eth", "btc", "bsc", "sol", "xrp", "ltc", "doge"]
    let vendorKeysStr = fs.readFileSync(path.join(__dirname, 'vendorOwnedKeys.json'))
    let vendorKeysJson = JSON.parse(vendorKeysStr.toString())
    if (!Object.keys(vendorKeysJson).includes(vendorid) || !vendorKeysJson[vendorid][chain].includes(pubkey)){
        return false
    }
    var balances: any = {}
    switch(chain){
        case "eth":
            balances[chain] = eth.updateBalances(pubkey)
            var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/erc20-balances.json'));
            var CustomTokensData = JSON.parse(customTokensData.toString());
            for (var tokenAddress in CustomTokensData){
                if (Object.keys(CustomTokensData[tokenAddress]).includes(pubkey)){
                    balances[tokenAddress] =eth.updateErc20Balance(pubkey, tokenAddress)
                }
            }
            break
        case "btc":
            balances[chain] = btc.updateBalances(pubkey)
            break
        case "ltc":
            balances[chain] = ltc.updateBalances(pubkey)
            break
        case "doge":
            balances[chain] = doge.updateBalances(pubkey)
            break
        case "xrp":
            balances[chain] = xrp.updateBalances(pubkey)
            break
        case "bsc":
            balances[chain] = bsc.updateBalances(pubkey)
            var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/bep20-balances.json'));
            var CustomTokensData = JSON.parse(customTokensData.toString());
            for (var tokenAddress in CustomTokensData){
                if (Object.keys(CustomTokensData[tokenAddress]).includes(pubkey)){
                    balances[tokenAddress] = bsc.updateBep20Balance(pubkey, tokenAddress)
                }
            }
            break
        case "sol":
            balances[chain] = sol.updateBalances(pubkey)
            var customTokensData = fs.readFileSync(path.join(path.dirname(__dirname), 'balances/erc20-balances.json'));
            var CustomTokensData = JSON.parse(customTokensData.toString());
            for (var tokenAddress in CustomTokensData){
                if (Object.keys(CustomTokensData[tokenAddress]).includes(pubkey)){
                    balances[tokenAddress] = sol.updateSplBalance(pubkey, tokenAddress)
                }
            }
            break
    }
    return balances
}
